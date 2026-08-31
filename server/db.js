'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'kwak.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,                 -- 숫자만 남긴 정규화 번호 (매칭용)
  phone_display TEXT,         -- 화면 표시용 원본 번호
  gender TEXT,
  birthday TEXT,              -- YYYY-MM-DD
  email TEXT,
  address TEXT,
  hair_note TEXT,             -- 모발/두피 특이사항
  allergy TEXT,               -- 알러지/주의사항
  tags TEXT,                  -- 쉼표 구분
  memo TEXT,
  privacy_agreed INTEGER NOT NULL DEFAULT 0,
  first_visit_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_date TEXT NOT NULL,   -- YYYY-MM-DD
  visit_time TEXT,            -- HH:MM
  services TEXT,              -- 시술명 (쉼표 구분)
  details TEXT,               -- 시술기록 상세 (컬러 레시피, 펌 약제 등)
  designer TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  pay_method TEXT,
  memo TEXT,
  source TEXT NOT NULL DEFAULT 'manual',  -- manual | google_form
  import_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
  filename TEXT,              -- 서버에 저장된 파일명 (외부 링크만 있는 경우 NULL)
  source_url TEXT,            -- 구글폼 파일 업로드 링크 등 외부 이미지 주소
  original_name TEXT,
  mime TEXT,
  size INTEGER,
  kind TEXT NOT NULL DEFAULT 'after',   -- before | after | etc
  caption TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_customer ON photos(customer_id);
CREATE INDEX IF NOT EXISTS idx_photos_visit ON photos(visit_id);

-- 구글폼 원본 응답 보관 (매칭 실패 건을 나중에 수동 연결하기 위함)
CREATE TABLE IF NOT EXISTS form_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
  submitted_at TEXT,
  name TEXT,
  phone TEXT,
  raw TEXT NOT NULL,          -- JSON
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'matched',  -- matched | created | unmatched | duplicate
  import_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_form_status ON form_responses(status);

CREATE TABLE IF NOT EXISTS import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  mapping TEXT,               -- JSON
  stats TEXT,                 -- JSON
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
  return value;
}

module.exports = { db, getSetting, setSetting, DATA_DIR, UPLOAD_DIR };
