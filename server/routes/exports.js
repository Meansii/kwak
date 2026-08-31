'use strict';
const express = require('express');
const { getSetting, setSetting } = require('../db');
const { toCSV, toXLSX } = require('../lib/table');
const { CUSTOMER_FIELDS, VISIT_FIELDS, DEFAULT_TEMPLATES, getTemplate, buildExport } = require('../lib/exporter');
const { todayISO } = require('../lib/format');

const router = express.Router();

const TYPES = new Set(['customers', 'visits']);

/** 내보내기 화면에서 쓰는 항목 목록과 현재 저장된 열 구성 */
router.get('/fields', (req, res) => {
  res.json({
    customerFields: CUSTOMER_FIELDS,
    visitFields: VISIT_FIELDS,
    templates: {
      customers: getTemplate('customers'),
      visits: getTemplate('visits'),
    },
    defaults: DEFAULT_TEMPLATES,
    profileName: getSetting('export_profile_name', '핸즈SOS'),
  });
});

/** 핸즈SOS 등 외부 프로그램 양식에 맞춰 열 이름/순서를 저장한다 */
router.put('/template/:type', (req, res) => {
  const type = req.params.type;
  if (!TYPES.has(type)) return res.status(400).json({ error: '알 수 없는 내보내기 종류입니다.' });
  const allowed = new Set((type === 'customers' ? CUSTOMER_FIELDS : VISIT_FIELDS).map((f) => f.key));
  const template = (req.body.template || [])
    .filter((c) => c && allowed.has(c.field))
    .map((c) => ({ header: String(c.header || c.field).trim() || c.field, field: c.field }));
  if (!template.length) return res.status(400).json({ error: '열을 하나 이상 선택하세요.' });
  setSetting(`export_template_${type}`, template);
  if (req.body.profileName !== undefined) {
    setSetting('export_profile_name', String(req.body.profileName).trim() || '핸즈SOS');
  }
  res.json({ ok: true, template });
});

router.post('/preview', (req, res) => {
  const type = TYPES.has(req.body.type) ? req.body.type : 'customers';
  const { headers, rows } = buildExport(type, req.body);
  res.json({ headers, rows: rows.slice(0, 20), total: rows.length });
});

/** 실제 파일 다운로드 (xlsx / csv) */
router.get('/download', async (req, res, next) => {
  try {
    const type = TYPES.has(req.query.type) ? req.query.type : 'customers';
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const { headers, rows } = buildExport(type, {
      from: req.query.from || null,
      to: req.query.to || null,
      customerIds: req.query.ids ? String(req.query.ids).split(',').map(Number).filter(Boolean) : null,
    });
    const label = type === 'customers' ? '고객목록' : '시술내역';
    const base = `${getSetting('export_profile_name', '핸즈SOS')}_${label}_${todayISO()}`;
    const filename = encodeURIComponent(`${base}.${format}`);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      return res.send(toCSV(headers, rows));
    }
    const buf = await toXLSX(headers, rows, label);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
