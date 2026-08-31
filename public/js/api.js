/* 서버 통신 + 공통 유틸 */
(function () {
  'use strict';

  async function request(method, url, body, opts) {
    const options = { method, headers: {}, credentials: 'same-origin' };
    if (body instanceof FormData) {
      options.body = body;
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (res.status === 401 && !(opts && opts.allow401)) {
      window.App && window.App.onLoggedOut();
      throw new Error('로그인이 필요합니다.');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `요청 실패 (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const api = {
    get: (url) => request('GET', url),
    post: (url, body, opts) => request('POST', url, body, opts),
    put: (url, body) => request('PUT', url, body),
    patch: (url, body) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),
  };

  /* ---------- 값 표시 유틸 ---------- */
  const fmt = {
    won: (n) => Number(n || 0).toLocaleString('ko-KR') + '원',
    num: (n) => Number(n || 0).toLocaleString('ko-KR'),
    date: (s) => (s ? String(s).slice(0, 10) : ''),
    dateKo(s) {
      if (!s) return '-';
      const [y, m, d] = String(s).slice(0, 10).split('-');
      if (!y || !m || !d) return s;
      return `${y}.${m}.${d}`;
    },
    phone(v) {
      const d = String(v || '').replace(/[^0-9]/g, '');
      if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
      if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
      return v || '';
    },
    /** 오늘 기준 며칠 전인지 */
    ago(s) {
      if (!s) return '';
      const diff = Math.floor((Date.now() - new Date(s + 'T00:00:00').getTime()) / 86400000);
      if (isNaN(diff)) return '';
      if (diff <= 0) return '오늘';
      if (diff === 1) return '어제';
      if (diff < 30) return `${diff}일 전`;
      if (diff < 365) return `${Math.floor(diff / 30)}개월 전`;
      return `${Math.floor(diff / 365)}년 전`;
    },
    today: () => new Date().toISOString().slice(0, 10),
  };

  window.api = api;
  window.fmt = fmt;
})();
