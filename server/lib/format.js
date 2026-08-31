'use strict';

/** 전화번호에서 숫자만 남기고 국가번호(+82)를 국내 형식으로 정규화한다. */
function normalizePhone(input) {
  if (input === null || input === undefined) return '';
  let digits = String(input).replace(/[^0-9]/g, '');
  if (!digits) return '';
  // +82 10 1234 5678 -> 01012345678
  if (digits.startsWith('82') && digits.length >= 11) digits = '0' + digits.slice(2);
  if (digits.startsWith('082')) digits = '0' + digits.slice(3);
  // 엑셀에서 앞자리 0이 날아간 경우: 1012345678 -> 01012345678
  if (digits.length === 10 && digits.startsWith('10')) digits = '0' + digits;
  return digits;
}

/** 01012345678 -> 010-1234-5678 */
function formatPhone(input) {
  const d = normalizePhone(input);
  if (!d) return '';
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10 && d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return d;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** 다양한 형태(구글폼 타임스탬프, 엑셀 시리얼, 한국식 날짜)를 YYYY-MM-DD 로 변환한다. */
function parseDate(input) {
  if (input === null || input === undefined || input === '') return '';
  if (input instanceof Date && !isNaN(input)) return toISODate(input);

  if (typeof input === 'number' || /^\d+(\.\d+)?$/.test(String(input).trim())) {
    const serial = Number(input);
    // 엑셀 날짜 시리얼 범위 (1900-01-01 ~ 2149년경). 8자리 숫자(20240131)는 아래에서 처리.
    if (serial > 20 && serial < 90000) {
      return toISODate(new Date(EXCEL_EPOCH + Math.floor(serial) * 86400000));
    }
  }

  const s = String(input).trim();
  let m = s.match(/^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[.\-/월\s]+(\d{1,2})/); // 연도 없는 생일 등 -> 올해 기준
  if (m && !/\d{4}/.test(s)) {
    const y = new Date().getFullYear();
    return `${y}-${pad2(m[1])}-${pad2(m[2])}`;
  }
  const d = new Date(s);
  if (!isNaN(d)) return toISODate(d);
  return '';
}

/** 구글폼 타임스탬프에서 HH:MM 을 뽑아낸다. */
function parseTime(input) {
  if (input === null || input === undefined || input === '') return '';
  if (input instanceof Date && !isNaN(input)) {
    return `${pad2(input.getHours())}:${pad2(input.getMinutes())}`;
  }
  const s = String(input);
  const m = s.match(/(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})/i);
  if (!m) return '';
  let h = Number(m[2]);
  const marker = (m[1] || '').toUpperCase();
  if (marker === '오후' || marker === 'PM') { if (h < 12) h += 12; }
  if (marker === '오전' || marker === 'AM') { if (h === 12) h = 0; }
  return `${pad2(h)}:${m[3]}`;
}

/** "5만원", "50,000원", "50000" -> 50000 */
function parseAmount(input) {
  if (input === null || input === undefined || input === '') return 0;
  if (typeof input === 'number') return Math.round(input);
  const s = String(input).trim().replace(/,/g, '');
  const man = s.match(/^(\d+(?:\.\d+)?)\s*만\s*(\d+)?\s*천?\s*원?$/);
  if (man) {
    let v = Number(man[1]) * 10000;
    if (man[2]) v += Number(man[2]) * (man[2].length <= 1 ? 1000 : 1);
    return Math.round(v);
  }
  const num = s.replace(/[^0-9.\-]/g, '');
  if (!num) return 0;
  return Math.round(Number(num)) || 0;
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayISO() {
  return toISODate(new Date());
}

function nowISO() {
  return new Date().toISOString();
}

function won(n) {
  return Number(n || 0).toLocaleString('ko-KR');
}

module.exports = {
  normalizePhone, formatPhone, parseDate, parseTime, parseAmount,
  toISODate, todayISO, nowISO, won,
};
