/* 핸즈SOS 내보내기 설정 + 매장 설정 */
(function () {
  'use strict';
  const { esc, toast, openModal, closeModal, confirmDialog } = window.ui;

  const state = { type: 'customers', meta: null, template: [], from: '', to: '' };

  /* ================= 내보내기 ================= */
  async function renderExport(root) {
    if (!state.meta) state.meta = await api.get('/api/export/fields');
    if (!state.template.length) state.template = state.meta.templates[state.type].map((c) => ({ ...c }));

    const profile = state.meta.profileName || '핸즈SOS';
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>${esc(profile)} 내보내기</h2>
          <p class="small muted" style="margin-top:0">
            ${esc(profile)} 등 다른 프로그램에 올릴 엑셀/CSV 파일을 만듭니다.
            그 프로그램의 업로드 양식에 맞게 <b>열 이름과 순서</b>를 바꿔두면, 다음부터는 다운로드만 하면 됩니다.
          </p>
          <div class="chips mb">
            <button class="chip ${state.type === 'customers' ? 'on' : ''}" data-type="customers">고객 목록</button>
            <button class="chip ${state.type === 'visits' ? 'on' : ''}" data-type="visits">시술 내역</button>
          </div>

          <div id="cols"></div>
          <div class="row mt">
            <button class="btn small" id="addCol">+ 열 추가</button>
            <button class="btn small ghost" id="resetCol">기본값으로</button>
            <div class="grow"></div>
            <button class="btn small primary" id="saveTpl">양식 저장</button>
          </div>

          ${state.type === 'visits' ? `
            <div class="grid2 mt">
              <label class="field"><span>시작일 (선택)</span><input type="date" id="ex-from" value="${esc(state.from)}"></label>
              <label class="field"><span>종료일 (선택)</span><input type="date" id="ex-to" value="${esc(state.to)}"></label>
            </div>` : ''}

          <h3>미리보기</h3>
          <div class="table-wrap" id="preview"></div>

          <div class="row mt">
            <button class="btn primary grow" id="dlXlsx">엑셀(.xlsx) 다운로드</button>
            <button class="btn grow" id="dlCsv">CSV 다운로드</button>
          </div>
        </div>

        <div class="card">
          <h2>연동 방법</h2>
          <ol class="small muted" style="padding-left:18px;margin:0">
            <li>${esc(profile)}에서 고객/매출 <b>일괄 업로드(엑셀 가져오기)</b> 화면을 엽니다.</li>
            <li>그 화면에 적힌 열 이름을 위 <b>열 이름</b> 칸에 그대로 적고 <b>양식 저장</b>을 누릅니다.</li>
            <li><b>엑셀 다운로드</b>로 받은 파일을 그대로 올리면 됩니다.</li>
          </ol>
          <p class="tiny muted mt">
            ※ ${esc(profile)}가 API 연동을 제공한다면 서버의 <code>server/lib/exporter.js</code> 의 데이터 생성 부분을
            그대로 재사용해 자동 전송으로 바꿀 수 있습니다.
          </p>
        </div>
      </div>`;

    root.querySelectorAll('[data-type]').forEach((b) => {
      b.onclick = () => {
        state.type = b.dataset.type;
        state.template = state.meta.templates[state.type].map((c) => ({ ...c }));
        renderExport(root);
      };
    });

    const fields = state.type === 'customers' ? state.meta.customerFields : state.meta.visitFields;
    const colsEl = root.querySelector('#cols');

    function drawCols() {
      colsEl.innerHTML = state.template.map((c, i) => `
        <div class="col-row">
          <input type="text" value="${esc(c.header)}" data-header="${i}" placeholder="엑셀 열 이름">
          <select data-field="${i}">
            ${fields.map((f) => `<option value="${f.key}" ${f.key === c.field ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
          </select>
          <span class="moves">
            <button class="btn small" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn small" data-down="${i}" ${i === state.template.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn small danger" data-del="${i}">×</button>
          </span>
        </div>`).join('');

      let headerTimer;
      colsEl.querySelectorAll('[data-header]').forEach((el) => {
        el.oninput = () => {
          state.template[Number(el.dataset.header)].header = el.value;
          clearTimeout(headerTimer);
          headerTimer = setTimeout(preview, 350);   // 입력한 열 이름을 미리보기에 바로 반영
        };
      });
      colsEl.querySelectorAll('[data-field]').forEach((el) => {
        el.onchange = () => { state.template[Number(el.dataset.field)].field = el.value; preview(); };
      });
      colsEl.querySelectorAll('[data-up]').forEach((el) => {
        el.onclick = () => { const i = Number(el.dataset.up); swap(i, i - 1); };
      });
      colsEl.querySelectorAll('[data-down]').forEach((el) => {
        el.onclick = () => { const i = Number(el.dataset.down); swap(i, i + 1); };
      });
      colsEl.querySelectorAll('[data-del]').forEach((el) => {
        el.onclick = () => { state.template.splice(Number(el.dataset.del), 1); drawCols(); preview(); };
      });
    }

    function swap(a, b) {
      const t = state.template[a];
      state.template[a] = state.template[b];
      state.template[b] = t;
      drawCols();
      preview();
    }

    async function preview() {
      const body = { type: state.type, template: state.template, from: state.from || null, to: state.to || null };
      const data = await api.post('/api/export/preview', body);
      const box = root.querySelector('#preview');
      if (!data.rows.length) {
        box.innerHTML = '<div class="muted small center" style="padding:16px">내보낼 자료가 없습니다.</div>';
        return;
      }
      box.innerHTML = `<table>
        <thead><tr>${data.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${data.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(String(v).slice(0, 30))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <div class="tiny muted mt">전체 ${fmt.num(data.total)}줄 중 앞 ${data.rows.length}줄</div>`;
    }

    root.querySelector('#addCol').onclick = () => {
      const used = new Set(state.template.map((c) => c.field));
      const next = fields.find((f) => !used.has(f.key)) || fields[0];
      state.template.push({ header: next.label, field: next.key });
      drawCols();
      preview();
    };
    root.querySelector('#resetCol').onclick = () => {
      state.template = state.meta.defaults[state.type].map((c) => ({ ...c }));
      drawCols();
      preview();
    };
    root.querySelector('#saveTpl').onclick = async () => {
      await api.put(`/api/export/template/${state.type}`, { template: state.template });
      state.meta = await api.get('/api/export/fields');
      toast('양식을 저장했습니다.');
    };

    const fromEl = root.querySelector('#ex-from');
    const toEl = root.querySelector('#ex-to');
    if (fromEl) fromEl.onchange = () => { state.from = fromEl.value; preview(); };
    if (toEl) toEl.onchange = () => { state.to = toEl.value; preview(); };

    const download = (format) => {
      const params = new URLSearchParams({ type: state.type, format });
      if (state.from) params.set('from', state.from);
      if (state.to) params.set('to', state.to);
      window.location.href = `/api/export/download?${params}`;
    };
    root.querySelector('#dlXlsx').onclick = () => download('xlsx');
    root.querySelector('#dlCsv').onclick = () => download('csv');

    drawCols();
    preview();
  }

  /* ================= 설정 ================= */
  async function renderSettings(root) {
    const s = await api.get('/api/settings');
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <h2>매장 설정</h2>
          <label class="field"><span>매장 이름</span><input type="text" id="shop" value="${esc(s.shopName)}"></label>
          <button class="btn primary" id="saveShop">저장</button>
        </div>

        <div class="card">
          <h2>비밀번호 변경</h2>
          <label class="field"><span>현재 비밀번호</span><input type="password" id="pw-cur" autocomplete="current-password"></label>
          <label class="field"><span>새 비밀번호 (6자 이상)</span><input type="password" id="pw-new" autocomplete="new-password"></label>
          <button class="btn primary" id="savePw">변경</button>
        </div>

        <div class="card">
          <h2>백업</h2>
          <p class="small muted" style="margin-top:0">
            고객·방문·사진 정보를 JSON 파일로 내려받습니다. 사진 원본은 서버의 <code>data/uploads</code> 폴더를 함께 복사해 두세요.
          </p>
          <button class="btn block" id="backup">전체 백업 내려받기</button>
        </div>

        <div class="card">
          <h2>개인정보 안내</h2>
          <p class="small muted" style="margin:0">
            이 앱에는 고객 이름·연락처·사진 등 개인정보가 담깁니다.
            비밀번호를 꼭 바꾸고, 외부에서 접속한다면 반드시 HTTPS를 사용하세요.
            퇴사·폐업 등으로 더 이상 보관할 필요가 없는 정보는 고객 삭제 기능으로 지워주세요.
          </p>
        </div>

        <div class="card">
          <button class="btn block" id="logout">로그아웃</button>
        </div>
      </div>`;

    root.querySelector('#saveShop').onclick = async () => {
      await api.put('/api/settings', { shopName: root.querySelector('#shop').value.trim() });
      toast('저장했습니다.');
      window.App.refreshShopName();
    };
    root.querySelector('#savePw').onclick = async () => {
      const current = root.querySelector('#pw-cur').value;
      const next = root.querySelector('#pw-new').value;
      try {
        await api.post('/api/settings/password', { current, next });
        toast('비밀번호를 변경했습니다.');
        root.querySelector('#pw-cur').value = '';
        root.querySelector('#pw-new').value = '';
      } catch (e) {
        toast(e.message, 'err');
      }
    };
    root.querySelector('#backup').onclick = () => { window.location.href = '/api/backup'; };
    root.querySelector('#logout').onclick = async () => {
      if (!(await confirmDialog('로그아웃할까요?'))) return;
      await api.post('/api/logout');
      window.App.onLoggedOut();
    };
  }

  window.Views = window.Views || {};
  window.Views.settings = { renderExport, renderSettings };
})();
