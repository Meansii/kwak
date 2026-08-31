'use strict';
const ExcelJS = require('exceljs');

/** RFC4180 기반 CSV 파서. 따옴표 안의 줄바꿈/쉼표를 처리하고 BOM을 제거한다. */
function parseCSV(text, delimiter = ',') {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function detectDelimiter(text) {
  const line = text.split('\n')[0] || '';
  const counts = { ',': 0, '\t': 0, ';': 0 };
  for (const ch of line) if (ch in counts) counts[ch]++;
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
}

/** 셀 값을 원시 타입 그대로(날짜는 Date, 숫자는 number) 뽑는다. */
function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.text !== undefined) return v.text;                  // hyperlink / richtext
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) return v.result;              // formula
    if (v.error) return '';
    return String(v);
  }
  return v;
}

/** CSV/XLSX 버퍼를 { headers: string[], rows: any[][] } 로 읽는다. */
async function readTable(buffer, filename = '') {
  const isExcel = /\.(xlsx|xlsm|xltx)$/i.test(filename);
  let grid;
  if (isExcel) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('엑셀 파일에 시트가 없습니다.');
    grid = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const arr = [];
      r.eachCell({ includeEmpty: true }, (cell, col) => { arr[col - 1] = cellValue(cell); });
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = '';
      grid.push(arr);
    });
  } else {
    const text = buffer.toString('utf8');
    grid = parseCSV(text, detectDelimiter(text));
  }
  if (!grid.length) return { headers: [], rows: [] };
  const headers = grid[0].map((h, i) => String(h ?? '').trim() || `열 ${i + 1}`);
  const rows = grid.slice(1).map((r) => {
    const out = [];
    for (let i = 0; i < headers.length; i++) out[i] = r[i] === undefined ? '' : r[i];
    return out;
  });
  return { headers, rows };
}

/** 배열 데이터를 CSV 문자열로. 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다. */
function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}

/** 배열 데이터를 xlsx 버퍼로. */
async function toXLSX(headers, rows, sheetName = 'Sheet1') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => {
    let width = String(headers[i] ?? '').length + 4;
    for (const r of rows) width = Math.max(width, String(r[i] ?? '').length + 2);
    col.width = Math.min(Math.max(width, 10), 40);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { parseCSV, readTable, toCSV, toXLSX };
