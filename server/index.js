'use strict';
const path = require('path');
const os = require('os');
const express = require('express');
const multer = require('multer');
const { getSetting } = require('./db');
const auth = require('./auth');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

auth.ensurePassword();

// --- 로그인 ---
app.post('/api/login', (req, res) => {
  if (!auth.verifyPassword(req.body.password)) {
    return res.status(401).json({ error: '비밀번호가 맞지 않습니다.' });
  }
  auth.issue(res, req);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  auth.clear(res);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({
    loggedIn: auth.isLoggedIn(req),
    shopName: getSetting('shop_name', '우리 미용실'),
  });
});

// --- 보호된 API ---
app.use('/api/customers', auth.requireAuth, require('./routes/customers'));
app.use('/api/visits', auth.requireAuth, require('./routes/visits'));
app.use('/api/photos', auth.requireAuth, require('./routes/photos'));
app.use('/api/import', auth.requireAuth, require('./routes/imports'));
app.use('/api/export', auth.requireAuth, require('./routes/exports'));
app.use('/api', auth.requireAuth, require('./routes/misc'));

// --- 화면 ---
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- 오류 처리 ---
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? '파일이 너무 큽니다. (최대 20MB)'
      : `업로드 오류: ${err.message}`;
    return res.status(400).json({ error: message });
  }
  console.error(err);
  res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';   // 0.0.0.0 이어야 같은 와이파이의 휴대폰에서도 접속됩니다

/** 같은 와이파이에서 접속할 때 쓸 이 PC의 주소들 */
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      out.push({ name, url: `http://${net.address}:${PORT}` });
    }
  }
  return out;
}

function printStartupGuide() {
  const lan = lanAddresses();
  const line = '─'.repeat(52);
  console.log(`\n${line}`);
  console.log('  💇  미용실 고객관리 앱이 켜졌습니다.');
  console.log(line);
  console.log(`  이 컴퓨터에서:  http://localhost:${PORT}`);
  if (lan.length) {
    console.log('  휴대폰·태블릿에서 (같은 와이파이):');
    for (const a of lan) console.log(`      ${a.url}   (${a.name})`);
  } else {
    console.log('  ※ 네트워크에 연결되어 있지 않아 휴대폰 접속 주소를 찾지 못했습니다.');
  }
  console.log(line);
  console.log('  이 창을 닫으면 앱이 꺼집니다. 영업 중에는 열어두세요.\n');

  if (lan.length) {
    try {
      // 휴대폰 카메라로 찍어서 바로 접속할 수 있게 QR 코드를 그려준다
      const qrcode = require('qrcode-terminal');
      console.log(`  ↓ 휴대폰 카메라로 찍으면 바로 열립니다 (${lan[0].url})`);
      qrcode.generate(lan[0].url, { small: true });
    } catch {
      /* QR 은 없어도 그만 */
    }
  }
}

if (require.main === module) {
  const server = app.listen(PORT, HOST, printStartupGuide);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[오류] ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있습니다.`);
      console.error('앱이 이미 켜져 있는지 확인하거나, PORT=3001 처럼 다른 번호로 실행하세요.\n');
    } else {
      console.error('\n[오류] 서버를 시작하지 못했습니다:', err.message, '\n');
    }
    process.exit(1);
  });
}

module.exports = app;
