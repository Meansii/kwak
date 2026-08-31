'use strict';
const crypto = require('crypto');
const { getSetting, setSetting } = require('./db');

const COOKIE = 'kwak_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14; // 14일

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let s = getSetting('session_secret');
  if (!s) s = setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
  return s;
}

/** 저장된 비밀번호 해시가 없으면 환경변수(APP_PASSWORD)로 초기화한다. */
function ensurePassword() {
  let rec = getSetting('password');
  const envPw = process.env.APP_PASSWORD;
  if (!rec) {
    const pw = envPw || 'kwak1234';
    rec = setPassword(pw);
    if (!envPw) {
      console.warn('[주의] 초기 비밀번호가 kwak1234 로 설정되었습니다. 설정 화면에서 반드시 변경하세요.');
    }
  }
  return rec;
}

function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return setSetting('password', { salt, hash });
}

function verifyPassword(pw) {
  const rec = ensurePassword();
  const hash = crypto.scryptSync(String(pw ?? ''), rec.salt, 64);
  const expected = Buffer.from(rec.hash, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function issue(res, req) {
  const token = sign({ exp: Date.now() + MAX_AGE_MS });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}${secure ? '; Secure' : ''}`);
}

function clear(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function isLoggedIn(req) {
  return !!verify(parseCookies(req)[COOKIE]);
}

/** API 보호 미들웨어 */
function requireAuth(req, res, next) {
  if (isLoggedIn(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}

module.exports = { ensurePassword, setPassword, verifyPassword, issue, clear, isLoggedIn, requireAuth };
