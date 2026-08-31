'use strict';
const { db, getSetting } = require('../db');
const { formatPhone } = require('./format');

/** 내보내기에서 고를 수 있는 고객 항목 */
const CUSTOMER_FIELDS = [
  { key: 'name', label: '고객명' },
  { key: 'phone_display', label: '연락처(010-0000-0000)' },
  { key: 'phone', label: '연락처(숫자만)' },
  { key: 'gender', label: '성별' },
  { key: 'birthday', label: '생년월일' },
  { key: 'email', label: '이메일' },
  { key: 'address', label: '주소' },
  { key: 'tags', label: '태그' },
  { key: 'hair_note', label: '모발/두피 특이사항' },
  { key: 'allergy', label: '알러지/주의사항' },
  { key: 'memo', label: '메모' },
  { key: 'first_visit_date', label: '최초 방문일' },
  { key: 'last_visit_date', label: '최근 방문일' },
  { key: 'visit_count', label: '방문 횟수' },
  { key: 'total_amount', label: '총 결제금액' },
  { key: 'avg_amount', label: '평균 결제금액' },
  { key: 'last_services', label: '최근 시술' },
  { key: 'last_designer', label: '최근 담당자' },
  { key: 'privacy_agreed', label: '개인정보 동의' },
  { key: 'created_at', label: '등록일' },
];

/** 내보내기에서 고를 수 있는 방문/시술 항목 */
const VISIT_FIELDS = [
  { key: 'customer_name', label: '고객명' },
  { key: 'phone_display', label: '연락처' },
  { key: 'visit_date', label: '방문일자' },
  { key: 'visit_time', label: '방문시간' },
  { key: 'services', label: '시술내용' },
  { key: 'details', label: '시술 상세기록' },
  { key: 'designer', label: '담당 디자이너' },
  { key: 'amount', label: '결제금액' },
  { key: 'pay_method', label: '결제수단' },
  { key: 'memo', label: '메모' },
  { key: 'photo_count', label: '사진 수' },
  { key: 'source', label: '입력경로' },
];

/**
 * 핸즈SOS 등 외부 프로그램에 올릴 때 쓰는 기본 열 구성.
 * 실제 양식에 맞게 설정 화면에서 열 이름/순서를 바꿀 수 있다.
 */
const DEFAULT_TEMPLATES = {
  customers: [
    { header: '고객명', field: 'name' },
    { header: '휴대폰번호', field: 'phone_display' },
    { header: '성별', field: 'gender' },
    { header: '생년월일', field: 'birthday' },
    { header: '최초방문일', field: 'first_visit_date' },
    { header: '최근방문일', field: 'last_visit_date' },
    { header: '방문횟수', field: 'visit_count' },
    { header: '총결제금액', field: 'total_amount' },
    { header: '메모', field: 'memo' },
  ],
  visits: [
    { header: '고객명', field: 'customer_name' },
    { header: '휴대폰번호', field: 'phone_display' },
    { header: '방문일자', field: 'visit_date' },
    { header: '시술내용', field: 'services' },
    { header: '시술상세', field: 'details' },
    { header: '담당자', field: 'designer' },
    { header: '결제금액', field: 'amount' },
    { header: '결제수단', field: 'pay_method' },
    { header: '메모', field: 'memo' },
  ],
};

function getTemplate(type) {
  const saved = getSetting(`export_template_${type}`, null);
  if (Array.isArray(saved) && saved.length) return saved;
  return DEFAULT_TEMPLATES[type];
}

const CUSTOMER_SQL = `
  SELECT c.*,
         (SELECT COUNT(*) FROM visits v WHERE v.customer_id = c.id) AS visit_count,
         (SELECT COALESCE(SUM(v.amount), 0) FROM visits v WHERE v.customer_id = c.id) AS total_amount,
         (SELECT MAX(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS last_visit_date,
         (SELECT MIN(v.visit_date) FROM visits v WHERE v.customer_id = c.id) AS computed_first_visit,
         (SELECT v.services FROM visits v WHERE v.customer_id = c.id ORDER BY v.visit_date DESC, v.id DESC LIMIT 1) AS last_services,
         (SELECT v.designer FROM visits v WHERE v.customer_id = c.id ORDER BY v.visit_date DESC, v.id DESC LIMIT 1) AS last_designer
  FROM customers c`;

function customerValue(row, field) {
  switch (field) {
    case 'phone_display': return row.phone_display || formatPhone(row.phone) || '';
    case 'first_visit_date': return row.first_visit_date || row.computed_first_visit || '';
    case 'avg_amount': return row.visit_count ? Math.round(row.total_amount / row.visit_count) : 0;
    case 'privacy_agreed': return row.privacy_agreed ? 'Y' : 'N';
    case 'created_at': return String(row.created_at || '').slice(0, 10);
    default: return row[field] === null || row[field] === undefined ? '' : row[field];
  }
}

function visitValue(row, field) {
  switch (field) {
    case 'phone_display': return row.phone_display || formatPhone(row.phone) || '';
    case 'source': return row.source === 'google_form' ? '구글폼' : '직접입력';
    default: return row[field] === null || row[field] === undefined ? '' : row[field];
  }
}

/** 내보내기 데이터를 { headers, rows } 로 만든다. */
function buildExport(type, { template, from, to, customerIds } = {}) {
  const cols = (template && template.length ? template : getTemplate(type))
    .filter((c) => c && c.field);
  const headers = cols.map((c) => c.header || c.field);

  if (type === 'customers') {
    let sql = CUSTOMER_SQL;
    const params = [];
    if (customerIds && customerIds.length) {
      sql += ` WHERE c.id IN (${customerIds.map(() => '?').join(',')})`;
      params.push(...customerIds);
    }
    sql += ' ORDER BY c.name COLLATE NOCASE';
    const rows = db.prepare(sql).all(...params);
    return { headers, rows: rows.map((r) => cols.map((c) => customerValue(r, c.field))) };
  }

  let sql = `
    SELECT v.*, c.name AS customer_name, c.phone, c.phone_display,
           (SELECT COUNT(*) FROM photos p WHERE p.visit_id = v.id) AS photo_count
    FROM visits v JOIN customers c ON c.id = v.customer_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND v.visit_date >= ?'; params.push(from); }
  if (to) { sql += ' AND v.visit_date <= ?'; params.push(to); }
  if (customerIds && customerIds.length) {
    sql += ` AND v.customer_id IN (${customerIds.map(() => '?').join(',')})`;
    params.push(...customerIds);
  }
  sql += ' ORDER BY v.visit_date DESC, v.id DESC';
  const rows = db.prepare(sql).all(...params);
  return { headers, rows: rows.map((r) => cols.map((c) => visitValue(r, c.field))) };
}

module.exports = { CUSTOMER_FIELDS, VISIT_FIELDS, DEFAULT_TEMPLATES, getTemplate, buildExport };
