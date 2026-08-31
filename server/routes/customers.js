'use strict';
const express = require('express');
const { db } = require('../db');
const { normalizePhone, formatPhone, nowISO } = require('../lib/format');

const router = express.Router();

const AGG = `
  (SELECT COUNT(*) FROM visits v WHERE v.customer_id = c.id) AS visit_count,
  (SELECT COALESCE(SUM(v.amount),0) FROM visits v WHERE v.customer_id = c.id) AS total_amount,
  (SELECT MAX(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS last_visit_date,
  (SELECT v.services FROM visits v WHERE v.customer_id = c.id ORDER BY v.visit_date DESC, v.id DESC LIMIT 1) AS last_services,
  (SELECT COUNT(*) FROM photos p WHERE p.customer_id = c.id) AS photo_count`;

const SORTS = {
  recent: 'last_visit_date IS NULL, last_visit_date DESC, c.updated_at DESC',
  name: 'c.name COLLATE NOCASE ASC',
  visits: 'visit_count DESC, c.name COLLATE NOCASE',
  amount: 'total_amount DESC, c.name COLLATE NOCASE',
  created: 'c.id DESC',
};

/** 고객 목록: 이름/연락처/메모/태그 검색 */
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const order = SORTS[req.query.sort] || SORTS.recent;

  const where = [];
  const params = {};
  if (q) {
    // 검색어에 숫자가 있을 때만 정규화된 번호까지 같이 찾는다
    const digits = normalizePhone(q);
    const conditions = ['c.name LIKE @like', 'c.phone_display LIKE @like', 'c.memo LIKE @like', 'c.tags LIKE @like'];
    params.like = `%${q}%`;
    if (digits) {
      conditions.push('c.phone LIKE @digits');
      params.digits = `%${digits}%`;
    }
    where.push(`(${conditions.join(' OR ')})`);
  }
  if (req.query.tag) { where.push('c.tags LIKE @tag'); params.tag = `%${req.query.tag}%`; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT c.*, ${AGG} FROM customers c ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`
  ).all(params);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM customers c ${whereSql}`).get(params).n;
  res.json({ total, items: rows });
});

router.get('/:id', (req, res) => {
  const customer = db.prepare(`SELECT c.*, ${AGG} FROM customers c WHERE c.id = ?`).get(req.params.id);
  if (!customer) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
  const visits = db.prepare(
    'SELECT * FROM visits WHERE customer_id = ? ORDER BY visit_date DESC, id DESC'
  ).all(customer.id);
  const photos = db.prepare(
    'SELECT * FROM photos WHERE customer_id = ? ORDER BY id DESC'
  ).all(customer.id);
  res.json({ ...customer, visits, photos });
});

const FIELDS = ['name', 'phone_display', 'gender', 'birthday', 'email', 'address',
  'hair_note', 'allergy', 'tags', 'memo', 'first_visit_date'];

function bodyToRecord(body) {
  const rec = {};
  for (const f of FIELDS) rec[f] = body[f] === undefined || body[f] === null ? '' : String(body[f]).trim();
  rec.phone_display = rec.phone_display ? formatPhone(rec.phone_display) : '';
  rec.phone = normalizePhone(body.phone_display || body.phone || '');
  rec.privacy_agreed = body.privacy_agreed ? 1 : 0;
  rec.first_visit_date = rec.first_visit_date || null;
  return rec;
}

router.post('/', (req, res) => {
  const rec = bodyToRecord(req.body);
  if (!rec.name) return res.status(400).json({ error: '고객 이름은 필수입니다.' });
  if (rec.phone) {
    const dup = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(rec.phone);
    if (dup && !req.body.allow_duplicate) {
      return res.status(409).json({ error: `같은 번호의 고객(${dup.name})이 이미 등록되어 있습니다.`, existing: dup });
    }
  }
  const now = nowISO();
  const info = db.prepare(`
    INSERT INTO customers (name, phone, phone_display, gender, birthday, email, address, hair_note, allergy,
                           tags, memo, privacy_agreed, first_visit_date, created_at, updated_at)
    VALUES (@name, @phone, @phone_display, @gender, @birthday, @email, @address, @hair_note, @allergy,
            @tags, @memo, @privacy_agreed, @first_visit_date, @created_at, @updated_at)
  `).run({ ...rec, created_at: now, updated_at: now });
  res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
  const merged = { ...cur, ...req.body };
  const rec = bodyToRecord(merged);
  if (!rec.name) return res.status(400).json({ error: '고객 이름은 필수입니다.' });
  db.prepare(`
    UPDATE customers SET name=@name, phone=@phone, phone_display=@phone_display, gender=@gender,
      birthday=@birthday, email=@email, address=@address, hair_note=@hair_note, allergy=@allergy,
      tags=@tags, memo=@memo, privacy_agreed=@privacy_agreed, first_visit_date=@first_visit_date,
      updated_at=@updated_at WHERE id=@id
  `).run({ ...rec, id: cur.id, updated_at: nowISO() });
  res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(cur.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

module.exports = router;
