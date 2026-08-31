'use strict';
const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const auth = require('../auth');

const router = express.Router();

/** 대시보드 통계: 월별 매출/방문, 인기 시술, 재방문 필요 고객 */
router.get('/stats', (req, res) => {
  const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 36);
  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1), 1);
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = todayStr.slice(0, 8) + '01';

  const monthly = db.prepare(`
    SELECT substr(visit_date, 1, 7) AS month,
           COUNT(*) AS visits,
           COALESCE(SUM(amount), 0) AS amount,
           COUNT(DISTINCT customer_id) AS customers
    FROM visits WHERE visit_date >= ?
    GROUP BY month ORDER BY month
  `).all(startStr);

  const services = db.prepare(`
    SELECT services, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount
    FROM visits WHERE services <> '' AND visit_date >= ?
    GROUP BY services ORDER BY n DESC LIMIT 10
  `).all(startStr);

  const designers = db.prepare(`
    SELECT designer, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amount
    FROM visits WHERE designer <> '' AND visit_date >= ?
    GROUP BY designer ORDER BY amount DESC LIMIT 10
  `).all(startStr);

  const summary = {
    customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
    visits: db.prepare('SELECT COUNT(*) AS n FROM visits').get().n,
    photos: db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,
    revenue_total: db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM visits').get().n,
    revenue_month: db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM visits WHERE visit_date >= ?').get(monthStart).n,
    visits_month: db.prepare('SELECT COUNT(*) AS n FROM visits WHERE visit_date >= ?').get(monthStart).n,
    new_customers_month: db.prepare("SELECT COUNT(*) AS n FROM customers WHERE substr(created_at,1,7) = ?").get(todayStr.slice(0, 7)).n,
    unmatched_forms: db.prepare("SELECT COUNT(*) AS n FROM form_responses WHERE status = 'unmatched'").get().n,
  };

  // 90일 이상 방문이 없는 고객 (재방문 유도용)
  const sleeping = db.prepare(`
    SELECT c.id, c.name, c.phone_display, MAX(v.visit_date) AS last_visit_date,
           COUNT(v.id) AS visit_count
    FROM customers c JOIN visits v ON v.customer_id = c.id
    GROUP BY c.id HAVING last_visit_date < date('now', '-90 day')
    ORDER BY last_visit_date DESC LIMIT 30
  `).all();

  const upcomingBirthdays = db.prepare(`
    SELECT id, name, phone_display, birthday FROM customers
    WHERE birthday <> '' AND birthday IS NOT NULL
      AND substr(birthday, 6, 2) = strftime('%m', 'now')
    ORDER BY substr(birthday, 9, 2) LIMIT 30
  `).all();

  res.json({ summary, monthly, services, designers, sleeping, upcomingBirthdays });
});

/** 자동완성용: 지금까지 쓴 시술명·디자이너·결제수단·태그 */
router.get('/suggestions', (req, res) => {
  const list = (sql) => db.prepare(sql).all().map((r) => r.v).filter(Boolean);
  res.json({
    services: list("SELECT DISTINCT services AS v FROM visits WHERE services <> '' ORDER BY v LIMIT 100"),
    designers: list("SELECT DISTINCT designer AS v FROM visits WHERE designer <> '' ORDER BY v LIMIT 50"),
    payMethods: list("SELECT DISTINCT pay_method AS v FROM visits WHERE pay_method <> '' ORDER BY v LIMIT 20"),
    tags: [...new Set(list("SELECT tags AS v FROM customers WHERE tags <> ''").flatMap((t) => t.split(',').map((s) => s.trim())))].filter(Boolean).slice(0, 50),
  });
});

router.get('/settings', (req, res) => {
  res.json({
    shopName: getSetting('shop_name', '우리 미용실'),
    designers: getSetting('designers', []),
    serviceMenu: getSetting('service_menu', []),
    exportProfileName: getSetting('export_profile_name', '핸즈SOS'),
  });
});

router.put('/settings', (req, res) => {
  if (req.body.shopName !== undefined) setSetting('shop_name', String(req.body.shopName).slice(0, 60));
  if (Array.isArray(req.body.designers)) setSetting('designers', req.body.designers.map(String).slice(0, 50));
  if (Array.isArray(req.body.serviceMenu)) setSetting('service_menu', req.body.serviceMenu.slice(0, 200));
  res.json({ ok: true });
});

router.post('/settings/password', (req, res) => {
  if (!auth.verifyPassword(req.body.current)) {
    return res.status(403).json({ error: '현재 비밀번호가 맞지 않습니다.' });
  }
  const next = String(req.body.next || '');
  if (next.length < 6) return res.status(400).json({ error: '새 비밀번호는 6자 이상이어야 합니다.' });
  auth.setPassword(next);
  res.json({ ok: true });
});

/** 전체 데이터 백업 (사진 파일은 data/uploads 폴더를 따로 복사) */
router.get('/backup', (req, res) => {
  const dump = {
    exported_at: new Date().toISOString(),
    customers: db.prepare('SELECT * FROM customers').all(),
    visits: db.prepare('SELECT * FROM visits').all(),
    photos: db.prepare('SELECT * FROM photos').all(),
    form_responses: db.prepare('SELECT * FROM form_responses').all(),
    settings: db.prepare("SELECT key, value FROM settings WHERE key <> 'password' AND key <> 'session_secret'").all(),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`백업_${new Date().toISOString().slice(0, 10)}.json`)}`);
  res.send(JSON.stringify(dump, null, 2));
});

module.exports = router;
