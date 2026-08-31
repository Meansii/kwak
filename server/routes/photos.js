'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, UPLOAD_DIR } = require('../db');
const { nowISO } = require('../lib/format');

const router = express.Router();

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${EXT[file.mimetype] || '.bin'}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error('이미지 파일(jpg, png, webp, gif, heic)만 올릴 수 있습니다.'));
  },
});

/** 사진 업로드 (한 번에 여러 장) */
router.post('/', upload.array('files', 20), (req, res) => {
  const customerId = Number(req.body.customer_id);
  if (!customerId || !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) {
    for (const f of req.files || []) fs.unlink(f.path, () => {});
    return res.status(400).json({ error: '고객을 찾을 수 없습니다.' });
  }
  const visitId = req.body.visit_id ? Number(req.body.visit_id) : null;
  if (visitId && !db.prepare('SELECT 1 FROM visits WHERE id = ? AND customer_id = ?').get(visitId, customerId)) {
    for (const f of req.files || []) fs.unlink(f.path, () => {});
    return res.status(400).json({ error: '방문 기록을 찾을 수 없습니다.' });
  }
  const kind = ['before', 'after', 'etc'].includes(req.body.kind) ? req.body.kind : 'after';
  const caption = String(req.body.caption || '').trim();

  const stmt = db.prepare(`
    INSERT INTO photos (customer_id, visit_id, filename, source_url, original_name, mime, size, kind, caption, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`);
  const created = [];
  for (const f of req.files || []) {
    const info = stmt.run(customerId, visitId, f.filename, f.originalname, f.mimetype, f.size, kind, caption, nowISO());
    created.push(db.prepare('SELECT * FROM photos WHERE id = ?').get(info.lastInsertRowid));
  }
  res.status(201).json({ items: created });
});

/** 저장된 이미지 파일 (로그인 필요) */
router.get('/file/:filename', (req, res) => {
  const name = path.basename(String(req.params.filename));
  const row = db.prepare('SELECT * FROM photos WHERE filename = ?').get(name);
  if (!row) return res.status(404).end();
  const full = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(full);
});

router.patch('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });
  const kind = ['before', 'after', 'etc'].includes(req.body.kind) ? req.body.kind : cur.kind;
  const caption = req.body.caption === undefined ? cur.caption : String(req.body.caption).trim();
  const visitId = req.body.visit_id === undefined ? cur.visit_id
    : (req.body.visit_id ? Number(req.body.visit_id) : null);
  db.prepare('UPDATE photos SET kind = ?, caption = ?, visit_id = ? WHERE id = ?')
    .run(kind, caption, visitId, cur.id);
  res.json(db.prepare('SELECT * FROM photos WHERE id = ?').get(cur.id));
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '사진을 찾을 수 없습니다.' });
  db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
  if (row.filename) fs.unlink(path.join(UPLOAD_DIR, row.filename), () => {});
  res.json({ ok: true });
});

module.exports = router;
