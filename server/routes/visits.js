'use strict';
const express = require('express');
const { db } = require('../db');
const { parseDate, parseAmount, nowISO, todayISO } = require('../lib/format');

const router = express.Router();

/** 방문/시술 내역 목록 (기간·고객·키워드 필터) */
router.get('/', (req, res) => {
  const where = ['1=1'];
  const params = {};
  if (req.query.customer_id) { where.push('v.customer_id = @cid'); params.cid = Number(req.query.customer_id); }
  if (req.query.from) { where.push('v.visit_date >= @from'); params.from = req.query.from; }
  if (req.query.to) { where.push('v.visit_date <= @to'); params.to = req.query.to; }
  if (req.query.q) {
    where.push('(c.name LIKE @like OR v.services LIKE @like OR v.details LIKE @like OR v.designer LIKE @like OR v.memo LIKE @like)');
    params.like = `%${req.query.q}%`;
  }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db.prepare(`
    SELECT v.*, c.name AS customer_name, c.phone_display,
           (SELECT COUNT(*) FROM photos p WHERE p.visit_id = v.id) AS photo_count
    FROM visits v JOIN customers c ON c.id = v.customer_id
    WHERE ${where.join(' AND ')}
    ORDER BY v.visit_date DESC, v.id DESC LIMIT ${limit}
  `).all(params);
  const sum = rows.reduce((a, r) => a + (r.amount || 0), 0);
  res.json({ items: rows, count: rows.length, total_amount: sum });
});

function bodyToVisit(body) {
  return {
    customer_id: Number(body.customer_id),
    visit_date: parseDate(body.visit_date) || todayISO(),
    visit_time: String(body.visit_time || '').trim(),
    services: String(body.services || '').trim(),
    details: String(body.details || '').trim(),
    designer: String(body.designer || '').trim(),
    amount: parseAmount(body.amount),
    pay_method: String(body.pay_method || '').trim(),
    memo: String(body.memo || '').trim(),
  };
}

router.post('/', (req, res) => {
  const v = bodyToVisit(req.body);
  if (!v.customer_id) return res.status(400).json({ error: '고객을 선택하세요.' });
  const exists = db.prepare('SELECT 1 FROM customers WHERE id = ?').get(v.customer_id);
  if (!exists) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
  const now = nowISO();
  const info = db.prepare(`
    INSERT INTO visits (customer_id, visit_date, visit_time, services, details, designer, amount,
                        pay_method, memo, source, import_key, created_at, updated_at)
    VALUES (@customer_id, @visit_date, @visit_time, @services, @details, @designer, @amount,
            @pay_method, @memo, 'manual', NULL, @created_at, @updated_at)
  `).run({ ...v, created_at: now, updated_at: now });
  res.status(201).json(db.prepare('SELECT * FROM visits WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: '방문 기록을 찾을 수 없습니다.' });
  const v = bodyToVisit({ ...cur, ...req.body });
  db.prepare(`
    UPDATE visits SET visit_date=@visit_date, visit_time=@visit_time, services=@services, details=@details,
      designer=@designer, amount=@amount, pay_method=@pay_method, memo=@memo, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...v, id: cur.id, updated_at: nowISO() });
  res.json(db.prepare('SELECT * FROM visits WHERE id = ?').get(cur.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM visits WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '방문 기록을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

module.exports = router;
