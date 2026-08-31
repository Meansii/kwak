'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kwak-api-'));
process.env.APP_PASSWORD = 'test-secret-1234';

const app = require('../server/index');
const { readTable } = require('../server/lib/table');

let base;
let cookie = '';
let server;

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

async function call(method, url, body) {
  const options = { method, headers: {} };
  if (cookie) options.headers.Cookie = cookie;
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(base + url, options);
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, res };
}

test('로그인하지 않으면 고객 정보를 볼 수 없다', async () => {
  const r = await call('GET', '/api/customers');
  assert.equal(r.status, 401);
});

test('틀린 비밀번호는 거부된다', async () => {
  const r = await call('POST', '/api/login', { password: '아무거나' });
  assert.equal(r.status, 401);
});

test('로그인 후 고객 등록과 조회', async () => {
  assert.equal((await call('POST', '/api/login', { password: 'test-secret-1234' })).status, 200);

  const created = await call('POST', '/api/customers', {
    name: '정다인', phone_display: '01055556666', gender: '여',
    birthday: '1996-02-20', memo: '단발 선호', privacy_agreed: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.phone, '01055556666');
  assert.equal(created.data.phone_display, '010-5555-6666');

  const list = await call('GET', '/api/customers?q=정다인');
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].name, '정다인');

  const byPhone = await call('GET', '/api/customers?q=5555');
  assert.equal(byPhone.data.total, 1, '연락처 일부로도 검색된다');
});

test('같은 번호를 다시 등록하면 알려준다', async () => {
  const dup = await call('POST', '/api/customers', { name: '정다인2', phone_display: '010-5555-6666' });
  assert.equal(dup.status, 409);
  const forced = await call('POST', '/api/customers', { name: '정다인2', phone_display: '010-5555-6666', allow_duplicate: true });
  assert.equal(forced.status, 201);
});

test('방문 기록 등록·수정·집계', async () => {
  const list = await call('GET', '/api/customers?q=정다인&sort=name');
  const id = list.data.items[0].id;

  const v = await call('POST', '/api/visits', {
    customer_id: id, visit_date: '2025-07-01', services: '컷 + 클리닉',
    amount: '75,000', designer: '이수진', pay_method: '카드',
  });
  assert.equal(v.status, 201);
  assert.equal(v.data.amount, 75000);

  const updated = await call('PUT', `/api/visits/${v.data.id}`, { amount: 80000, memo: '다음 예약 8월' });
  assert.equal(updated.data.amount, 80000);
  assert.equal(updated.data.memo, '다음 예약 8월');
  assert.equal(updated.data.services, '컷 + 클리닉', '보내지 않은 항목은 그대로 유지된다');

  const detail = await call('GET', `/api/customers/${id}`);
  assert.equal(detail.data.visit_count, 1);
  assert.equal(detail.data.total_amount, 80000);
  assert.equal(detail.data.visits.length, 1);

  const visits = await call('GET', '/api/visits?from=2025-07-01&to=2025-07-31');
  assert.equal(visits.data.total_amount, 80000);
});

test('구글폼 파일 업로드 → 미리보기 → 저장', async () => {
  const csv = [
    '타임스탬프,이름,연락처,받으신 시술,결제 금액',
    '2025/08/01 오후 2:00:00,한지우,010-7777-8888,볼륨매직,180000',
    '2025/08/02 오후 4:00:00,정다인,010-5555-6666,뿌리염색,70000',
  ].join('\n');

  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), '응답.csv');
  const preview = await call('POST', '/api/import/preview', form);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.rowCount, 2);
  assert.equal(preview.data.mapping.name, 1);

  const analyzed = await call('POST', '/api/import/analyze', {
    token: preview.data.token, mapping: preview.data.mapping,
  });
  assert.equal(analyzed.data.counts.new, 1, '한지우는 신규');
  assert.equal(analyzed.data.counts.matched, 1, '정다인은 기존 고객과 연결');

  const committed = await call('POST', '/api/import/commit', {
    token: preview.data.token, mapping: preview.data.mapping,
  });
  assert.equal(committed.data.stats.customersCreated, 1);
  assert.equal(committed.data.stats.visitsCreated, 2);

  const hanji = await call('GET', '/api/customers?q=한지우');
  assert.equal(hanji.data.items[0].total_amount, 180000);
});

test('핸즈SOS 양식으로 열 이름을 바꿔 내보낸다', async () => {
  const saved = await call('PUT', '/api/export/template/customers', {
    template: [
      { header: '회원명', field: 'name' },
      { header: '연락처', field: 'phone_display' },
      { header: '누적매출', field: 'total_amount' },
    ],
  });
  assert.equal(saved.status, 200);

  const csv = await fetch(`${base}/api/export/download?type=customers&format=csv`, { headers: { Cookie: cookie } });
  const text = await csv.text();
  assert.match(text.split('\r\n')[0], /회원명,연락처,누적매출/);

  const xlsx = await fetch(`${base}/api/export/download?type=customers&format=xlsx`, { headers: { Cookie: cookie } });
  const table = await readTable(Buffer.from(await xlsx.arrayBuffer()), 'x.xlsx');
  assert.deepEqual(table.headers, ['회원명', '연락처', '누적매출']);
  assert.ok(table.rows.length >= 2);
});

test('검색은 해당 고객만 걸러낸다', async () => {
  const all = await call('GET', '/api/customers');
  assert.ok(all.data.total >= 3, '고객이 여러 명 있어야 의미 있는 검사');

  const one = await call('GET', `/api/customers?q=${encodeURIComponent('한지우')}`);
  assert.equal(one.data.total, 1);
  assert.equal(one.data.items[0].name, '한지우');

  const none = await call('GET', `/api/customers?q=${encodeURIComponent('없는이름')}`);
  assert.equal(none.data.total, 0);
});

test('통계 요약', async () => {
  const stats = await call('GET', '/api/stats');
  assert.ok(stats.data.summary.customers >= 3);
  assert.ok(stats.data.summary.revenue_total > 0);
});

test('로그아웃하면 다시 막힌다', async () => {
  await call('POST', '/api/logout');
  cookie = '';
  assert.equal((await call('GET', '/api/customers')).status, 401);
});
