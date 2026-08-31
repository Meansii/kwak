/* 방문·시술 내역 전체 목록 */
(function () {
  'use strict';
  const { esc, multiline, toast, openModal, closeModal, initial } = window.ui;

  const state = { preset: 'month', from: '', to: '', q: '' };

  function rangeOf(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (preset === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    if (preset === 'last') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    if (preset === '3m') return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))];
    if (preset === 'year') return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    return ['', ''];
  }

  async function render(root) {
    const [defFrom, defTo] = rangeOf(state.preset);
    if (state.preset !== 'custom') { state.from = defFrom; state.to = defTo; }

    root.innerHTML = `
      <div class="container">
        <div class="card">
          <div class="chips mb">
            ${[['month', '이번달'], ['last', '지난달'], ['3m', '최근 3개월'], ['year', '올해'], ['all', '전체'], ['custom', '직접 선택']]
              .map(([k, l]) => `<button class="chip ${state.preset === k ? 'on' : ''}" data-preset="${k}">${l}</button>`).join('')}
          </div>
          <div class="grid2 ${state.preset === 'custom' ? '' : 'hidden'}" id="customRange">
            <label class="field"><span>시작일</span><input type="date" id="from" value="${esc(state.from)}"></label>
            <label class="field"><span>종료일</span><input type="date" id="to" value="${esc(state.to)}"></label>
          </div>
          <input type="search" id="q" placeholder="고객명 · 시술 · 담당자 검색" value="${esc(state.q)}">
        </div>
        <div id="summary"></div>
        <div id="list"></div>
      </div>
      <button class="fab" id="add" aria-label="방문 기록 추가">+</button>`;

    root.querySelectorAll('[data-preset]').forEach((b) => {
      b.onclick = () => { state.preset = b.dataset.preset; render(root); };
    });
    const fromEl = root.querySelector('#from');
    const toEl = root.querySelector('#to');
    if (fromEl) fromEl.onchange = () => { state.from = fromEl.value; load(); };
    if (toEl) toEl.onchange = () => { state.to = toEl.value; load(); };
    let timer;
    root.querySelector('#q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 220);
    });
    root.querySelector('#add').onclick = () => pickCustomer((c) => {
      window.Views.customers.openVisitForm({ customer_id: c.id }, () => load());
    });

    const listEl = root.querySelector('#list');
    const sumEl = root.querySelector('#summary');

    async function load() {
      listEl.innerHTML = '<div class="card center muted">불러오는 중…</div>';
      const params = new URLSearchParams();
      if (state.from) params.set('from', state.from);
      if (state.to) params.set('to', state.to);
      if (state.q) params.set('q', state.q);
      params.set('limit', '500');
      const data = await api.get(`/api/visits?${params}`);

      sumEl.innerHTML = `<div class="stat-grid mb">
        <div class="stat"><div class="label">방문 건수</div><div class="value">${fmt.num(data.count)}건</div></div>
        <div class="stat"><div class="label">합계 매출</div><div class="value">${fmt.won(data.total_amount)}</div></div>
        <div class="stat"><div class="label">건당 평균</div><div class="value">${fmt.won(data.count ? Math.round(data.total_amount / data.count) : 0)}</div></div>
      </div>`;

      if (!data.items.length) {
        listEl.innerHTML = '<div class="card center muted">해당 기간에 기록이 없습니다.</div>';
        return;
      }

      const groups = new Map();
      for (const v of data.items) {
        if (!groups.has(v.visit_date)) groups.set(v.visit_date, []);
        groups.get(v.visit_date).push(v);
      }
      listEl.innerHTML = [...groups.entries()].map(([date, items]) => `
        <div class="card">
          <div class="row mb">
            <h2 style="margin:0" class="grow">${fmt.dateKo(date)} <span class="tiny muted">${esc(fmt.ago(date))}</span></h2>
            <span class="badge">${fmt.won(items.reduce((a, v) => a + (v.amount || 0), 0))}</span>
          </div>
          <div class="list">
            ${items.map((v) => `
              <button class="item" data-customer="${v.customer_id}">
                <div class="avatar">${initial(v.customer_name)}</div>
                <div class="grow">
                  <div class="title">${esc(v.customer_name)}</div>
                  <div class="small muted ellipsis">${esc(v.services || '시술 내용 없음')}${v.designer ? ` · ${esc(v.designer)}` : ''}</div>
                  ${v.photo_count ? `<div class="tiny muted">📷 ${v.photo_count}장</div>` : ''}
                </div>
                <div class="right nowrap">
                  <div class="small"><b>${fmt.won(v.amount)}</b></div>
                  <div class="tiny muted">${esc(v.pay_method || '')}</div>
                </div>
              </button>`).join('')}
          </div>
        </div>`).join('');

      listEl.querySelectorAll('[data-customer]').forEach((el) => {
        el.onclick = () => { location.hash = `#/customers/${el.dataset.customer}`; };
      });
    }
    load();
  }

  /** 고객 선택 모달 (방문 기록을 어느 고객에 붙일지 고를 때) */
  function pickCustomer(onPick) {
    openModal({
      title: '고객 선택',
      body: `
        <input type="search" id="pick-q" placeholder="이름 또는 연락처 검색" autocomplete="off">
        <div class="list mt" id="pick-list" style="max-height:50vh;overflow:auto"></div>
        <div class="mt"><button class="btn block" id="pick-new">+ 새 고객 등록하기</button></div>`,
      onMount(el) {
        const input = el.querySelector('#pick-q');
        const list = el.querySelector('#pick-list');
        let timer;
        async function search() {
          const data = await api.get(`/api/customers?q=${encodeURIComponent(input.value.trim())}&limit=30`);
          list.innerHTML = data.items.length
            ? data.items.map((c) => `
              <button class="item" data-id="${c.id}">
                <div class="avatar">${initial(c.name)}</div>
                <div class="grow">
                  <div class="title">${esc(c.name)}</div>
                  <div class="small muted">${esc(c.phone_display || fmt.phone(c.phone) || '')}</div>
                </div>
              </button>`).join('')
            : '<div class="muted small center" style="padding:16px">검색 결과가 없습니다.</div>';
          list.querySelectorAll('[data-id]').forEach((b) => {
            b.onclick = () => {
              const c = data.items.find((x) => x.id === Number(b.dataset.id));
              closeModal();
              onPick(c);
            };
          });
        }
        input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
        el.querySelector('#pick-new').onclick = () => {
          closeModal();
          window.Views.customers.openCustomerForm(null, () => toast('고객을 등록했습니다. 목록에서 선택해 주세요.'));
        };
        search();
        input.focus();
      },
    });
  }

  window.Views = window.Views || {};
  window.Views.visits = { render, pickCustomer };
})();
