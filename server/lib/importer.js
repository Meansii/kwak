'use strict';
const crypto = require('crypto');
const { db } = require('../db');
const {
  normalizePhone, formatPhone, parseDate, parseTime, parseAmount, nowISO,
} = require('./format');

/**
 * 구글폼 시트의 열을 앱의 필드로 연결하기 위한 정의.
 * keywords 는 헤더 자동 인식용(소문자/공백제거 후 부분일치).
 */
const FIELD_DEFS = [
  { key: 'submitted_at', label: '응답 시각(타임스탬프)', keywords: ['타임스탬프', 'timestamp', '응답시각', '제출시간', '작성일시'] },
  { key: 'name', label: '고객 이름', required: true, keywords: ['이름', '성함', '고객명', 'name', '성명'] },
  { key: 'phone', label: '연락처', keywords: ['연락처', '전화', '휴대폰', '핸드폰', '번호', 'phone', 'tel', 'mobile'] },
  { key: 'gender', label: '성별', keywords: ['성별', 'gender', '남녀'] },
  { key: 'birthday', label: '생년월일', keywords: ['생년월일', '생일', 'birth', '출생'] },
  { key: 'email', label: '이메일', keywords: ['이메일', 'email', '메일주소'] },
  { key: 'visit_date', label: '방문일자', keywords: ['방문일', '방문날짜', '시술일', '예약일', '방문 일자', 'visit', 'date'] },
  { key: 'services', label: '시술 내용', keywords: ['시술', '메뉴', '서비스', '받으신', '희망', 'service', '커트', '펌', '염색'] },
  { key: 'details', label: '시술 상세기록', keywords: ['상세', '레시피', '약제', '기록', '요청사항', '스타일'] },
  { key: 'designer', label: '담당 디자이너', keywords: ['디자이너', '담당', '원장', 'staff', '선생님'] },
  { key: 'amount', label: '결제금액', keywords: ['금액', '결제', '가격', '비용', 'price', 'amount', '요금'] },
  { key: 'pay_method', label: '결제수단', keywords: ['결제수단', '결제방법', '카드', '현금', 'payment'] },
  { key: 'hair_note', label: '모발/두피 특이사항', keywords: ['모발', '두피', '손상', '헤어상태'] },
  { key: 'allergy', label: '알러지/주의사항', keywords: ['알러지', '알레르기', '주의', '병력', '민감'] },
  { key: 'memo', label: '메모/기타', keywords: ['메모', '기타', '남기실', '문의', '비고', 'note'] },
  { key: 'photo_url', label: '사진 링크(파일 업로드)', keywords: ['사진', '이미지', '업로드', 'photo', 'image', '파일'] },
  { key: 'privacy_agreed', label: '개인정보 동의', keywords: ['개인정보', '동의', 'privacy', '수집'] },
];

const FIELD_KEYS = FIELD_DEFS.map((f) => f.key);

function norm(s) {
  return String(s ?? '').toLowerCase().replace(/[\s()\[\]:*·,.\-_/]/g, '');
}

/** 헤더 이름을 보고 필드 매핑을 자동 추천한다. 값은 열 인덱스 또는 null. */
function guessMapping(headers) {
  const mapping = {};
  for (const f of FIELD_DEFS) mapping[f.key] = null;
  const used = new Set();
  const normedHeaders = headers.map(norm);

  for (const f of FIELD_DEFS) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < normedHeaders.length; i++) {
      if (used.has(i)) continue;
      const h = normedHeaders[i];
      if (!h) continue;
      for (const kw of f.keywords) {
        const k = norm(kw);
        if (!k || !h.includes(k)) continue;
        // 헤더가 짧고 키워드가 길수록 확신도가 높다
        const score = k.length * 10 - (h.length - k.length);
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    if (best >= 0) { mapping[f.key] = best; used.add(best); }
  }
  return mapping;
}

function pick(row, mapping, key) {
  const idx = mapping[key];
  if (idx === null || idx === undefined || idx === '') return '';
  const v = row[Number(idx)];
  return v === undefined || v === null ? '' : v;
}

function truthy(v) {
  const s = String(v).trim().toLowerCase();
  if (!s) return 0;
  return ['예', '네', '동의', 'y', 'yes', 'true', 'o', '1', '동의합니다', '확인'].some((t) => s.includes(t)) ? 1 : 0;
}

function normGender(v) {
  const s = String(v).trim();
  if (!s) return '';
  if (/여|f|female|w/i.test(s)) return '여';
  if (/남|m|male/i.test(s)) return '남';
  return s.slice(0, 10);
}

/** 매핑을 적용해 한 행을 표준 형태로 변환한다. */
function normalizeRow(row, mapping, opts = {}) {
  const submittedRaw = pick(row, mapping, 'submitted_at');
  const visitRaw = pick(row, mapping, 'visit_date');
  const submittedDate = parseDate(submittedRaw);
  const visitDate = parseDate(visitRaw) || submittedDate || opts.defaultDate || '';
  const phoneRaw = pick(row, mapping, 'phone');
  return {
    submitted_at: submittedDate ? `${submittedDate} ${parseTime(submittedRaw)}`.trim() : '',
    name: String(pick(row, mapping, 'name')).trim(),
    phone: normalizePhone(phoneRaw),
    phone_display: String(phoneRaw ?? '').trim() ? formatPhone(phoneRaw) : '',
    gender: normGender(pick(row, mapping, 'gender')),
    birthday: parseDate(pick(row, mapping, 'birthday')),
    email: String(pick(row, mapping, 'email')).trim(),
    visit_date: visitDate,
    visit_time: parseTime(visitRaw) || parseTime(submittedRaw),
    services: String(pick(row, mapping, 'services')).trim(),
    details: String(pick(row, mapping, 'details')).trim(),
    designer: String(pick(row, mapping, 'designer')).trim(),
    amount: parseAmount(pick(row, mapping, 'amount')),
    pay_method: String(pick(row, mapping, 'pay_method')).trim(),
    hair_note: String(pick(row, mapping, 'hair_note')).trim(),
    allergy: String(pick(row, mapping, 'allergy')).trim(),
    memo: String(pick(row, mapping, 'memo')).trim(),
    photo_url: String(pick(row, mapping, 'photo_url')).trim(),
    privacy_agreed: mapping.privacy_agreed === null ? 0 : truthy(pick(row, mapping, 'privacy_agreed')),
  };
}

/** 같은 응답을 두 번 넣지 않기 위한 키. */
function importKey(item) {
  const raw = [item.name, item.phone, item.submitted_at, item.visit_date, item.services, item.amount].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex');
}

/** 전화번호 -> 이름 -> 이름+생일 순으로 기존 고객을 찾는다. */
function findCustomer(item, opts = {}) {
  if (item.phone) {
    const byPhone = db.prepare('SELECT * FROM customers WHERE phone = ? ORDER BY id LIMIT 2').all(item.phone);
    if (byPhone.length) return { customer: byPhone[0], how: 'phone' };
  }
  if (item.name && item.birthday) {
    const byBirth = db.prepare('SELECT * FROM customers WHERE name = ? AND birthday = ? LIMIT 2').all(item.name, item.birthday);
    if (byBirth.length === 1) return { customer: byBirth[0], how: 'name+birthday' };
  }
  if (item.name && opts.matchByName) {
    const byName = db.prepare('SELECT * FROM customers WHERE name = ? LIMIT 2').all(item.name);
    if (byName.length === 1) return { customer: byName[0], how: 'name' };
    if (byName.length > 1) return { customer: null, how: 'ambiguous' };
  }
  return { customer: null, how: null };
}

/**
 * 실제 저장 없이 각 행이 어떻게 처리될지 계산한다.
 * status: matched(기존 고객) | new(신규 고객) | duplicate(이미 가져옴) | skipped(이름 없음) | ambiguous(동명이인)
 */
function analyze(headers, rows, mapping, opts = {}) {
  const items = [];
  const seen = new Set();
  const counts = { matched: 0, new: 0, duplicate: 0, skipped: 0, ambiguous: 0 };
  const newPhones = new Set();

  for (let i = 0; i < rows.length; i++) {
    const item = normalizeRow(rows[i], mapping, opts);
    const key = importKey(item);
    let status;
    let matched = null;
    let how = null;

    if (!item.name && !item.phone) {
      status = 'skipped';
    } else if (seen.has(key) || db.prepare('SELECT 1 FROM form_responses WHERE import_key = ?').get(key)) {
      status = 'duplicate';
    } else {
      const found = findCustomer(item, opts);
      if (found.customer) { status = 'matched'; matched = found.customer; how = found.how; }
      else if (found.how === 'ambiguous') { status = 'ambiguous'; }
      else if (item.phone && newPhones.has(item.phone)) {
        // 같은 파일 안에서 처음 등장한 신규 고객의 두 번째 방문
        status = 'matched'; how = 'file'; matched = { id: null, name: item.name };
      } else {
        status = 'new';
        if (item.phone) newPhones.add(item.phone);
      }
    }
    seen.add(key);
    counts[status]++;
    items.push({
      rowIndex: i, key, status, matchedHow: how,
      matchedCustomer: matched ? { id: matched.id, name: matched.name } : null,
      data: item,
    });
  }
  return { items, counts };
}

/** 미리보기에서 확인한 내용을 실제 DB에 반영한다. */
function commit(headers, rows, mapping, opts = {}) {
  const analysis = analyze(headers, rows, mapping, opts);
  const now = nowISO();
  const skipRows = new Set((opts.skipRows || []).map(Number));

  const insertCustomer = db.prepare(`
    INSERT INTO customers (name, phone, phone_display, gender, birthday, email, hair_note, allergy, memo,
                           privacy_agreed, first_visit_date, created_at, updated_at)
    VALUES (@name, @phone, @phone_display, @gender, @birthday, @email, @hair_note, @allergy, @memo,
            @privacy_agreed, @first_visit_date, @created_at, @updated_at)`);
  const insertVisit = db.prepare(`
    INSERT INTO visits (customer_id, visit_date, visit_time, services, details, designer, amount, pay_method,
                        memo, source, import_key, created_at, updated_at)
    VALUES (@customer_id, @visit_date, @visit_time, @services, @details, @designer, @amount, @pay_method,
            @memo, 'google_form', @import_key, @created_at, @updated_at)`);
  const insertPhoto = db.prepare(`
    INSERT INTO photos (customer_id, visit_id, filename, source_url, original_name, mime, size, kind, caption, created_at)
    VALUES (?, ?, NULL, ?, NULL, NULL, NULL, 'after', '구글폼 첨부', ?)`);
  const insertResponse = db.prepare(`
    INSERT INTO form_responses (batch_id, submitted_at, name, phone, raw, customer_id, visit_id, status, import_key, created_at)
    VALUES (@batch_id, @submitted_at, @name, @phone, @raw, @customer_id, @visit_id, @status, @import_key, @created_at)`);
  const insertBatch = db.prepare('INSERT INTO import_batches (filename, mapping, stats, created_at) VALUES (?, ?, ?, ?)');

  const stats = { customersCreated: 0, customersUpdated: 0, visitsCreated: 0, photos: 0, duplicates: 0, skipped: 0 };

  const run = db.transaction(() => {
    const batchId = insertBatch.run(opts.filename || '', JSON.stringify(mapping), '{}', now).lastInsertRowid;
    const createdInBatch = new Map(); // phone -> customerId

    for (const it of analysis.items) {
      const d = it.data;
      if (it.status === 'skipped' || skipRows.has(it.rowIndex)) { stats.skipped++; continue; }
      if (it.status === 'duplicate') { stats.duplicates++; continue; }
      if (it.status === 'ambiguous' && !opts.createOnAmbiguous) {
        insertResponse.run({
          batch_id: batchId, submitted_at: d.submitted_at, name: d.name, phone: d.phone,
          raw: JSON.stringify({ row: rowToObject(headers, rows[it.rowIndex]), item: d }),
          customer_id: null, visit_id: null, status: 'unmatched', import_key: it.key, created_at: now,
        });
        continue;
      }

      let customerId = it.matchedCustomer && it.matchedCustomer.id ? it.matchedCustomer.id : null;
      if (!customerId && d.phone && createdInBatch.has(d.phone)) customerId = createdInBatch.get(d.phone);

      if (!customerId) {
        customerId = insertCustomer.run({
          name: d.name || '(이름없음)', phone: d.phone, phone_display: d.phone_display || d.phone,
          gender: d.gender, birthday: d.birthday, email: d.email, hair_note: d.hair_note,
          allergy: d.allergy, memo: '', privacy_agreed: d.privacy_agreed,
          first_visit_date: d.visit_date || null, created_at: now, updated_at: now,
        }).lastInsertRowid;
        stats.customersCreated++;
        if (d.phone) createdInBatch.set(d.phone, customerId);
      } else {
        // 기존 고객은 비어 있던 항목만 채운다 (덮어쓰기 방지)
        const cur = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
        const patch = {};
        for (const f of ['phone', 'phone_display', 'gender', 'birthday', 'email', 'hair_note', 'allergy']) {
          if (!cur[f] && d[f]) patch[f] = d[f];
        }
        if (!cur.privacy_agreed && d.privacy_agreed) patch.privacy_agreed = 1;
        if (Object.keys(patch).length) {
          const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ');
          db.prepare(`UPDATE customers SET ${sets}, updated_at = @updated_at WHERE id = @id`)
            .run({ ...patch, id: customerId, updated_at: now });
          stats.customersUpdated++;
        }
      }

      let visitId = null;
      const hasVisitInfo = d.visit_date || d.services || d.amount || d.details;
      if (hasVisitInfo) {
        visitId = insertVisit.run({
          customer_id: customerId,
          visit_date: d.visit_date || (d.submitted_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          visit_time: d.visit_time, services: d.services, details: d.details, designer: d.designer,
          amount: d.amount, pay_method: d.pay_method, memo: d.memo,
          import_key: it.key, created_at: now, updated_at: now,
        }).lastInsertRowid;
        stats.visitsCreated++;
      }

      for (const url of splitUrls(d.photo_url)) {
        insertPhoto.run(customerId, visitId, url, now);
        stats.photos++;
      }

      insertResponse.run({
        batch_id: batchId, submitted_at: d.submitted_at, name: d.name, phone: d.phone,
        raw: JSON.stringify({ row: rowToObject(headers, rows[it.rowIndex]), item: d }),
        customer_id: customerId, visit_id: visitId,
        status: it.status === 'new' ? 'created' : 'matched', import_key: it.key, created_at: now,
      });
    }

    db.prepare('UPDATE import_batches SET stats = ? WHERE id = ?').run(JSON.stringify(stats), batchId);
    return batchId;
  });

  const batchId = run();
  return { batchId, stats, counts: analysis.counts };
}

function splitUrls(value) {
  if (!value) return [];
  return String(value).split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
}

function rowToObject(headers, row) {
  const o = {};
  headers.forEach((h, i) => {
    const v = row[i];
    o[h] = v instanceof Date ? v.toISOString() : v;
  });
  return o;
}

module.exports = { FIELD_DEFS, splitUrls, FIELD_KEYS, guessMapping, normalizeRow, analyze, commit, importKey };
