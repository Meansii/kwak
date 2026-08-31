/* 구글폼(엑셀/CSV) 가져오기 화면 */
(function () {
  'use strict';
  const { esc, toast, openModal, closeModal, confirmDialog } = window.ui;

  const state = { step: 1, fields: [], preview: null, mapping: {}, analysis: null };

  const STATUS_LABEL = {
    matched: ['기존 고객 연결', 'ok'],
    new: ['신규 고객 등록', ''],
    duplicate: ['이미 가져온 응답', 'gray'],
    skipped: ['이름·연락처 없음', 'gray'],
    ambiguous: ['동명이인 확인 필요', 'warn'],
  };

  async function render(root) {
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>구글폼 응답 가져오기</h2>
          <p class="small muted" style="margin-top:0">
            구글 설문지 응답 시트를 <b>파일 → 다운로드 → CSV(.csv) 또는 엑셀(.xlsx)</b> 로 받아서 올려주세요.
            연락처가 같으면 기존 고객에게 자동으로 붙고, 없으면 새 고객으로 등록됩니다.
            같은 응답을 다시 올려도 중복으로 쌓이지 않습니다.
          </p>
          <div class="steps">
            ${['1. 파일 올리기', '2. 열 연결', '3. 확인 후 저장'].map((label, i) => `
              <div class="step ${state.step === i + 1 ? 'on' : ''}">${label}</div>`).join('')}
          </div>
          <div id="stepBody"></div>
        </div>
        <div class="card" id="unmatchedCard"></div>
        <div class="card" id="historyCard"></div>
      </div>`;

    renderStep(root);
    loadUnmatched(root);
    loadHistory(root);
  }

  function renderStep(root) {
    const box = root.querySelector('#stepBody');
    if (state.step === 1) return renderUpload(root, box);
    if (state.step === 2) return renderMapping(root, box);
    return renderConfirm(root, box);
  }

  /* ---------- 1단계: 파일 ---------- */
  function renderUpload(root, box) {
    box.innerHTML = `
      <div class="dropzone" id="drop">
        📄 CSV · 엑셀 파일을 끌어놓거나 눌러서 선택하세요
        <div class="tiny mt">구글 설문지 응답 시트 / 기존 고객 명단 엑셀 모두 가능합니다</div>
      </div>
      <input type="file" id="file" accept=".csv,.xlsx,.xlsm,.tsv,text/csv" class="hidden">
      <div id="uploading" class="hidden mt"><div class="bar"><div style="width:60%"></div></div><div class="tiny muted mt">파일을 읽는 중…</div></div>`;

    const drop = box.querySelector('#drop');
    const input = box.querySelector('#file');
    drop.onclick = () => input.click();
    input.onchange = () => upload(root, input.files[0]);
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload(root, e.dataTransfer.files[0]));
  }

  async function upload(root, file) {
    if (!file) return;
    const box = root.querySelector('#stepBody');
    box.querySelector('#uploading').classList.remove('hidden');
    try {
      const [fields, preview] = await Promise.all([
        state.fields.length ? { fields: state.fields } : api.get('/api/import/fields'),
        (() => {
          const form = new FormData();
          form.append('file', file);
          return api.post('/api/import/preview', form);
        })(),
      ]);
      state.fields = fields.fields || state.fields;
      state.preview = preview;
      state.mapping = { ...preview.mapping };
      state.step = 2;
      render(root);
      toast(`${preview.rowCount}줄을 읽었습니다.`);
    } catch (e) {
      box.querySelector('#uploading').classList.add('hidden');
      toast(e.message, 'err');
    }
  }

  /* ---------- 2단계: 열 연결 ---------- */
  function renderMapping(root, box) {
    const p = state.preview;
    const options = (selected) => [
      `<option value="">— 사용 안 함 —</option>`,
      ...p.headers.map((h, i) => `<option value="${i}" ${String(selected) === String(i) ? 'selected' : ''}>${esc(h)}</option>`),
    ].join('');

    box.innerHTML = `
      <div class="small muted mb">
        <b>${esc(p.filename)}</b> · ${fmt.num(p.rowCount)}줄 · 자동으로 연결해 두었습니다. 틀린 항목만 바꿔주세요.
      </div>
      ${state.fields.map((f) => `
        <div class="map-row">
          <div class="name">${esc(f.label)}${f.required ? ' <span style="color:var(--danger)">*</span>' : ''}</div>
          <select data-field="${f.key}">${options(state.mapping[f.key])}</select>
        </div>
        <div class="tiny muted" style="margin:-4px 0 8px" data-sample="${f.key}"></div>`).join('')}
      <details class="mt">
        <summary class="small muted" style="cursor:pointer">파일 내용 미리보기</summary>
        <div class="table-wrap mt">
          <table>
            <thead><tr>${p.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${p.sample.map((r) => `<tr>${p.headers.map((_, i) => `<td>${esc(String(r[i] ?? '').slice(0, 40))}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </details>
      <div class="row mt" style="justify-content:flex-end">
        <button class="btn" id="back">다른 파일 선택</button>
        <button class="btn primary" id="next">다음: 결과 확인</button>
      </div>`;

    function refreshSamples() {
      for (const f of state.fields) {
        const idx = state.mapping[f.key];
        const el = box.querySelector(`[data-sample="${f.key}"]`);
        if (idx === null || idx === undefined || idx === '') { el.textContent = ''; continue; }
        const vals = p.sample.map((r) => String(r[idx] ?? '').trim()).filter(Boolean).slice(0, 2);
        el.textContent = vals.length ? `예시: ${vals.join(' / ')}` : '';
      }
    }
    box.querySelectorAll('[data-field]').forEach((sel) => {
      sel.onchange = () => {
        state.mapping[sel.dataset.field] = sel.value === '' ? null : Number(sel.value);
        refreshSamples();
      };
    });
    refreshSamples();

    box.querySelector('#back').onclick = () => { state.step = 1; state.preview = null; render(root); };
    box.querySelector('#next').onclick = async () => {
      if (state.mapping.name === null || state.mapping.name === undefined) {
        return toast('고객 이름 열을 반드시 연결해 주세요.', 'err');
      }
      try {
        state.analysis = await api.post('/api/import/analyze', { token: state.preview.token, mapping: state.mapping });
        state.step = 3;
        render(root);
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  }

  /* ---------- 3단계: 확인 후 저장 ---------- */
  function renderConfirm(root, box) {
    const a = state.analysis;
    const c = a.counts;
    box.innerHTML = `
      <div class="stat-grid mb">
        <div class="stat"><div class="label">기존 고객 연결</div><div class="value">${c.matched}건</div></div>
        <div class="stat"><div class="label">신규 고객</div><div class="value">${c.new}건</div></div>
        <div class="stat"><div class="label">중복(건너뜀)</div><div class="value">${c.duplicate}건</div></div>
        <div class="stat"><div class="label">확인 필요</div><div class="value">${c.ambiguous + c.skipped}건</div></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>처리</th><th>이름</th><th>연락처</th><th>방문일</th><th>시술</th><th>금액</th></tr></thead>
          <tbody>
            ${a.items.map((it) => `
              <tr>
                <td><span class="badge ${STATUS_LABEL[it.status][1]}">${STATUS_LABEL[it.status][0]}</span></td>
                <td>${esc(it.data.name)}</td>
                <td>${esc(it.data.phone_display)}</td>
                <td>${esc(it.data.visit_date)}</td>
                <td>${esc(it.data.services)}</td>
                <td>${it.data.amount ? fmt.won(it.data.amount) : ''}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${a.total > a.items.length ? `<div class="tiny muted mt">앞의 ${a.items.length}줄만 표시했습니다. (전체 ${fmt.num(a.total)}줄)</div>` : ''}
      <div class="row mt" style="justify-content:flex-end">
        <button class="btn" id="back">열 연결 다시하기</button>
        <button class="btn primary" id="commit">저장하기</button>
      </div>`;

    box.querySelector('#back').onclick = () => { state.step = 2; render(root); };
    box.querySelector('#commit').onclick = async () => {
      const btn = box.querySelector('#commit');
      btn.disabled = true;
      btn.textContent = '저장 중…';
      try {
        const r = await api.post('/api/import/commit', { token: state.preview.token, mapping: state.mapping });
        state.step = 1;
        state.preview = null;
        state.analysis = null;
        render(root);
        openModal({
          title: '가져오기 완료',
          body: `<ul class="small" style="padding-left:18px">
              <li>신규 고객 <b>${r.stats.customersCreated}</b>명 등록</li>
              <li>기존 고객 정보 <b>${r.stats.customersUpdated}</b>건 보완</li>
              <li>방문 기록 <b>${r.stats.visitsCreated}</b>건 추가</li>
              <li>사진 링크 <b>${r.stats.photos}</b>건 연결</li>
              <li>중복으로 건너뜀 <b>${r.stats.duplicates}</b>건</li>
            </ul>
            <div class="row mt" style="justify-content:flex-end"><button class="btn primary" id="ok">확인</button></div>`,
          onMount(el) { el.querySelector('#ok').onclick = closeModal; },
        });
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false;
        btn.textContent = '저장하기';
      }
    };
  }

  /* ---------- 연결 실패 응답 ---------- */
  async function loadUnmatched(root) {
    const card = root.querySelector('#unmatchedCard');
    const data = await api.get('/api/import/unmatched');
    if (!data.items.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    card.innerHTML = `
      <h2>연결하지 못한 응답 (${data.items.length})</h2>
      <p class="small muted" style="margin-top:0">동명이인이 있어 자동 연결을 멈춘 응답입니다. 어느 고객인지 직접 골라주세요.</p>
      <div class="list">
        ${data.items.map((r) => `
          <div class="item" style="cursor:default">
            <div class="grow">
              <div class="title">${esc(r.name || '(이름없음)')}</div>
              <div class="small muted">${esc(fmt.phone(r.phone) || '연락처 없음')} · ${esc(r.submitted_at || '')}</div>
              <div class="tiny muted ellipsis">${esc((r.raw.item && r.raw.item.services) || '')}</div>
            </div>
            <button class="btn small primary" data-link="${r.id}">고객 연결</button>
          </div>`).join('')}
      </div>`;
    card.querySelectorAll('[data-link]').forEach((b) => {
      b.onclick = () => window.Views.visits.pickCustomer(async (c) => {
        await api.post(`/api/import/unmatched/${b.dataset.link}/link`, { customer_id: c.id });
        toast(`${c.name} 고객에게 연결했습니다.`);
        render(root);
      });
    });
  }

  /* ---------- 가져오기 기록 ---------- */
  async function loadHistory(root) {
    const card = root.querySelector('#historyCard');
    const data = await api.get('/api/import/batches');
    if (!data.items.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    card.innerHTML = `
      <h2>가져오기 기록</h2>
      <div class="list">
        ${data.items.map((b) => `
          <div class="item" style="cursor:default">
            <div class="grow">
              <div class="title ellipsis">${esc(b.filename || '이름 없는 파일')}</div>
              <div class="small muted">${esc(String(b.created_at).slice(0, 16).replace('T', ' '))} ·
                고객 ${b.stats.customersCreated || 0}명 / 방문 ${b.stats.visitsCreated || 0}건</div>
            </div>
            <button class="btn small danger" data-undo="${b.id}">되돌리기</button>
          </div>`).join('')}
      </div>`;
    card.querySelectorAll('[data-undo]').forEach((b) => {
      b.onclick = async () => {
        const ok = await confirmDialog('이 가져오기로 만들어진 방문 기록을 지웁니다.\n(새로 만들어진 고객 정보는 남습니다.)', { okText: '되돌리기', danger: true });
        if (!ok) return;
        const r = await api.del(`/api/import/batches/${b.dataset.undo}`);
        toast(`방문 기록 ${r.visits_removed}건을 되돌렸습니다.`);
        render(root);
      };
    });
  }

  window.Views = window.Views || {};
  window.Views.importer = { render };
})();
