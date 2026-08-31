'use strict';
const path = require('path');
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
const HOST = process.env.HOST || '0.0.0.0';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`미용실 고객관리 앱이 http://localhost:${PORT} 에서 실행 중입니다.`);
  });
}

module.exports = app;
