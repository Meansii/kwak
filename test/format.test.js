'use strict';
const test = require('node:test');
const assert = require('node:assert');
const f = require('../server/lib/format');

test('전화번호 정규화', () => {
  assert.equal(f.normalizePhone('010-1234-5678'), '01012345678');
  assert.equal(f.normalizePhone('+82 10-1234-5678'), '01012345678');
  assert.equal(f.normalizePhone('82 10 1234 5678'), '01012345678');
  assert.equal(f.normalizePhone(1012345678), '01012345678', '엑셀에서 앞 0이 사라진 경우');
  assert.equal(f.normalizePhone(''), '');
  assert.equal(f.normalizePhone(null), '');
});

test('전화번호 표시 형식', () => {
  assert.equal(f.formatPhone('01012345678'), '010-1234-5678');
  assert.equal(f.formatPhone('0212345678'), '02-1234-5678');
  assert.equal(f.formatPhone('0311234567'), '031-123-4567');
});

test('날짜 해석', () => {
  assert.equal(f.parseDate('2024. 3. 5 오후 2:31:09'), '2024-03-05');
  assert.equal(f.parseDate('2024/03/05'), '2024-03-05');
  assert.equal(f.parseDate('2024년 3월 5일'), '2024-03-05');
  assert.equal(f.parseDate('20240305'), '2024-03-05');
  assert.equal(f.parseDate(45000), '2023-03-15', '엑셀 날짜 시리얼');
  assert.equal(f.parseDate(''), '');
  assert.equal(f.parseDate('없음'), '');
});

test('시각 해석', () => {
  assert.equal(f.parseTime('2024. 3. 5 오후 2:31:09'), '14:31');
  assert.equal(f.parseTime('2024. 3. 5 오전 9:05:00'), '09:05');
  assert.equal(f.parseTime('2024-03-05 오후 12:10'), '12:10');
  assert.equal(f.parseTime('2024-03-05 오전 12:10'), '00:10');
});

test('금액 해석', () => {
  assert.equal(f.parseAmount('50,000원'), 50000);
  assert.equal(f.parseAmount('5만원'), 50000);
  assert.equal(f.parseAmount(85000), 85000);
  assert.equal(f.parseAmount(''), 0);
  assert.equal(f.parseAmount('무료'), 0);
});
