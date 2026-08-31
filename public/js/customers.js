/* 고객 목록 / 고객 상세 / 고객 등록·수정 */
(function () {
  'use strict';
  const { esc, multiline, toast, openModal, closeModal, confirmDialog, lightbox, initial } = window.ui;

  const state = { q: '', sort: 'recent' };

  /* ---------------- 목록 ---------------- */
  async function renderList(root) {
    root.innerHTML = `
      <div class="container">
        <div class="card">
          <input type="search" id="q" placeholder="이름 · 연락처 · 메모 검색" value="${esc(state.q)}" autocomplete="off">
          <div class="chips mt" id="sorts">
            ${[['recent', '최근 방문순'], ['name', '이름순'], ['visits', '방문 많은순'], ['amount', '결제 많은순'], ['created', '최근 등록순']]
              .map(([k, label]) => `<button class="chip ${state.sort === k ? 'on' : ''}" data-sort="${k}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="row mb"><div class="small muted" id="count"></div></div>
        <div class="list" id="list"></div>
      </div>
      <button class="fab" id="add" aria-label="고객 등록">+</button>`;

    const listEl = root.querySelector('#list');
    const countEl = root.querySelector('#count');
    const input = root.querySelector('#q');

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = input.value.trim(); load(); }, 220);
    });
    root.querySelectorAll('[data-sort]').forEach((b) => {
      b.onclick = () => {
        state.sort = b.dataset.sort;
        root.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('on', x === b));
        load();
      };
    });
    root.querySelector('#add').onclick = () => openCustomerForm(null, () => load());

    async function load() {
      listEl.innerHTML = '<div class="muted small center" style="padding:24px">불러오는 중…</div>';
      const data = await api.get(`/api/customers?q=${encodeURIComponent(state.q)}&sort=${state.sort}&limit=200`);
      countEl.textContent = `전체 ${fmt.num(data.total)}명`;
      if (!data.items.length) {
        listEl.innerHTML = `<div class="card center muted">
          ${state.q ? '검색 결과가 없습니다.' : '아직 등록된 고객이 없습니다.<br>오른쪽 아래 + 버튼으로 등록하거나, 구글폼 파일을 가져오세요.'}
        </div>`;
        return;
      }
      listEl.innerHTML = data.items.map(cardHTML).join('');
      listEl.querySelectorAll('[data-id]').forEach((el) => {
        el.onclick = () => { location.hash = `#/customers/${el.dataset.id}`; };
      });
    }
    load();
  }

  function cardHTML(c) {
    const last = c.last_visit_date ? `${fmt.dateKo(c.last_visit_date)} · ${fmt.ago(c.last_visit_date)}` : '방문 기록 없음';
    return `
      <button class="item" data-id="${c.id}">
        <div class="avatar">${initial(c.name)}</div>
        <div class="grow">
          <div class="title">${esc(c.name)} ${c.gender ? `<span class="tiny muted">${esc(c.gender)}</span>` : ''}</div>
          <div class="small muted ellipsis">${esc(c.phone_display || fmt.phone(c.phone) || '연락처 없음')} · ${esc(last)}</div>
          ${c.last_services ? `<div class="tiny muted ellipsis">최근: ${esc(c.last_services)}</div>` : ''}
        </div>
        <div class="right nowrap">
          <div class="small"><b>${fmt.num(c.visit_count)}</b>회</div>
          <div class="tiny muted">${fmt.won(c.total_amount)}</div>
          ${c.photo_count ? `<div class="tiny muted">📷 ${c.photo_count}</div>` : ''}
        </div>
      </button>`;
  }

  /* ---------------- 상세 ---------------- */
  async function renderDetail(root, id) {
    root.innerHTML = '<div class="container"><div class="card center muted">불러오는 중…</div></div>';
    let c;
    try {
      c = await api.get(`/api/customers/${id}`);
    } catch (e) {
      root.innerHTML = `<div class="container"><div class="card center muted">${esc(e.message)}</div></div>`;
      return;
    }

    const info = [
      ['연락처', c.phone_display || fmt.phone(c.phone)],
      ['성별', c.gender],
      ['생년월일', c.birthday && fmt.dateKo(c.birthday)],
      ['이메일', c.email],
      ['주소', c.address],
      ['태그', c.tags],
    ].filter(([, v]) => v);

    root.innerHTML = `
      <div class="container">
        <div class="card">
          <div class="row">
            <div class="avatar" style="width:52px;height:52px;font-size:20px">${initial(c.name)}</div>
            <div class="grow">
              <div style="font-size:19px;font-weight:800">${esc(c.name)}</div>
              <div class="small muted">${esc(c.phone_display || fmt.phone(c.phone) || '연락처 없음')}</div>
            </div>
            <button class="btn small" id="edit">수정</button>
          </div>

          <div class="stat-grid mt">
            <div class="stat"><div class="label">방문</div><div class="value">${fmt.num(c.visit_count)}회</div></div>
            <div class="stat"><div class="label">누적 결제</div><div class="value">${fmt.won(c.total_amount)}</div></div>
            <div class="stat"><div class="label">최근 방문</div><div class="value" style="font-size:16px">${c.last_visit_date ? fmt.dateKo(c.last_visit_date) : '-'}</div></div>
          </div>

          ${info.length ? `<h3>고객 정보</h3>
            <table><tbody>${info.map(([k, v]) => `<tr><th style="width:90px">${esc(k)}</th><td style="white-space:normal">${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
          ${c.hair_note ? `<h3>모발 / 두피</h3><div class="small">${multiline(c.hair_note)}</div>` : ''}
          ${c.allergy ? `<h3>알러지 · 주의사항</h3><div class="small" style="color:var(--danger)">${multiline(c.allergy)}</div>` : ''}
          ${c.memo ? `<h3>메모</h3><div class="small">${multiline(c.memo)}</div>` : ''}
        </div>

        <div class="card">
          <div class="row mb">
            <h2 style="margin:0" class="grow">방문 · 시술 내역</h2>
            <button class="btn small primary" id="addVisit">+ 방문 추가</button>
          </div>
          <div id="visits">${c.visits.length ? c.visits.map((v) => visitHTML(v, c)).join('') : '<div class="muted small center" style="padding:18px">아직 방문 기록이 없습니다.</div>'}</div>
        </div>

        <div class="card">
          <div class="row mb">
            <h2 style="margin:0" class="grow">사진 (${c.photos.length})</h2>
          </div>
          <div class="dropzone mb" id="drop">📷 사진을 여기에 끌어놓거나 눌러서 선택하세요<br><span class="tiny">여러 장 한 번에 올릴 수 있어요</span></div>
          <input type="file" id="file" accept="image/*" multiple class="hidden">
          <div class="photo-grid" id="photos">${c.photos.map(photoHTML).join('')}</div>
        </div>

        <div class="card">
          <button class="btn danger block" id="del">이 고객 삭제</button>
        </div>
      </div>`;

    root.querySelector('#edit').onclick = () => openCustomerForm(c, () => renderDetail(root, id));
    root.querySelector('#addVisit').onclick = () => openVisitForm({ customer_id: c.id }, () => renderDetail(root, id));
    root.querySelector('#del').onclick = async () => {
      const ok = await confirmDialog(`${c.name} 고객과 방문기록·사진이 모두 삭제됩니다.\n계속할까요?`, { okText: '삭제', danger: true });
      if (!ok) return;
      await api.del(`/api/customers/${c.id}`);
      toast('삭제했습니다.');
      location.hash = '#/customers';
    };

    root.querySelectorAll('[data-visit-edit]').forEach((b) => {
      b.onclick = () => {
        const v = c.visits.find((x) => x.id === Number(b.dataset.visitEdit));
        openVisitForm(v, () => renderDetail(root, id));
      };
    });
    root.querySelectorAll('[data-visit-photo]').forEach((b) => {
      b.onclick = () => pickPhotos(c.id, Number(b.dataset.visitPhoto), () => renderDetail(root, id));
    });
    root.querySelectorAll('[data-photo-del]').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        if (!(await confirmDialog('이 사진을 삭제할까요?', { okText: '삭제', danger: true }))) return;
        await api.del(`/api/photos/${b.dataset.photoDel}`);
        renderDetail(root, id);
      };
    });
    root.querySelectorAll('[data-zoom]').forEach((img) => {
      img.onclick = () => lightbox(img.dataset.zoom);
    });

    const drop = root.querySelector('#drop');
    const fileInput = root.querySelector('#file');
    drop.onclick = () => fileInput.click();
    fileInput.onchange = () => uploadPhotos(c.id, null, [...fileInput.files], () => renderDetail(root, id));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('over');
    }));
    drop.addEventListener('drop', (e) => {
      uploadPhotos(c.id, null, [...e.dataTransfer.files], () => renderDetail(root, id));
    });
  }

  function visitHTML(v, c) {
    return `
      <div class="visit">
        <div class="head">
          <span class="date">${fmt.dateKo(v.visit_date)}</span>
          ${v.visit_time ? `<span class="tiny muted">${esc(v.visit_time)}</span>` : ''}
          ${v.source === 'google_form' ? '<span class="badge gray">구글폼</span>' : ''}
          <span class="amount">${fmt.won(v.amount)}</span>
        </div>
        ${v.services ? `<div style="margin-top:5px">${esc(v.services)}</div>` : ''}
        ${v.details ? `<div class="small muted" style="margin-top:3px">${multiline(v.details)}</div>` : ''}
        <div class="tiny muted" style="margin-top:5px">
          ${v.designer ? `담당 ${esc(v.designer)} · ` : ''}${v.pay_method ? `${esc(v.pay_method)} · ` : ''}${esc(fmt.ago(v.visit_date))}
        </div>
        ${v.memo ? `<div class="small" style="margin-top:5px">📝 ${multiline(v.memo)}</div>` : ''}
        ${photosOfVisit(c, v.id)}
        <div class="row mt">
          <button class="btn small ghost" data-visit-edit="${v.id}">수정</button>
          <button class="btn small ghost" data-visit-photo="${v.id}">사진 추가</button>
        </div>
      </div>`;
  }

  function photosOfVisit(c, visitId) {
    const list = c.photos.filter((p) => p.visit_id === visitId);
    if (!list.length) return '';
    return `<div class="photo-grid" style="margin-top:8px;grid-template-columns:repeat(auto-fill,minmax(84px,1fr))">${list.map(photoHTML).join('')}</div>`;
  }

  function photoHTML(p) {
    const kindLabel = { before: '시술 전', after: '시술 후', etc: '기타' }[p.kind] || '';
    if (!p.filename && p.source_url) {
      return `<div class="photo">
        <a class="link" href="${esc(p.source_url)}" target="_blank" rel="noopener">🔗 구글폼<br>사진 열기</a>
        <button class="del" data-photo-del="${p.id}" title="삭제">×</button>
      </div>`;
    }
    const src = `/api/photos/file/${encodeURIComponent(p.filename)}`;
    return `<div class="photo">
      <img src="${src}" alt="${esc(p.caption || '')}" loading="lazy" data-zoom="${src}">
      ${kindLabel ? `<span class="kind">${kindLabel}</span>` : ''}
      <button class="del" data-photo-del="${p.id}" title="삭제">×</button>
    </div>`;
  }

  function pickPhotos(customerId, visitId, done) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => uploadPhotos(customerId, visitId, [...input.files], done);
    input.click();
  }

  async function uploadPhotos(customerId, visitId, files, done) {
    if (!files.length) return;
    toast(`사진 ${files.length}장 올리는 중…`);
    const form = new FormData();
    form.append('customer_id', customerId);
    if (visitId) form.append('visit_id', visitId);
    for (const f of files) form.append('files', await ui.shrinkImage(f));
    try {
      await api.post('/api/photos', form);
      toast('사진을 저장했습니다.');
      done && done();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  /* ---------------- 고객 등록 / 수정 ---------------- */
  function openCustomerForm(c, done) {
    const isNew = !c;
    c = c || {};
    openModal({
      title: isNew ? '고객 등록' : '고객 정보 수정',
      body: `
        <div class="grid2">
          <label class="field"><span>이름 *</span><input type="text" id="f-name" value="${esc(c.name || '')}" placeholder="홍길동"></label>
          <label class="field"><span>연락처</span><input type="tel" id="f-phone" value="${esc(c.phone_display || fmt.phone(c.phone) || '')}" placeholder="010-0000-0000"></label>
          <label class="field"><span>성별</span>
            <select id="f-gender">
              <option value="">선택 안 함</option>
              ${['여', '남'].map((g) => `<option ${c.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>생년월일</span><input type="date" id="f-birthday" value="${esc(c.birthday || '')}"></label>
        </div>
        <label class="field"><span>태그 (쉼표로 구분)</span><input type="text" id="f-tags" value="${esc(c.tags || '')}" placeholder="단골, 펌전문, VIP"></label>
        <label class="field"><span>모발 / 두피 특이사항</span><textarea id="f-hair">${esc(c.hair_note || '')}</textarea></label>
        <label class="field"><span>알러지 · 주의사항</span><textarea id="f-allergy">${esc(c.allergy || '')}</textarea></label>
        <label class="field"><span>메모</span><textarea id="f-memo">${esc(c.memo || '')}</textarea></label>
        <div class="checkbox"><input type="checkbox" id="f-privacy" ${c.privacy_agreed ? 'checked' : ''}><label for="f-privacy">개인정보 수집·이용에 동의함</label></div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" id="cancel">취소</button>
          <button class="btn primary" id="save">저장</button>
        </div>`,
      onMount(el) {
        el.querySelector('#cancel').onclick = closeModal;
        el.querySelector('#save').onclick = async () => {
          const body = {
            name: el.querySelector('#f-name').value.trim(),
            phone_display: el.querySelector('#f-phone').value.trim(),
            gender: el.querySelector('#f-gender').value,
            birthday: el.querySelector('#f-birthday').value,
            tags: el.querySelector('#f-tags').value.trim(),
            hair_note: el.querySelector('#f-hair').value.trim(),
            allergy: el.querySelector('#f-allergy').value.trim(),
            memo: el.querySelector('#f-memo').value.trim(),
            privacy_agreed: el.querySelector('#f-privacy').checked,
          };
          if (!body.name) return toast('이름을 입력하세요.', 'err');
          try {
            if (isNew) await api.post('/api/customers', body);
            else await api.put(`/api/customers/${c.id}`, body);
            closeModal();
            toast('저장했습니다.');
            done && done();
          } catch (e) {
            if (e.status === 409 && await confirmDialog(`${e.message}\n그래도 새로 등록할까요?`, { okText: '새로 등록' })) {
              await api.post('/api/customers', { ...body, allow_duplicate: true });
              closeModal();
              toast('저장했습니다.');
              done && done();
              return;
            }
            toast(e.message, 'err');
          }
        };
      },
    });
  }

  /* ---------------- 방문 등록 / 수정 ---------------- */
  async function openVisitForm(v, done) {
    const isNew = !v.id;
    let suggestions = { services: [], designers: [], payMethods: [] };
    try { suggestions = await api.get('/api/suggestions'); } catch { /* 자동완성은 없어도 됨 */ }

    openModal({
      title: isNew ? '방문 기록 추가' : '방문 기록 수정',
      body: `
        <div class="grid2">
          <label class="field"><span>방문일자 *</span><input type="date" id="v-date" value="${esc(v.visit_date || fmt.today())}"></label>
          <label class="field"><span>시간</span><input type="time" id="v-time" value="${esc(v.visit_time || '')}"></label>
        </div>
        <label class="field"><span>시술 내용</span>
          <input type="text" id="v-services" list="dl-services" value="${esc(v.services || '')}" placeholder="예) 뿌리염색 + 클리닉">
          <datalist id="dl-services">${suggestions.services.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        </label>
        <label class="field"><span>시술 상세기록 (약제·레시피·시간)</span><textarea id="v-details" placeholder="예) 6NB + 산화제 6% 1:1, 25분 방치">${esc(v.details || '')}</textarea></label>
        <div class="grid2">
          <label class="field"><span>결제금액</span><input type="text" inputmode="numeric" id="v-amount" value="${v.amount ? fmt.num(v.amount) : ''}" placeholder="50,000"></label>
          <label class="field"><span>결제수단</span>
            <input type="text" id="v-pay" list="dl-pay" value="${esc(v.pay_method || '')}" placeholder="카드 / 현금 / 계좌이체">
            <datalist id="dl-pay">${['카드', '현금', '계좌이체', '간편결제'].concat(suggestions.payMethods).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
          </label>
        </div>
        <label class="field"><span>담당 디자이너</span>
          <input type="text" id="v-designer" list="dl-designer" value="${esc(v.designer || '')}">
          <datalist id="dl-designer">${suggestions.designers.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        </label>
        <label class="field"><span>메모</span><textarea id="v-memo">${esc(v.memo || '')}</textarea></label>
        <div class="row" style="justify-content:flex-end">
          ${isNew ? '' : '<button class="btn danger" id="v-del">삭제</button>'}
          <div class="grow"></div>
          <button class="btn" id="v-cancel">취소</button>
          <button class="btn primary" id="v-save">저장</button>
        </div>`,
      onMount(el) {
        const amountEl = el.querySelector('#v-amount');
        amountEl.addEventListener('input', () => {
          const digits = amountEl.value.replace(/[^0-9]/g, '');
          amountEl.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
        });
        el.querySelector('#v-cancel').onclick = closeModal;
        const delBtn = el.querySelector('#v-del');
        if (delBtn) {
          delBtn.onclick = async () => {
            if (!(await confirmDialog('이 방문 기록을 삭제할까요?', { okText: '삭제', danger: true }))) return;
            await api.del(`/api/visits/${v.id}`);
            closeModal();
            toast('삭제했습니다.');
            done && done();
          };
        }
        el.querySelector('#v-save').onclick = async () => {
          const body = {
            customer_id: v.customer_id,
            visit_date: el.querySelector('#v-date').value,
            visit_time: el.querySelector('#v-time').value,
            services: el.querySelector('#v-services').value.trim(),
            details: el.querySelector('#v-details').value.trim(),
            amount: amountEl.value.replace(/[^0-9]/g, ''),
            pay_method: el.querySelector('#v-pay').value.trim(),
            designer: el.querySelector('#v-designer').value.trim(),
            memo: el.querySelector('#v-memo').value.trim(),
          };
          if (!body.visit_date) return toast('방문일자를 선택하세요.', 'err');
          try {
            if (isNew) await api.post('/api/visits', body);
            else await api.put(`/api/visits/${v.id}`, body);
            closeModal();
            toast('저장했습니다.');
            done && done();
          } catch (e) {
            toast(e.message, 'err');
          }
        };
      },
    });
  }

  window.Views = window.Views || {};
  window.Views.customers = { renderList, renderDetail, openCustomerForm, openVisitForm };
})();
