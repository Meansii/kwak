/* 화면 조각 만들기 도우미: 이스케이프, 토스트, 모달, 사진 축소 */
(function () {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 여러 줄 텍스트를 <br> 로 */
  function multiline(s) {
    return esc(s).replace(/\n/g, '<br>');
  }

  function toast(message, type) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' err' : '');
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 260);
    }, type === 'err' ? 3800 : 2200);
  }

  let modalEl = null;

  /** 하단 시트형 모달. onMount(modalBodyElement) 에서 이벤트를 붙인다. */
  function openModal({ title, body, onMount, wide }) {
    closeModal();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" ${wide ? 'style="max-width:820px"' : ''}>
        <header><h2>${esc(title || '')}</h2><button class="close" aria-label="닫기">&times;</button></header>
        <div class="modal-body"></div>
      </div>`;
    const bodyEl = bg.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    bg.querySelector('.close').addEventListener('click', closeModal);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) closeModal(); });
    document.body.appendChild(bg);
    document.body.style.overflow = 'hidden';
    modalEl = bg;
    if (onMount) onMount(bodyEl);
    return bodyEl;
  }

  function closeModal() {
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.body.style.overflow = '';
  }

  /** 확인 창 (Promise<boolean>) */
  function confirmDialog(message, { okText = '확인', danger = false } = {}) {
    return new Promise((resolve) => {
      openModal({
        title: '확인',
        body: `<p style="margin:0 0 18px">${multiline(message)}</p>
          <div class="row" style="justify-content:flex-end">
            <button class="btn" data-no>취소</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okText)}</button>
          </div>`,
        onMount(el) {
          el.querySelector('[data-no]').onclick = () => { closeModal(); resolve(false); };
          el.querySelector('[data-yes]').onclick = () => { closeModal(); resolve(true); };
        },
      });
    });
  }

  function lightbox(src) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.innerHTML = `<img src="${esc(src)}" alt="">`;
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  /**
   * 휴대폰 사진을 그대로 올리면 용량이 크므로 브라우저에서 먼저 줄인다.
   * 실패하면 원본을 그대로 올린다.
   */
  async function shrinkImage(file, maxSide = 1600, quality = 0.85) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    if (file.size < 400 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 2 * 1024 * 1024) return file;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      return file;
    }
  }

  /** 이름의 첫 글자를 동그란 아바타로 */
  function initial(name) {
    return esc(String(name || '?').trim().charAt(0) || '?');
  }

  window.ui = { esc, multiline, toast, openModal, closeModal, confirmDialog, lightbox, shrinkImage, initial };
})();
