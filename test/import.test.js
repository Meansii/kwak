'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kwak-import-'));
const { db } = require('../server/db');
const importer = require('../server/lib/importer');
const { parseCSV } = require('../server/lib/table');

const HEADERS = ['타임스탬프', '성함', '연락처', '성별', '생년월일', '받으신 시술', '결제 금액', '담당 디자이너', '사진 업로드', '개인정보 수집 동의'];
const ROWS = [
  ['2025/03/05 오후 2:31:09', '김하늘', '010-1234-5678', '여', '1993-04-12', '뿌리염색', '85,000', '이수진', 'https://drive.google.com/open?id=a', '예'],
  ['2025/04/02 오후 1:10:00', '김하늘', '010-1234-5678', '여', '1993-04-12', '클리닉', '60000', '이수진', '', '예'],
  ['2025/04/03 오전 11:02:00', '박지훈', '01098765432', '남', '1988-11-02', '커트', '25000', '최민호', '', '예'],
];

test.after(() => fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }));

test('헤더 자동 매핑', () => {
  const m = importer.guessMapping(HEADERS);
  assert.equal(m.submitted_at, 0);
  assert.equal(m.name, 1);
  assert.equal(m.phone, 2);
  assert.equal(m.gender, 3);
  assert.equal(m.birthday, 4);
  assert.equal(m.services, 5);
  assert.equal(m.amount, 6);
  assert.equal(m.designer, 7);
  assert.equal(m.photo_url, 8);
  assert.equal(m.privacy_agreed, 9);
});

test('가져오기: 신규 등록 + 같은 번호는 한 고객으로 묶임', () => {
  const mapping = importer.guessMapping(HEADERS);
  const result = importer.commit(HEADERS, ROWS, mapping, { filename: 'test.csv' });

  assert.equal(result.stats.customersCreated, 2, '고객은 2명만 만들어져야 한다');
  assert.equal(result.stats.visitsCreated, 3, '방문은 3건');
  assert.equal(result.stats.photos, 1, '구글폼 사진 링크 1건');

  const 김하늘 = db.prepare('SELECT * FROM customers WHERE phone = ?').get('01012345678');
  assert.equal(김하늘.name, '김하늘');
  assert.equal(김하늘.gender, '여');
  assert.equal(김하늘.privacy_agreed, 1);

  const visits = db.prepare('SELECT * FROM visits WHERE customer_id = ? ORDER BY visit_date').all(김하늘.id);
  assert.equal(visits.length, 2);
  assert.equal(visits[0].visit_date, '2025-03-05');
  assert.equal(visits[0].amount, 85000);
  assert.equal(visits[0].services, '뿌리염색');
  assert.equal(visits[0].source, 'google_form');
});

test('같은 파일을 다시 올려도 중복으로 쌓이지 않는다', () => {
  const mapping = importer.guessMapping(HEADERS);
  const { counts } = importer.analyze(HEADERS, ROWS, mapping, {});
  assert.equal(counts.duplicate, 3);

  const before = db.prepare('SELECT COUNT(*) AS n FROM visits').get().n;
  importer.commit(HEADERS, ROWS, mapping, { filename: 'test.csv' });
  const after = db.prepare('SELECT COUNT(*) AS n FROM visits').get().n;
  assert.equal(before, after);
});

test('기존 고객의 새 응답은 그 고객에게 붙는다', () => {
  const mapping = importer.guessMapping(HEADERS);
  const newRow = [['2025/05/10 오후 3:00:00', '김하늘', '010-1234-5678', '여', '1993-04-12', '펌', '120000', '이수진', '', '예']];
  const { counts } = importer.analyze(HEADERS, newRow, mapping, {});
  assert.equal(counts.matched, 1);
  assert.equal(counts.new, 0);

  const r = importer.commit(HEADERS, newRow, mapping, {});
  assert.equal(r.stats.customersCreated, 0);
  assert.equal(r.stats.visitsCreated, 1);

  const c = db.prepare('SELECT * FROM customers WHERE phone = ?').get('01012345678');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visits WHERE customer_id = ?').get(c.id).n, 3);
});

test('이름만 같은 동명이인은 자동 연결하지 않고 확인 목록으로 넘긴다', () => {
  const mapping = importer.guessMapping(HEADERS);
  // 연락처 없는 동명이인 두 명을 먼저 만든다
  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT INTO customers (name, phone, phone_display, privacy_agreed, created_at, updated_at)
    VALUES (?, '', '', 0, ?, ?)`);
  ins.run('이서연', now, now);
  ins.run('이서연', now, now);

  const row = [['2025/06/01 오후 1:00:00', '이서연', '', '여', '', '커트', '20000', '이수진', '', '예']];
  const { counts } = importer.analyze(HEADERS, row, mapping, { matchByName: true });
  assert.equal(counts.ambiguous, 1);

  importer.commit(HEADERS, row, mapping, { matchByName: true });
  const pending = db.prepare("SELECT * FROM form_responses WHERE status = 'unmatched'").all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].name, '이서연');
});

test('이름·연락처만 연결하면 방문 기록은 만들어지지 않는다', () => {
  const headers = ['이름', '연락처'];
  const rows = [['최윤아', '010-3131-4141'], ['오세훈', '010-5151-6161']];
  const mapping = importer.guessMapping(headers);
  assert.equal(mapping.name, 0);
  assert.equal(mapping.phone, 1);

  const r = importer.commit(headers, rows, mapping, { filename: '명단.csv' });
  assert.equal(r.stats.customersCreated, 2);
  assert.equal(r.stats.visitsCreated, 0, '날짜가 없는 명단은 방문 기록을 만들지 않는다');

  const c = db.prepare('SELECT * FROM customers WHERE phone = ?').get('01031314141');
  assert.equal(c.name, '최윤아');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visits WHERE customer_id = ?').get(c.id).n, 0);
});

test('customersOnly 를 켜면 시술 내용이 있어도 고객만 등록한다', () => {
  const mapping = importer.guessMapping(HEADERS);
  const rows = [['2025/09/01 오후 2:00:00', '강민지', '010-7070-8080', '여', '1997-01-05', '커트', '30000', '이수진', '', '예']];

  const r = importer.commit(HEADERS, rows, mapping, { customersOnly: true });
  assert.equal(r.stats.customersCreated, 1);
  assert.equal(r.stats.visitsCreated, 0);
  assert.equal(r.stats.photos, 0, '사진 링크도 가져오지 않는다');

  const c = db.prepare('SELECT * FROM customers WHERE phone = ?').get('01070708080');
  assert.equal(c.name, '강민지');
  assert.equal(c.gender, '여', '이름·연락처 외 정보는 그대로 저장된다');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visits WHERE customer_id = ?').get(c.id).n, 0);
});

test('CSV 파서: 따옴표 안의 쉼표와 줄바꿈', () => {
  const rows = parseCSV('이름,메모\n"홍길동","펌, 염색\n다음엔 짧게"\n');
  assert.deepEqual(rows[1], ['홍길동', '펌, 염색\n다음엔 짧게']);
});
