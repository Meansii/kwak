'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, DATA_DIR } = require('../db');
const { readTable } = require('../lib/table');
const importer = require('../lib/importer');
const { nowISO, todayISO } = require('../lib/format');

const router = express.Router();
const STAGE_DIR = path.join(DATA_DIR, 'imports');
fs.mkdirSync(STAGE_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

function stagePath(token) {
  const safe = String(token).replace(/[^a-f0-9]/gi, '');
  if (!safe) throw new Error('잘못된 요청입니다.');
  return path.join(STAGE_DIR, `${safe}.json`);
}

function loadStaged(token) {
  const file = stagePath(token);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 24시간 지난 임시 업로드 파일 정리 */
function cleanupStage() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(STAGE_DIR)) {
    const full = path.join(STAGE_DIR, f);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch { /* 이미 지워진 파일 */ }
  }
}

router.get('/fields', (req, res) => {
  res.json({ fields: importer.FIELD_DEFS });
});

/** 1단계: 파일을 읽어 열 목록과 자동 매핑을 돌려준다 */
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일을 선택하세요.' });
    const { headers, rows } = await readTable(req.file.buffer, req.file.originalname || '');
    if (!headers.length) return res.status(400).json({ error: '표에서 열 제목을 찾지 못했습니다.' });

    cleanupStage();
    const token = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(stagePath(token), JSON.stringify({
      filename: req.file.originalname, headers, rows, created_at: nowISO(),
    }));

    res.json({
      token,
      filename: req.file.originalname,
      headers,
      rowCount: rows.length,
      sample: rows.slice(0, 10).map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : v))),
      mapping: importer.guessMapping(headers),
    });
  } catch (err) {
    next(err);
  }
});

function readOptions(body) {
  return {
    matchByName: body.matchByName !== false,
    createOnAmbiguous: !!body.createOnAmbiguous,
    defaultDate: body.defaultDate || todayISO(),
  };
}

/** 2단계: 매핑을 적용했을 때 각 행이 어떻게 처리될지 미리 보여준다 */
router.post('/analyze', (req, res) => {
  const staged = loadStaged(req.body.token);
  if (!staged) return res.status(404).json({ error: '업로드한 파일이 만료되었습니다. 다시 올려주세요.' });
  const mapping = req.body.mapping || importer.guessMapping(staged.headers);
  const { items, counts } = importer.analyze(staged.headers, staged.rows, mapping, readOptions(req.body));
  res.json({ counts, total: items.length, items: items.slice(0, 200) });
});

/** 3단계: 실제로 고객·방문 기록으로 저장한다 */
router.post('/commit', (req, res) => {
  const staged = loadStaged(req.body.token);
  if (!staged) return res.status(404).json({ error: '업로드한 파일이 만료되었습니다. 다시 올려주세요.' });
  const mapping = req.body.mapping || importer.guessMapping(staged.headers);
  const opts = { ...readOptions(req.body), filename: staged.filename, skipRows: req.body.skipRows || [] };
  const result = importer.commit(staged.headers, staged.rows, mapping, opts);
  try { fs.unlinkSync(stagePath(req.body.token)); } catch { /* 이미 정리됨 */ }
  res.json(result);
});

router.get('/batches', (req, res) => {
  const rows = db.prepare('SELECT * FROM import_batches ORDER BY id DESC LIMIT 30').all();
  res.json({
    items: rows.map((r) => ({
      ...r,
      stats: safeParse(r.stats, {}),
      mapping: undefined,
      response_count: db.prepare('SELECT COUNT(*) AS n FROM form_responses WHERE batch_id = ?').get(r.id).n,
    })),
  });
});

/** 동명이인 등으로 자동 연결에 실패한 구글폼 응답 */
router.get('/unmatched', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM form_responses WHERE status = 'unmatched' ORDER BY id DESC LIMIT 200"
  ).all();
  res.json({ items: rows.map((r) => ({ ...r, raw: safeParse(r.raw, {}) })) });
});

/** 실패한 응답을 특정 고객에게 직접 연결한다 */
router.post('/unmatched/:id/link', (req, res) => {
  const row = db.prepare("SELECT * FROM form_responses WHERE id = ? AND status = 'unmatched'").get(req.params.id);
  if (!row) return res.status(404).json({ error: '연결할 응답을 찾을 수 없습니다.' });
  const customerId = Number(req.body.customer_id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });

  const d = (safeParse(row.raw, {}).item) || {};
  const now = nowISO();
  const link = db.transaction(() => {
    let visitId = null;
    if (d.visit_date || d.services || d.amount || d.details) {
      visitId = db.prepare(`
        INSERT INTO visits (customer_id, visit_date, visit_time, services, details, designer, amount,
                            pay_method, memo, source, import_key, created_at, updated_at)
        VALUES (@customer_id, @visit_date, @visit_time, @services, @details, @designer, @amount,
                @pay_method, @memo, 'google_form', @import_key, @created_at, @updated_at)
      `).run({
        customer_id: customerId,
        visit_date: d.visit_date || todayISO(),
        visit_time: d.visit_time || '', services: d.services || '', details: d.details || '',
        designer: d.designer || '', amount: d.amount || 0, pay_method: d.pay_method || '',
        memo: d.memo || '', import_key: `link-${row.id}-${row.import_key}`,
        created_at: now, updated_at: now,
      }).lastInsertRowid;
    }
    for (const url of importer.splitUrls(d.photo_url)) {
      db.prepare(`
        INSERT INTO photos (customer_id, visit_id, filename, source_url, kind, caption, created_at)
        VALUES (?, ?, NULL, ?, 'after', '구글폼 첨부', ?)`).run(customerId, visitId, url, now);
    }
    db.prepare("UPDATE form_responses SET customer_id = ?, visit_id = ?, status = 'matched' WHERE id = ?")
      .run(customerId, visitId, row.id);
    return visitId;
  });
  const visitId = link();
  res.json({ ok: true, customer_id: customerId, visit_id: visitId });
});

/** 가져온 배치를 통째로 되돌린다 (구글폼으로 만든 방문기록/응답 삭제) */
router.delete('/batches/:id', (req, res) => {
  const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(req.params.id);
  if (!batch) return res.status(404).json({ error: '가져오기 기록을 찾을 수 없습니다.' });
  const undo = db.transaction(() => {
    const responses = db.prepare('SELECT * FROM form_responses WHERE batch_id = ?').all(batch.id);
    let visits = 0;
    for (const r of responses) {
      if (r.visit_id) {
        db.prepare('DELETE FROM photos WHERE visit_id = ? AND filename IS NULL').run(r.visit_id);
        visits += db.prepare('DELETE FROM visits WHERE id = ?').run(r.visit_id).changes;
      }
    }
    db.prepare('DELETE FROM form_responses WHERE batch_id = ?').run(batch.id);
    db.prepare('DELETE FROM import_batches WHERE id = ?').run(batch.id);
    return visits;
  });
  const removed = undo();
  res.json({ ok: true, visits_removed: removed, note: '가져오면서 새로 만든 고객 정보는 남아 있습니다.' });
});

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

module.exports = router;
