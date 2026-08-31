/* 앱 껍데기: 로그인, 화면 전환(라우터), 홈 대시보드 */
(function () {
  'use strict';
  const { esc, toast, initial } = window.ui;

  const rootEl = document.getElementById('root');
  let shopName = '미용실 고객관리';

  const NAV = [
    { hash: '#/', icon: '🏠', label: '홈' },
    { hash: '#/customers', icon: '👤', label: '고객' },
    { hash: '#/visits', icon: '✂️', label: '내역' },
    { hash: '#/import', icon: '📥', label: '연동' },
    { hash: '#/settings', icon: '⚙️', label: '설정' },
  ];

  /* ---------------- 로그인 ---------------- */
  function renderLogin() {
    rootEl.innerHTML = `
      <div class="login-wrap">
        <div class="card login-card">
          <div class="logo">💇‍♀️</div>
          <h2 class="center" style="margin:6px 0 18px">${esc(shopName)}</h2>
          <label class="field"><span>비밀번호</span><input type="password" id="pw" autocomplete="current-password"></label>
          <button class="btn primary block" id="go">들어가기</button>
          <p class="tiny muted center mt">직원 공용 비밀번호로 접속합니다.</p>
        </div>
      </div>`;
    const pw = rootEl.querySelector('#pw');
    const submit = async () => {
      try {
        await api.post('/api/login', { password: pw.value }, { allow401: true });
        start();
      } catch (e) {
        toast(e.message, 'err');
        pw.select();
      }
    };
    rootEl.querySelector('#go').onclick = submit;
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    pw.focus();
  }

  /* ---------------- 껍데기 ---------------- */
  function renderShell() {
    rootEl.innerHTML = `
      <div class="app">
        <div class="topbar">
          <button class="btn ghost small hidden" id="back">‹ 뒤로</button>
          <h1 id="title">${esc(shopName)}</h1>
          <div class="spacer"></div>
        </div>
        <main id="main"></main>
        <nav class="bottom-nav">
          ${NAV.map((n) => `<a href="${n.hash}" data-nav="${n.hash}"><span class="ico">${n.icon}</span>${n.label}</a>`).join('')}
        </nav>
      </div>`;
    rootEl.querySelector('#back').onclick = () => history.back();
  }

  /* ---------------- 라우터 ---------------- */
  async function route() {
    const hash = location.hash || '#/';
    const main = document.getElementById('main');
    if (!main) return;

    const titleEl = document.getElementById('title');
    const backEl = document.getElementById('back');
    const parts = hash.replace(/^#\//, '').split('/');
    const page = parts[0] || '';

    document.querySelectorAll('[data-nav]').forEach((a) => {
      const target = a.dataset.nav;
      const active = target === '#/' ? hash === '#/' : hash.startsWith(target)
        || (target === '#/import' && hash.startsWith('#/export'));
      a.classList.toggle('active', active);
    });

    backEl.classList.toggle('hidden', !(page === 'customers' && parts[1]));

    try {
      if (page === '' ) { titleEl.textContent = shopName; return renderHome(main); }
      if (page === 'customers' && parts[1]) { titleEl.textContent = '고객 상세'; return window.Views.customers.renderDetail(main, parts[1]); }
      if (page === 'customers') { titleEl.textContent = '고객'; return window.Views.customers.renderList(main); }
      if (page === 'visits') { titleEl.textContent = '방문 · 시술 내역'; return window.Views.visits.render(main); }
      if (page === 'import') { titleEl.textContent = '구글폼 가져오기'; return renderLinkPage(main, 'import'); }
      if (page === 'export') { titleEl.textContent = '내보내기'; return renderLinkPage(main, 'export'); }
      if (page === 'settings') { titleEl.textContent = '설정'; return window.Views.settings.renderSettings(main); }
      location.hash = '#/';
    } catch (e) {
      main.innerHTML = `<div class="container"><div class="card center muted">${esc(e.message)}</div></div>`;
    }
  }

  /** 연동 화면: 가져오기 / 내보내기 탭 */
  function renderLinkPage(main, tab) {
    main.innerHTML = `
      <div class="container" style="padding-bottom:0">
        <div class="chips">
          <button class="chip ${tab === 'import' ? 'on' : ''}" data-tab="import">📥 구글폼 가져오기</button>
          <button class="chip ${tab === 'export' ? 'on' : ''}" data-tab="export">📤 핸즈SOS 내보내기</button>
        </div>
      </div>
      <div id="tabBody"></div>`;
    main.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => { location.hash = b.dataset.tab === 'import' ? '#/import' : '#/export'; };
    });
    const body = main.querySelector('#tabBody');
    return tab === 'import' ? window.Views.importer.render(body) : window.Views.settings.renderExport(body);
  }

  /* ---------------- 홈 ---------------- */
  async function renderHome(main) {
    main.innerHTML = '<div class="container"><div class="card center muted">불러오는 중…</div></div>';
    const [stats, recent] = await Promise.all([
      api.get('/api/stats?months=12'),
      api.get('/api/visits?limit=8'),
    ]);
    const s = stats.summary;
    const maxAmount = Math.max(1, ...stats.monthly.map((m) => m.amount));

    main.innerHTML = `
      <div class="container">
        <div class="stat-grid mb">
          <div class="stat"><div class="label">이번 달 매출</div><div class="value">${fmt.won(s.revenue_month)}</div></div>
          <div class="stat"><div class="label">이번 달 방문</div><div class="value">${fmt.num(s.visits_month)}건</div></div>
          <div class="stat"><div class="label">이번 달 신규</div><div class="value">${fmt.num(s.new_customers_month)}명</div></div>
          <div class="stat"><div class="label">전체 고객</div><div class="value">${fmt.num(s.customers)}명</div></div>
        </div>

        ${s.unmatched_forms ? `
          <div class="card" style="border-color:var(--warn)">
            <div class="row">
              <div class="grow"><b>구글폼 응답 ${s.unmatched_forms}건</b><div class="small muted">동명이인이라 자동 연결하지 못했습니다.</div></div>
              <a class="btn small primary" href="#/import">확인</a>
            </div>
          </div>` : ''}

        <div class="card">
          <div class="row mb">
            <h2 class="grow" style="margin:0">최근 방문</h2>
            <a class="btn small ghost" href="#/visits">전체보기</a>
          </div>
          <div class="list">
            ${recent.items.length ? recent.items.map((v) => `
              <button class="item" data-customer="${v.customer_id}">
                <div class="avatar">${initial(v.customer_name)}</div>
                <div class="grow">
                  <div class="title">${esc(v.customer_name)}</div>
                  <div class="small muted ellipsis">${fmt.dateKo(v.visit_date)} · ${esc(v.services || '시술 내용 없음')}</div>
                </div>
                <div class="right nowrap small"><b>${fmt.won(v.amount)}</b></div>
              </button>`).join('')
              : '<div class="muted small center" style="padding:16px">아직 기록이 없습니다.<br>고객을 등록하거나 구글폼 파일을 가져와 보세요.</div>'}
          </div>
        </div>

        ${stats.monthly.length ? `
          <div class="card">
            <h2>월별 매출</h2>
            ${stats.monthly.map((m) => `
              <div class="mb">
                <div class="row tiny muted"><span class="grow">${esc(m.month.replace('-', '.'))}</span>
                  <span>${fmt.won(m.amount)} · ${m.visits}건</span></div>
                <div class="bar"><div style="width:${Math.round((m.amount / maxAmount) * 100)}%"></div></div>
              </div>`).join('')}
          </div>` : ''}

        ${stats.services.length ? `
          <div class="card">
            <h2>많이 하는 시술</h2>
            <div class="list">
              ${stats.services.slice(0, 6).map((v) => `
                <div class="item" style="cursor:default">
                  <div class="grow ellipsis">${esc(v.services)}</div>
                  <div class="right nowrap small muted">${v.n}건 · ${fmt.won(v.amount)}</div>
                </div>`).join('')}
            </div>
          </div>` : ''}

        ${stats.upcomingBirthdays.length ? `
          <div class="card">
            <h2>이번 달 생일 고객</h2>
            <div class="list">
              ${stats.upcomingBirthdays.map((c) => `
                <button class="item" data-customer="${c.id}">
                  <div class="avatar">🎂</div>
                  <div class="grow"><div class="title">${esc(c.name)}</div>
                    <div class="small muted">${fmt.dateKo(c.birthday)} · ${esc(c.phone_display || '')}</div></div>
                </button>`).join('')}
            </div>
          </div>` : ''}

        ${stats.sleeping.length ? `
          <div class="card">
            <h2>90일 이상 안 오신 고객 (${stats.sleeping.length})</h2>
            <div class="list">
              ${stats.sleeping.slice(0, 10).map((c) => `
                <button class="item" data-customer="${c.id}">
                  <div class="avatar">${initial(c.name)}</div>
                  <div class="grow"><div class="title">${esc(c.name)}</div>
                    <div class="small muted">마지막 방문 ${fmt.dateKo(c.last_visit_date)} · ${esc(fmt.ago(c.last_visit_date))}</div></div>
                  <div class="right tiny muted nowrap">${c.visit_count}회</div>
                </button>`).join('')}
            </div>
          </div>` : ''}
      </div>`;

    main.querySelectorAll('[data-customer]').forEach((el) => {
      el.onclick = () => { location.hash = `#/customers/${el.dataset.customer}`; };
    });
  }

  /* ---------------- 시작 ---------------- */
  async function start() {
    const me = await api.get('/api/me');
    shopName = me.shopName || shopName;
    document.title = `${shopName} · 고객관리`;
    if (!me.loggedIn) { renderLogin(); return; }
    renderShell();
    route();
  }

  window.App = {
    onLoggedOut() { renderLogin(); },
    async refreshShopName() {
      const me = await api.get('/api/me');
      shopName = me.shopName || shopName;
      document.title = `${shopName} · 고객관리`;
    },
  };

  window.addEventListener('hashchange', () => {
    if (document.getElementById('main')) route();
    else start();
  });
  start();
})();
