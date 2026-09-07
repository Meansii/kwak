// 찬양 악보 정리 + 콘티 짜기
// 사진은 IndexedDB(용량이 큽니다)에, 곡 정보는 localStorage에 나눠 담습니다.
(() => {
  'use strict';

  const STORAGE_KEYS = {
    songs: 'kwak_worship_songs',
    setlists: 'kwak_worship_setlists',
  };

  const MAJOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_KEYS = MAJOR_KEYS.map((k) => k + 'm');
  const ENHARMONIC = { Db: 'C#', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb' };

  const TEMPOS = [
    { id: 'fast', label: '빠른 찬양', short: '빠름', icon: '🔥' },
    { id: 'mid', label: '중간', short: '중간', icon: '🙌' },
    { id: 'slow', label: '느린 곡', short: '느림', icon: '🕯️' },
  ];
  const TEMPO_BY_ID = new Map(TEMPOS.map((t) => [t.id, t]));

  const CATEGORIES = [
    { id: 'hymn', label: '찬송가', icon: '📕' },
    { id: 'worship', label: '워십', icon: '💫' },
    { id: 'etc', label: '기타', icon: '🎵' },
  ];
  const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

  // 사진은 이 크기로 줄여 담습니다. 악보 글씨는 읽히면서 용량은 크게 줍니다.
  const MAX_IMAGE_DIM = 1800;
  const IMAGE_QUALITY = 0.82;

  // ---------- 저장소 ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      const el = document.getElementById('storageWarning');
      if (el) el.hidden = false;
    }
  }

  let songs = loadJSON(STORAGE_KEYS.songs, []);
  let setlists = loadJSON(STORAGE_KEYS.setlists, []);

  const saveSongs = () => saveJSON(STORAGE_KEYS.songs, songs);
  const saveSetlists = () => saveJSON(STORAGE_KEYS.setlists, setlists);

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const songById = (id) => songs.find((s) => s.id === id) || null;

  // ---------- 사진 저장 (IndexedDB) ----------
  const DB_NAME = 'kwak-worship';
  const DB_VERSION = 1;
  const IMG_STORE = 'images';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('indexedDB 없음'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IMG_STORE)) db.createObjectStore(IMG_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function withStore(mode, fn) {
    return openDB().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(IMG_STORE, mode);
          const req = fn(tx.objectStore(IMG_STORE));
          tx.oncomplete = () => resolve(req ? req.result : undefined);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    );
  }

  const putImage = (record) => withStore('readwrite', (store) => store.put(record));
  const getImage = (id) => withStore('readonly', (store) => store.get(id));
  const deleteImage = (id) => withStore('readwrite', (store) => store.delete(id));

  // 만들어 둔 사진 주소는 다시 쓰고, 지울 때만 반납합니다.
  const urlCache = new Map();

  async function imageUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const record = await getImage(id).catch(() => null);
    if (!record || !record.blob) return null;
    const url = URL.createObjectURL(record.blob);
    urlCache.set(id, url);
    return url;
  }

  function releaseImageUrl(id) {
    const url = urlCache.get(id);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(id);
  }

  function setImageSrc(el, id) {
    imageUrl(id).then((url) => {
      if (url) el.src = url;
      else el.classList.add('img-missing');
    });
  }

  // ---------- 사진 줄이기 ----------
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('사진을 열 수 없습니다'));
      };
      img.src = url;
    });
  }

  async function shrinkToBlob(file) {
    const { img, url } = await readImage(file);
    try {
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // 투명한 PNG 악보가 검게 보이지 않도록
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
      return { blob: blob || file, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- 키 다루기 ----------
  function isMinor(key) {
    return typeof key === 'string' && key.endsWith('m');
  }
  function keyRoot(key) {
    if (!key) return null;
    const root = isMinor(key) ? key.slice(0, -1) : key;
    return ENHARMONIC[root] || root;
  }
  function pitchIndex(key) {
    const root = keyRoot(key);
    const i = MAJOR_KEYS.indexOf(root);
    return i === -1 ? null : i;
  }
  function transposeKey(key, steps) {
    const i = pitchIndex(key);
    if (i === null) return key;
    const next = MAJOR_KEYS[(((i + steps) % 12) + 12) % 12];
    return isMinor(key) ? next + 'm' : next;
  }
  // 두 곡 사이의 키 차이를 반음 수로 (가까운 쪽으로) 잽니다. 0이면 같은 키입니다.
  function keyDistance(a, b) {
    const ia = pitchIndex(a);
    const ib = pitchIndex(b);
    if (ia === null || ib === null) return null;
    const raw = Math.abs(ia - ib) % 12;
    return Math.min(raw, 12 - raw);
  }
  function keySortValue(key) {
    if (!key) return 1000;
    const i = pitchIndex(key);
    if (i === null) return 999;
    return (isMinor(key) ? 100 : 0) + i;
  }

  // 조표(맨 앞 ♯·♭ 개수) → 장조. 칸 번호가 곧 개수입니다.
  const SHARP_MAJORS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const FLAT_MAJORS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'C#', 'F#', 'B'];

  // 같은 조표를 쓰는 단조(나란한조)는 장조의 으뜸음에서 아홉 반음 위입니다.
  function relativeMinor(major) {
    const i = pitchIndex(major);
    return i === null ? '' : MAJOR_KEYS[(i + 9) % 12] + 'm';
  }

  function keyFromSignature(type, count, minor) {
    const table = type === 'flat' ? FLAT_MAJORS : SHARP_MAJORS;
    const major = table[count];
    if (!major) return '';
    return minor ? relativeMinor(major) : major;
  }

  // 지금 골라 둔 키가 어떤 조표인지 되짚어, 눌린 자리를 표시해 줍니다.
  function signatureForKey(key) {
    if (!key) return null;
    const minor = isMinor(key);
    for (const type of ['sharp', 'flat']) {
      const table = type === 'flat' ? FLAT_MAJORS : SHARP_MAJORS;
      for (let count = 0; count < table.length; count++) {
        if (type === 'flat' && count === 0) continue; // ♭ 0개는 ♯ 0개와 같은 자리입니다
        if (keyFromSignature(type, count, minor) === key) return { type, count, minor };
      }
    }
    return null;
  }

  function tempoFromBpm(bpm) {
    if (!bpm) return '';
    if (bpm >= 105) return 'fast';
    if (bpm >= 80) return 'mid';
    return 'slow';
  }

  // ---------- 곡 목록 화면 ----------
  const el = (id) => document.getElementById(id);

  let tempoFilter = 'all';
  let keyFilter = 'all';
  let categoryFilter = 'all';

  function matchesFilters(song) {
    if (tempoFilter === 'todo') {
      if (song.key && song.tempo) return false;
    } else if (tempoFilter !== 'all' && song.tempo !== tempoFilter) {
      return false;
    }
    if (keyFilter !== 'all' && (song.key || '') !== keyFilter) return false;
    if (categoryFilter !== 'all' && (song.category || '') !== categoryFilter) return false;
    return true;
  }

  function sortedSongs(list) {
    return list.slice().sort((a, b) => {
      const kv = keySortValue(a.key) - keySortValue(b.key);
      if (kv !== 0) return kv;
      return (a.title || '').localeCompare(b.title || '', 'ko');
    });
  }

  function tempoBadge(song) {
    const t = TEMPO_BY_ID.get(song.tempo);
    if (!t) return '<span class="badge badge-todo">빠르기 미정</span>';
    return `<span class="badge badge-${song.tempo}">${t.icon} ${t.short}${song.bpm ? ' ' + song.bpm : ''}</span>`;
  }
  function categoryBadge(song) {
    const c = CATEGORY_BY_ID.get(song.category);
    return c ? `<span class="badge badge-cat">${c.icon} ${c.label}</span>` : '';
  }
  function keyBadge(song) {
    if (!song.key) return '<span class="badge badge-todo">키 미정</span>';
    return `<span class="badge badge-key">${song.key}</span>`;
  }

  function renderKeyFilter() {
    const row = el('keyFilterRow');
    const used = [];
    for (const song of songs) {
      const k = song.key || '';
      if (!used.includes(k)) used.push(k);
    }
    used.sort((a, b) => keySortValue(a) - keySortValue(b));
    if (used.length <= 1) {
      row.innerHTML = '';
      row.hidden = true;
      return;
    }
    row.hidden = false;
    row.innerHTML = '';
    const makeChip = (value, label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key-chip' + (keyFilter === value ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        keyFilter = keyFilter === value ? 'all' : value;
        renderSongs();
      });
      return btn;
    };
    row.appendChild(makeChip('all', '모든 키'));
    for (const k of used) row.appendChild(makeChip(k, k || '키 미정'));
  }

  function songCard(song, onOpen) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'song-card';
    const thumbId = (song.images || [])[0];
    card.innerHTML = `
      <span class="song-thumb">${thumbId ? '<img alt="">' : '<span class="song-thumb-empty">🎵</span>'}${
      (song.images || []).length > 1 ? `<span class="song-pages">${song.images.length}장</span>` : ''
    }</span>
      <span class="song-title">${escapeHtml(song.title || '제목 없음')}</span>
      <span class="song-badges">${categoryBadge(song)}${keyBadge(song)}${tempoBadge(song)}</span>`;
    if (thumbId) setImageSrc(card.querySelector('img'), thumbId);
    card.addEventListener('click', () => onOpen(song));
    return card;
  }

  function renderSongs() {
    renderKeyFilter();
    const wrap = el('songGroups');
    wrap.innerHTML = '';

    const visible = sortedSongs(songs.filter(matchesFilters));
    el('songEmpty').hidden = visible.length > 0;
    if (!songs.length) {
      el('songEmpty').textContent = '아직 담긴 악보가 없습니다. 위에서 갤러리 사진을 불러와 주세요.';
    } else {
      el('songEmpty').textContent = '이 조건에 맞는 곡이 없습니다.';
    }

    let currentKey = null;
    let grid = null;
    for (const song of visible) {
      const key = song.key || '';
      if (key !== currentKey) {
        currentKey = key;
        const head = document.createElement('h3');
        head.className = 'key-heading';
        const count = visible.filter((s) => (s.key || '') === key).length;
        head.innerHTML = `<span>${key ? escapeHtml(key) + ' 키' : '키를 아직 안 정한 곡'}</span><span class="key-count">${count}곡</span>`;
        wrap.appendChild(head);
        grid = document.createElement('div');
        grid.className = 'song-grid';
        wrap.appendChild(grid);
      }
      grid.appendChild(songCard(song, (s) => openViewer([s.id], 0)));
    }

    renderOrganizeNudge();
    renderStorageNote();
  }

  function unorganizedSongs() {
    return songs.filter((s) => !s.key || !s.tempo);
  }

  function renderOrganizeNudge() {
    const box = el('organizeNudge');
    const todo = unorganizedSongs();
    if (!todo.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    el('organizeNudgeText').textContent = `키나 빠르기를 아직 안 정한 곡이 ${todo.length}곡 있습니다.`;
  }

  async function renderStorageNote() {
    const note = el('storageNote');
    if (!note) return;
    const pages = songs.reduce((sum, s) => sum + (s.images || []).length, 0);
    let text = `악보 ${songs.length}곡 · 사진 ${pages}장`;
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { usage } = await navigator.storage.estimate();
        if (usage) text += ` · 약 ${(usage / 1024 / 1024).toFixed(1)}MB 사용`;
      } catch (e) {
        /* 용량을 못 재도 그냥 넘어갑니다 */
      }
    }
    note.textContent = text;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 갤러리에서 불러오기 ----------
  function titleFromFileName(name) {
    return name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/^(IMG|KakaoTalk|Screenshot|PHOTO)[\s_-]*/i, '')
      .trim();
  }

  function showImportStatus(message, busy) {
    const box = el('importStatus');
    box.hidden = false;
    box.textContent = message;
    box.classList.toggle('busy', !!busy);
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    const merge = el('mergePagesCheck').checked && files.length > 1;
    const added = [];
    const failed = [];
    let done = 0;
    showImportStatus(`사진 ${files.length}장을 담는 중… (0/${files.length})`, true);

    let mergedSong = null;
    for (const file of files) {
      try {
        const { blob, width, height } = await shrinkToBlob(file);
        const imageId = newId();
        await putImage({ id: imageId, blob, width, height, createdAt: new Date().toISOString() });

        if (merge && mergedSong) {
          mergedSong.images.push(imageId);
        } else {
          const song = {
            id: newId(),
            title: titleFromFileName(file.name) || '이름 없는 악보',
            key: '',
            tempo: '',
            category: '',
            bpm: null,
            note: '',
            images: [imageId],
            createdAt: new Date().toISOString(),
          };
          songs.push(song);
          added.push(song);
          if (merge) mergedSong = song;
        }
      } catch (e) {
        failed.push(file.name); // 한 장이 안 들어와도 나머지는 계속 담습니다.
      }
      done += 1;
      showImportStatus(`사진 ${files.length}장을 담는 중… (${done}/${files.length})`, true);
    }

    saveSongs();
    renderSongs();

    if (!added.length) {
      showImportStatus('사진을 담지 못했습니다. 다시 한 번 골라 주세요.', false);
      return;
    }
    const failNote = failed.length ? ` (${failed.length}장은 못 읽어서 건너뛰었습니다)` : '';
    showImportStatus(`${added.length}곡을 담았습니다${failNote}. 이제 키와 빠르기를 정해 주세요.`, false);
    startOrganizeQueue(added.map((s) => s.id));
  }

  // ---------- 곡 고치기 (키 · 빠르기) ----------
  let editingId = null;
  let organizeQueue = [];

  function startOrganizeQueue(ids) {
    organizeQueue = ids.slice();
    nextInQueue();
  }

  function nextInQueue() {
    while (organizeQueue.length) {
      const id = organizeQueue.shift();
      if (songById(id)) {
        openSongEditor(id);
        return;
      }
    }
    organizeQueue = [];
    closeSongEditor();
  }

  function openSongEditor(id) {
    const song = songById(id);
    if (!song) return;
    editingId = id;
    el('songEditTitle').value = song.title || '';
    el('songEditNote').value = song.note || '';
    el('songEditBpm').value = song.bpm || '';
    renderKeyPicker(song.key || '');
    renderTempoPicker(song.tempo || '');
    renderCategoryPicker(song.category || '');
    renderEditorPages(song);
    el('songEditQueue').hidden = organizeQueue.length === 0;
    el('songEditQueueText').textContent = `정리할 곡이 ${organizeQueue.length}곡 더 있습니다.`;
    el('songEditModal').hidden = false;
    tapTimes = [];
    el('tapTempoResult').hidden = true;
  }

  function closeSongEditor() {
    el('songEditModal').hidden = true;
    editingId = null;
  }

  let pickedKey = '';
  let pickedTempo = '';

  function renderKeyPicker(selected) {
    pickedKey = selected;
    const wrap = el('keyPicker');
    wrap.innerHTML = '';
    const addRow = (label, keys) => {
      const row = document.createElement('div');
      row.className = 'key-picker-row';
      const title = document.createElement('span');
      title.className = 'key-picker-label';
      title.textContent = label;
      wrap.appendChild(title);
      for (const k of keys) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key-opt' + (pickedKey === k ? ' active' : '');
        btn.textContent = k;
        btn.addEventListener('click', () => renderKeyPicker(pickedKey === k ? '' : k));
        row.appendChild(btn);
      }
      wrap.appendChild(row);
    };
    addRow('장조 (밝은 키)', MAJOR_KEYS);
    addRow('단조 (어두운 키)', MINOR_KEYS);
    renderSigPicker();
  }

  let sigMinor = false;

  function renderSigPicker() {
    const wrap = el('sigPicker');
    const current = signatureForKey(pickedKey);
    if (current) sigMinor = current.minor;

    wrap.innerHTML = '';
    const addRow = (label, type, counts) => {
      const row = document.createElement('div');
      row.className = 'sig-row';
      const title = document.createElement('span');
      title.className = 'sig-row-label';
      title.textContent = label;
      row.appendChild(title);
      for (const count of counts) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const on = current && current.type === type && current.count === count;
        btn.className = 'sig-opt' + (on ? ' active' : '');
        btn.textContent = count === 0 ? '없음' : String(count);
        btn.addEventListener('click', () => {
          renderKeyPicker(on ? '' : keyFromSignature(type, count, sigMinor));
        });
        row.appendChild(btn);
      }
      wrap.appendChild(row);
    };
    addRow('♯ 샤프', 'sharp', [0, 1, 2, 3, 4, 5, 6, 7]);
    addRow('♭ 플랫', 'flat', [1, 2, 3, 4, 5, 6, 7]);

    const modeRow = document.createElement('div');
    modeRow.className = 'sig-mode';
    [
      { minor: false, label: '밝은 곡 (장조)' },
      { minor: true, label: '어두운 곡 (단조)' },
    ].forEach(({ minor, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sig-mode-opt' + (sigMinor === minor ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        sigMinor = minor;
        // 조표를 이미 골랐으면 같은 조표로 장·단조만 바꿔 줍니다.
        const sig = signatureForKey(pickedKey);
        renderKeyPicker(sig ? keyFromSignature(sig.type, sig.count, minor) : pickedKey);
      });
      modeRow.appendChild(btn);
    });
    wrap.appendChild(modeRow);

    const result = el('sigResult');
    if (current) {
      const count = current.count === 0 ? '조표 없음' : `${current.type === 'flat' ? '플랫 ♭' : '샤프 ♯'} ${current.count}개`;
      result.textContent = `${count} · ${current.minor ? '단조' : '장조'} → ${pickedKey} 키`;
      result.hidden = false;
    } else {
      result.hidden = true;
    }
  }

  function renderTempoPicker(selected) {
    pickedTempo = selected;
    const wrap = el('tempoPicker');
    wrap.innerHTML = '';
    for (const t of TEMPOS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tempo-opt' + (pickedTempo === t.id ? ' active' : '');
      btn.innerHTML = `<span class="tempo-opt-icon">${t.icon}</span><span>${t.label}</span>`;
      btn.addEventListener('click', () => renderTempoPicker(pickedTempo === t.id ? '' : t.id));
      wrap.appendChild(btn);
    }
  }

  let pickedCategory = '';

  function renderCategoryPicker(selected) {
    pickedCategory = selected;
    const wrap = el('categoryPicker');
    wrap.innerHTML = '';
    for (const c of CATEGORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tempo-opt' + (pickedCategory === c.id ? ' active' : '');
      btn.innerHTML = `<span class="tempo-opt-icon">${c.icon}</span><span>${c.label}</span>`;
      btn.addEventListener('click', () => renderCategoryPicker(pickedCategory === c.id ? '' : c.id));
      wrap.appendChild(btn);
    }
  }

  function renderEditorPages(song) {
    const wrap = el('songEditPages');
    wrap.innerHTML = '';
    (song.images || []).forEach((imageId, index) => {
      const item = document.createElement('div');
      item.className = 'page-thumb';
      item.innerHTML = `<img alt="악보 ${index + 1}장"><button type="button" class="page-del" aria-label="이 사진 지우기">✕</button><span class="page-num">${index + 1}</span>`;
      setImageSrc(item.querySelector('img'), imageId);
      item.querySelector('img').addEventListener('click', () => openViewer([song.id], 0, index));
      item.querySelector('.page-del').addEventListener('click', async () => {
        if (!confirm(`${index + 1}번째 사진을 지울까요?`)) return;
        song.images.splice(index, 1);
        saveSongs();
        releaseImageUrl(imageId);
        await deleteImage(imageId).catch(() => {});
        renderEditorPages(song);
        renderSongs();
      });
      wrap.appendChild(item);
    });
  }

  // 박자 재기: 화면을 박자에 맞춰 두드리면 BPM이 나옵니다.
  let tapTimes = [];
  function handleTap() {
    const now = Date.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2500) tapTimes = [];
    tapTimes.push(now);
    if (tapTimes.length > 8) tapTimes.shift();
    if (tapTimes.length < 2) {
      const r = el('tapTempoResult');
      r.hidden = false;
      r.textContent = '박자에 맞춰 네 번 이상 두드려 주세요.';
      return;
    }
    const spans = [];
    for (let i = 1; i < tapTimes.length; i++) spans.push(tapTimes[i] - tapTimes[i - 1]);
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
    const bpm = Math.round(60000 / avg);
    if (bpm < 30 || bpm > 260) return;
    el('songEditBpm').value = bpm;
    const suggested = tempoFromBpm(bpm);
    renderTempoPicker(suggested);
    const r = el('tapTempoResult');
    r.hidden = false;
    r.textContent = `${bpm} BPM · ${TEMPO_BY_ID.get(suggested).label}으로 맞췄습니다. 다르면 위에서 눌러 바꾸세요.`;
  }

  function saveSongEditor() {
    const song = songById(editingId);
    if (!song) return;
    song.title = el('songEditTitle').value.trim() || '이름 없는 악보';
    song.key = pickedKey;
    song.tempo = pickedTempo;
    song.category = pickedCategory;
    const bpm = parseInt(el('songEditBpm').value, 10);
    song.bpm = Number.isFinite(bpm) && bpm > 0 ? bpm : null;
    song.note = el('songEditNote').value.trim();
    song.updatedAt = new Date().toISOString();
    saveSongs();
    renderSongs();
    renderSetlists();
    if (organizeQueue.length) nextInQueue();
    else closeSongEditor();
  }

  async function deleteSong(id) {
    const song = songById(id);
    if (!song) return;
    if (!confirm(`"${song.title}" 악보를 지울까요? 담아 둔 사진도 함께 지워집니다.`)) return;
    for (const imageId of song.images || []) {
      releaseImageUrl(imageId);
      await deleteImage(imageId).catch(() => {});
    }
    songs = songs.filter((s) => s.id !== id);
    for (const list of setlists) list.songIds = list.songIds.filter((sid) => sid !== id);
    saveSongs();
    saveSetlists();
    closeSongEditor();
    closeViewer();
    renderSongs();
    renderSetlists();
  }

  // ---------- 악보 보기 ----------
  let viewer = { ids: [], si: 0, pi: 0 };
  let wakeLock = null;

  // 찬양하는 동안 화면이 꺼지지 않게 잡아 둡니다. 안 되는 기기면 그냥 넘어갑니다.
  async function keepScreenOn() {
    if (wakeLock || !navigator.wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {
      wakeLock = null;
    }
  }
  function releaseScreen() {
    if (!wakeLock) return;
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  function openViewer(ids, songIndex, pageIndex) {
    const valid = ids.filter((id) => songById(id));
    if (!valid.length) return;
    viewer = { ids: valid, si: Math.min(songIndex || 0, valid.length - 1), pi: pageIndex || 0 };
    el('viewerModal').hidden = false;
    renderViewer();
    keepScreenOn();
  }

  function closeViewer() {
    el('viewerModal').hidden = true;
    el('viewerImage').removeAttribute('src');
    el('viewerImage').classList.remove('zoomed');
    releaseScreen();
  }

  function renderViewer() {
    const song = songById(viewer.ids[viewer.si]);
    if (!song) {
      closeViewer();
      return;
    }
    const pages = song.images || [];
    viewer.pi = Math.max(0, Math.min(viewer.pi, pages.length - 1));

    el('viewerTitle').textContent = song.title || '제목 없음';
    const bits = [];
    if (song.key) bits.push(`${song.key} 키`);
    const t = TEMPO_BY_ID.get(song.tempo);
    if (t) bits.push(t.label + (song.bpm ? ` ${song.bpm}` : ''));
    if (pages.length > 1) bits.push(`${viewer.pi + 1}/${pages.length}장`);
    if (viewer.ids.length > 1) bits.push(`콘티 ${viewer.si + 1}/${viewer.ids.length}곡`);
    el('viewerMeta').textContent = bits.join(' · ') || '키와 빠르기를 아직 안 정했습니다';
    el('viewerNote').textContent = song.note || '';
    el('viewerNote').hidden = !song.note;

    const img = el('viewerImage');
    const empty = el('viewerEmpty');
    if (pages.length) {
      img.hidden = false;
      empty.hidden = true;
      img.classList.remove('zoomed');
      img.removeAttribute('src');
      setImageSrc(img, pages[viewer.pi]);
    } else {
      img.hidden = true;
      empty.hidden = false;
    }

    const atStart = viewer.si === 0 && viewer.pi === 0;
    const lastSong = viewer.si === viewer.ids.length - 1;
    el('viewerPrev').disabled = atStart;
    el('viewerNext').disabled = lastSong && viewer.pi >= pages.length - 1;
  }

  function viewerStep(delta) {
    const song = songById(viewer.ids[viewer.si]);
    if (!song) return;
    const pages = song.images || [];
    const nextPage = viewer.pi + delta;
    if (nextPage >= 0 && nextPage < pages.length) {
      viewer.pi = nextPage;
    } else if (delta > 0 && viewer.si < viewer.ids.length - 1) {
      viewer.si += 1;
      viewer.pi = 0;
    } else if (delta < 0 && viewer.si > 0) {
      viewer.si -= 1;
      const prev = songById(viewer.ids[viewer.si]);
      viewer.pi = Math.max(0, ((prev && prev.images) || []).length - 1);
    } else {
      return;
    }
    renderViewer();
  }

  // ---------- 콘티 ----------
  let openSetlistId = null;
  let autoCategory = 'all';

  function setlistById(id) {
    return setlists.find((l) => l.id === id) || null;
  }

  function todayLabel() {
    const d = new Date();
    return `${d.getMonth() + 1}월 ${d.getDate()}일 콘티`;
  }

  function setlistSongs(list) {
    return list.songIds.map(songById).filter(Boolean);
  }

  function createSetlist(title, songIds) {
    const list = {
      id: newId(),
      title: title || todayLabel(),
      songIds: songIds || [],
      createdAt: new Date().toISOString(),
    };
    setlists.unshift(list);
    saveSetlists();
    openSetlistId = list.id;
    renderSetlists();
    return list;
  }

  // 빠른 찬양 → 중간 → 느린 곡 순으로, 키가 가까운 곡끼리 이어 붙입니다.
  function autoBuild(fastCount, slowCount, category) {
    const pool = { fast: [], mid: [], slow: [] };
    for (const song of songs) {
      if (category !== 'all' && (song.category || '') !== category) continue;
      if (pool[song.tempo]) pool[song.tempo].push(song);
    }

    const picked = [];
    const takeFrom = (bucket, count) => {
      const rest = pool[bucket].slice();
      for (let i = 0; i < count && rest.length; i++) {
        let bestIndex = 0;
        if (picked.length) {
          const lastKey = picked[picked.length - 1].key;
          let bestScore = Infinity;
          rest.forEach((song, index) => {
            const d = keyDistance(lastKey, song.key);
            const score = d === null ? 6 : d;
            if (score < bestScore) {
              bestScore = score;
              bestIndex = index;
            }
          });
        } else {
          // 첫 곡은 익숙하게 부를 수 있도록 곡 수가 많은 키에서 고릅니다.
          bestIndex = Math.floor(Math.random() * rest.length);
        }
        picked.push(rest.splice(bestIndex, 1)[0]);
      }
    };

    takeFrom('fast', fastCount);
    if (fastCount > 0 && slowCount > 0) takeFrom('mid', 1);
    takeFrom('slow', slowCount);
    return picked;
  }

  function renderSetlists() {
    const listWrap = el('setlistList');
    if (!listWrap) return;

    if (openSetlistId && setlistById(openSetlistId)) {
      el('setlistIndex').hidden = true;
      el('setlistDetail').hidden = false;
      renderSetlistDetail();
      return;
    }
    openSetlistId = null;
    el('setlistIndex').hidden = false;
    el('setlistDetail').hidden = true;

    listWrap.innerHTML = '';
    el('setlistEmpty').hidden = setlists.length > 0;
    for (const list of setlists) {
      const item = document.createElement('li');
      item.className = 'setlist-item';
      const items = setlistSongs(list);
      const flow = items.map((s) => s.key || '?').join(' → ');
      item.innerHTML = `
        <button type="button" class="setlist-open">
          <span class="setlist-name">${escapeHtml(list.title)}</span>
          <span class="setlist-sub">${items.length}곡${flow ? ' · ' + escapeHtml(flow) : ''}</span>
        </button>`;
      item.querySelector('.setlist-open').addEventListener('click', () => {
        openSetlistId = list.id;
        renderSetlists();
      });
      listWrap.appendChild(item);
    }

    const counts = { fast: 0, mid: 0, slow: 0 };
    for (const song of songs) if (counts[song.tempo] !== undefined) counts[song.tempo] += 1;
    el('poolSummary').textContent = `담긴 곡: 빠른 찬양 ${counts.fast}곡 · 중간 ${counts.mid}곡 · 느린 곡 ${counts.slow}곡`;
  }

  function renderSetlistDetail() {
    const list = setlistById(openSetlistId);
    if (!list) return;
    el('setlistTitleInput').value = list.title;

    const wrap = el('setlistSongs');
    wrap.innerHTML = '';
    const items = setlistSongs(list);
    el('setlistDetailEmpty').hidden = items.length > 0;

    items.forEach((song, index) => {
      const prev = items[index - 1];
      const gap = prev ? keyDistance(prev.key, song.key) : null;
      const row = document.createElement('li');
      row.className = 'setlist-song';
      row.innerHTML = `
        <span class="setlist-order">${index + 1}</span>
        <span class="setlist-song-main">
          <span class="setlist-song-title">${escapeHtml(song.title)}</span>
          <span class="song-badges">${categoryBadge(song)}${keyBadge(song)}${tempoBadge(song)}</span>
          ${gap !== null && gap > 2 ? `<span class="key-warn">앞 곡과 ${gap}반음 차이 — 조옮김을 살펴보세요</span>` : ''}
        </span>
        <span class="setlist-song-btns">
          <button type="button" class="icon-btn" data-move="-1" aria-label="위로">▲</button>
          <button type="button" class="icon-btn" data-move="1" aria-label="아래로">▼</button>
          <button type="button" class="icon-btn" data-remove aria-label="빼기">✕</button>
        </span>`;
      row.querySelector('.setlist-song-title').addEventListener('click', () => openViewer(list.songIds, index));
      row.querySelectorAll('[data-move]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const to = index + Number(btn.dataset.move);
          if (to < 0 || to >= list.songIds.length) return;
          const [moved] = list.songIds.splice(index, 1);
          list.songIds.splice(to, 0, moved);
          saveSetlists();
          renderSetlistDetail();
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', () => {
        list.songIds.splice(index, 1);
        saveSetlists();
        renderSetlistDetail();
      });
      wrap.appendChild(row);
    });

    const keys = items.map((s) => s.key).filter(Boolean);
    el('setlistFlow').textContent = keys.length ? `키 흐름: ${keys.join(' → ')}` : '';
    el('setlistFlow').hidden = !keys.length;
  }

  function setlistToText(list) {
    const lines = [list.title];
    setlistSongs(list).forEach((song, i) => {
      const bits = [];
      const c = CATEGORY_BY_ID.get(song.category);
      if (c) bits.push(c.label);
      if (song.key) bits.push(song.key);
      const t = TEMPO_BY_ID.get(song.tempo);
      if (t) bits.push(t.short);
      if (song.bpm) bits.push(song.bpm + 'BPM');
      lines.push(`${i + 1}. ${song.title}${bits.length ? ` (${bits.join(', ')})` : ''}`);
    });
    return lines.join('\n');
  }

  // ---------- 콘티를 사진으로 ----------
  const SHARE_WIDTH = 1080;
  // 아이폰 사파리는 캔버스 넓이×높이가 약 1,670만 화소를 넘으면 빈 그림을 내놓습니다.
  const MAX_CANVAS_PIXELS = 16000000;

  const SHARE_COLORS = {
    bg: '#1c1a17',
    surface: '#262320',
    line: '#3a352d',
    ink: '#ece6da',
    muted: '#a89b86',
    accent: '#c98a63',
    onAccent: '#221b15',
  };

  const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function loadImageEl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('사진을 열 수 없습니다'));
      img.src = url;
    });
  }

  // 너무 긴 제목은 뒤를 … 로 줄입니다.
  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
    return cut + '…';
  }

  function songLine(song) {
    const bits = [];
    const c = CATEGORY_BY_ID.get(song.category);
    if (c) bits.push(c.label);
    if (song.key) bits.push(song.key);
    const t = TEMPO_BY_ID.get(song.tempo);
    if (t) bits.push(t.short);
    if (song.bpm) bits.push(song.bpm + ' BPM');
    return bits.join(' · ');
  }

  // 곡 목록만 담은 콘티표 한 장
  async function buildSetlistCard(list) {
    const items = setlistSongs(list);
    const padX = 64;
    const headH = 232;
    const rowH = 128;
    const footH = 104;
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_WIDTH;
    canvas.height = headH + Math.max(1, items.length) * rowH + footH;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = SHARE_COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = SHARE_COLORS.accent;
    ctx.fillRect(0, 0, canvas.width, 10);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = SHARE_COLORS.ink;
    ctx.font = `700 58px ${FONT}`;
    ctx.fillText(fitText(ctx, list.title || '콘티', canvas.width - padX * 2), padX, 116);

    const keys = items.map((s) => s.key).filter(Boolean);
    ctx.fillStyle = SHARE_COLORS.muted;
    ctx.font = `400 30px ${FONT}`;
    const sub = `${items.length}곡` + (keys.length ? `  ·  ${keys.join(' → ')}` : '');
    ctx.fillText(fitText(ctx, sub, canvas.width - padX * 2), padX, 168);

    ctx.strokeStyle = SHARE_COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, headH - 34);
    ctx.lineTo(canvas.width - padX, headH - 34);
    ctx.stroke();

    if (!items.length) {
      ctx.fillStyle = SHARE_COLORS.muted;
      ctx.font = `400 34px ${FONT}`;
      ctx.fillText('아직 담은 곡이 없습니다', padX, headH + 60);
    }

    items.forEach((song, index) => {
      const top = headH + index * rowH;

      ctx.fillStyle = SHARE_COLORS.accent;
      ctx.beginPath();
      ctx.arc(padX + 26, top + 46, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SHARE_COLORS.onAccent;
      ctx.font = `700 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(index + 1), padX + 26, top + 57);
      ctx.textAlign = 'left';

      const textX = padX + 76;
      ctx.fillStyle = SHARE_COLORS.ink;
      ctx.font = `600 42px ${FONT}`;
      ctx.fillText(fitText(ctx, song.title || '제목 없음', canvas.width - textX - padX), textX, top + 56);

      const line = songLine(song);
      if (line) {
        ctx.fillStyle = SHARE_COLORS.accent;
        ctx.font = `500 30px ${FONT}`;
        ctx.fillText(line, textX, top + 102);
      }

      if (index < items.length - 1) {
        ctx.strokeStyle = SHARE_COLORS.line;
        ctx.beginPath();
        ctx.moveTo(textX, top + rowH - 10);
        ctx.lineTo(canvas.width - padX, top + rowH - 10);
        ctx.stroke();
      }
    });

    ctx.fillStyle = SHARE_COLORS.muted;
    ctx.font = `400 26px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('말씀과 기도 · 찬양 콘티', canvas.width / 2, canvas.height - 44);
    ctx.textAlign = 'left';

    return canvasToBlob(canvas, 'image/png');
  }

  // 콘티에 담긴 악보 사진을 순서대로 이어 붙입니다. 너무 길면 여러 장으로 나눕니다.
  async function buildSheetImages(list, onProgress) {
    const items = setlistSongs(list);
    const pages = [];
    for (const song of items) {
      (song.images || []).forEach((imageId, pageIndex) => {
        pages.push({ song, imageId, pageIndex, pageCount: song.images.length });
      });
    }
    if (!pages.length) return [];

    const capH = 74;
    const loaded = [];
    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress(`악보를 모으는 중… (${i + 1}/${pages.length}장)`);
      const url = await imageUrl(pages[i].imageId);
      if (!url) continue;
      try {
        const img = await loadImageEl(url);
        const height = Math.round(img.naturalHeight * (SHARE_WIDTH / img.naturalWidth)) + capH;
        loaded.push({ ...pages[i], img, height });
      } catch (e) {
        /* 못 읽는 장은 건너뜁니다 */
      }
    }
    if (!loaded.length) return [];

    const groups = [];
    let current = [];
    let currentHeight = 0;
    for (const item of loaded) {
      if (current.length && (currentHeight + item.height) * SHARE_WIDTH > MAX_CANVAS_PIXELS) {
        groups.push(current);
        current = [];
        currentHeight = 0;
      }
      current.push(item);
      currentHeight += item.height;
    }
    if (current.length) groups.push(current);

    const blobs = [];
    for (let g = 0; g < groups.length; g++) {
      if (onProgress) onProgress(`사진을 만드는 중… (${g + 1}/${groups.length}장)`);
      const group = groups[g];
      const canvas = document.createElement('canvas');
      canvas.width = SHARE_WIDTH;
      canvas.height = group.reduce((sum, item) => sum + item.height, 0);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = SHARE_COLORS.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let y = 0;
      for (const item of group) {
        ctx.fillStyle = SHARE_COLORS.surface;
        ctx.fillRect(0, y, canvas.width, capH);
        ctx.fillStyle = SHARE_COLORS.accent;
        ctx.fillRect(0, y, 8, capH);

        const order = items.indexOf(item.song) + 1;
        const bits = [`${order}. ${item.song.title || '제목 없음'}`];
        const line = songLine(item.song);
        if (line) bits.push(line);
        if (item.pageCount > 1) bits.push(`${item.pageIndex + 1}/${item.pageCount}장`);
        ctx.fillStyle = SHARE_COLORS.ink;
        ctx.font = `600 32px ${FONT}`;
        ctx.fillText(fitText(ctx, bits.join('   ·   '), canvas.width - 60), 30, y + 48);

        const imgH = item.height - capH;
        ctx.drawImage(item.img, 0, y + capH, canvas.width, imgH);
        y += item.height;
      }
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
      if (blob) blobs.push(blob);
    }
    return blobs;
  }

  // 아티팩트 화면(claude.ai 안)에서는 보통 내려받기가 막혀 있어, 그쪽 저장 기능을 씁니다.
  async function saveThroughArtifact(blob, filename) {
    if (!window.claude || typeof window.claude.use !== 'function') return '';
    try {
      const downloads = await window.claude.use('downloads');
      if (!downloads) return '';
      const result = await downloads.save({ filename, data: blob });
      return result && result.status === 'delivered' ? '보냈습니다.' : '사진을 저장했습니다.';
    } catch (e) {
      if (e && e.code === 'declined') return '';
      return '';
    }
  }

  // 아이폰은 공유 시트로, 다른 곳은 내려받기로. 둘 다 막히면 사진을 꾹 눌러 저장하시면 됩니다.
  async function shareOrDownload(blob, filename) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return '공유 창을 열었습니다.';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return '';
    }

    const viaArtifact = await saveThroughArtifact(blob, filename);
    if (viaArtifact) return viaArtifact;

    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // 누르자마자 지우면 파일 이름이 떨어져 나가는 브라우저가 있어 조금 두었다 지웁니다.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 10000);
      return '사진을 내려받았습니다.';
    } catch (e) {
      return '아래 사진을 꾹 눌러 "사진에 저장"을 눌러 주세요.';
    }
  }

  function shareFileName(list, index, total, ext) {
    const base = (list.title || '콘티').replace(/[\\/:*?"<>|]/g, ' ').trim() || '콘티';
    return total > 1 ? `${base} (${index + 1}).${ext}` : `${base}.${ext}`;
  }

  function showShareStatus(message) {
    const box = el('shareStatus');
    box.textContent = message;
    box.hidden = !message;
  }

  function renderShareResults(list, blobs, ext) {
    const wrap = el('shareResults');
    wrap.innerHTML = '';
    blobs.forEach((blob, index) => {
      const item = document.createElement('div');
      item.className = 'share-item';
      const name = shareFileName(list, index, blobs.length, ext);
      item.innerHTML = `<div class="share-preview"><img alt="${escapeHtml(name)}"></div>` +
        `<button type="button" class="btn btn-primary btn-block">📥 이 사진 저장 · 공유</button>`;
      const img = item.querySelector('img');
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
      item.querySelector('button').addEventListener('click', async () => {
        const message = await shareOrDownload(blob, name);
        if (message) showShareStatus(message);
      });
      wrap.appendChild(item);
    });
    el('shareHint').hidden = blobs.length === 0;
  }

  function openShareModal() {
    el('shareResults').innerHTML = '';
    el('shareHint').hidden = true;
    showShareStatus('');
    el('shareModal').hidden = false;
  }

  function closeShareModal() {
    el('shareModal').hidden = true;
    el('shareResults').innerHTML = '';
  }

  async function makeShareImage(kind) {
    const list = setlistById(openSetlistId);
    if (!list) return;
    el('shareResults').innerHTML = '';
    el('shareHint').hidden = true;

    try {
      if (kind === 'card') {
        showShareStatus('콘티표를 만드는 중…');
        const blob = await buildSetlistCard(list);
        if (!blob) throw new Error('만들지 못했습니다');
        renderShareResults(list, [blob], 'png');
        showShareStatus('콘티표가 만들어졌습니다.');
        return;
      }

      showShareStatus('악보를 모으는 중…');
      const blobs = await buildSheetImages(list, showShareStatus);
      if (!blobs.length) {
        showShareStatus('이 콘티에는 담긴 악보 사진이 없습니다.');
        return;
      }
      renderShareResults(list, blobs, 'jpg');
      showShareStatus(blobs.length > 1
        ? `사진이 길어서 ${blobs.length}장으로 나눴습니다.`
        : '악보 사진이 만들어졌습니다.');
    } catch (e) {
      showShareStatus('사진을 만들지 못했습니다. 곡 수를 줄여 다시 해보세요.');
    }
  }

  // ---------- 곡 고르기 (콘티에 넣기) ----------
  let pickFilter = 'all';
  let pickKeyFilter = 'all';
  let pickCategory = 'all';
  let pickQuery = '';

  function openSongPicker() {
    pickFilter = 'all';
    pickKeyFilter = 'all';
    pickCategory = 'all';
    pickQuery = '';
    el('songPickSearch').value = '';
    el('songPickModal').hidden = false;
    renderSongPicker();
  }
  function closeSongPicker() {
    el('songPickModal').hidden = true;
  }

  // 콘티 마지막 곡의 키. "가까운 키"는 여기서부터 잽니다.
  function lastSetlistKey() {
    const list = setlistById(openSetlistId);
    if (!list) return '';
    const items = setlistSongs(list);
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].key) return items[i].key;
    }
    return '';
  }

  function matchesPickQuery(song) {
    if (!pickQuery) return true;
    const q = pickQuery.toLowerCase();
    if ((song.title || '').toLowerCase().includes(q)) return true;
    // "G", "am" 처럼 키를 쳐도 찾아 줍니다.
    return (song.key || '').toLowerCase().indexOf(q) === 0;
  }

  function matchesPickKey(song) {
    if (pickKeyFilter === 'all') return true;
    if (pickKeyFilter === 'near') {
      const distance = keyDistance(lastSetlistKey(), song.key);
      return distance !== null && distance <= 2;
    }
    return (song.key || '') === pickKeyFilter;
  }

  function renderPickKeyRow() {
    const row = el('pickKeyRow');
    row.innerHTML = '';
    const makeChip = (value, label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key-chip' + (pickKeyFilter === value ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        pickKeyFilter = pickKeyFilter === value ? 'all' : value;
        renderSongPicker();
      });
      row.appendChild(btn);
    };

    makeChip('all', '모든 키');
    const lastKey = lastSetlistKey();
    if (lastKey) makeChip('near', `${lastKey}와 가까운 키`);

    const used = [];
    for (const song of songs) {
      const k = song.key || '';
      if (k && !used.includes(k)) used.push(k);
    }
    used.sort((a, b) => keySortValue(a) - keySortValue(b));
    for (const k of used) makeChip(k, k);
    if (songs.some((s) => !s.key)) makeChip('', '키 미정');
  }

  function renderSongPicker() {
    const list = setlistById(openSetlistId);
    if (!list) return;
    document.querySelectorAll('#pickFilterRow .filter-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.pick === pickFilter);
    });
    document.querySelectorAll('#pickCategoryRow .filter-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.pickCategory === pickCategory);
    });
    renderPickKeyRow();

    const wrap = el('songPickList');
    wrap.innerHTML = '';
    const visible = sortedSongs(
      songs.filter((s) => (pickFilter === 'all' || s.tempo === pickFilter)
        && (pickCategory === 'all' || (s.category || '') === pickCategory)
        && matchesPickKey(s) && matchesPickQuery(s))
    );
    el('songPickCount').textContent = `담긴 곡 ${songs.length}곡 중 ${visible.length}곡`;
    el('songPickEmpty').hidden = visible.length > 0;
    for (const song of visible) {
      const row = document.createElement('li');
      const inList = list.songIds.includes(song.id);
      row.className = 'pick-row' + (inList ? ' picked' : '');
      row.innerHTML = `
        <span class="pick-main">
          <span class="pick-title">${escapeHtml(song.title)}</span>
          <span class="song-badges">${categoryBadge(song)}${keyBadge(song)}${tempoBadge(song)}</span>
        </span>
        <span class="pick-mark">${inList ? '담김' : '+ 담기'}</span>`;
      row.addEventListener('click', () => {
        if (list.songIds.includes(song.id)) list.songIds = list.songIds.filter((id) => id !== song.id);
        else list.songIds.push(song.id);
        saveSetlists();
        renderSongPicker();
        renderSetlistDetail();
      });
      wrap.appendChild(row);
    }
  }

  // ---------- 화면 연결 ----------
  function bind() {
    // 악보 / 콘티 전환
    document.querySelectorAll('[data-worship-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.worshipView;
        document.querySelectorAll('[data-worship-view]').forEach((b) => b.classList.toggle('active', b === btn));
        el('worshipSongsView').hidden = view !== 'songs';
        el('worshipSetlistsView').hidden = view !== 'setlists';
        if (view === 'setlists') renderSetlists();
      });
    });

    el('importBtn').addEventListener('click', () => el('importInput').click());
    el('importInput').addEventListener('change', async (e) => {
      // 입력칸을 비우면 files 목록도 함께 비워지므로, 먼저 베껴 둡니다.
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      await importFiles(files);
    });

    // 소리로 찾은 키는 곡 정리 화면에 그대로 채워 넣습니다.
    el('listenKeyBtn').addEventListener('click', () => {
      if (window.kwakKeyFinder) window.kwakKeyFinder.open((key) => renderKeyPicker(key));
    });

    // 악보 없이 노래만 듣고 키를 찾은 뒤, 그 키로 새 곡을 만들어 둘 수 있습니다.
    el('listenNewKeyBtn').addEventListener('click', () => {
      if (!window.kwakKeyFinder) return;
      window.kwakKeyFinder.open((key) => {
        const song = {
          id: newId(),
          title: '',
          key,
          tempo: '',
          category: '',
          bpm: null,
          note: '',
          images: [],
          createdAt: new Date().toISOString(),
        };
        songs.push(song);
        saveSongs();
        renderSongs();
        openSongEditor(song.id);
      });
    });

    el('organizeBtn').addEventListener('click', () => {
      const todo = unorganizedSongs();
      if (todo.length) startOrganizeQueue(todo.map((s) => s.id));
    });

    document.querySelectorAll('#categoryFilterRow .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryFilter = btn.dataset.category;
        document.querySelectorAll('#categoryFilterRow .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderSongs();
      });
    });

    document.querySelectorAll('#pickCategoryRow .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickCategory = btn.dataset.pickCategory;
        renderSongPicker();
      });
    });

    document.querySelectorAll('#autoCategoryRow .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        autoCategory = btn.dataset.autoCategory;
        document.querySelectorAll('#autoCategoryRow .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.querySelectorAll('#tempoFilterRow .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        tempoFilter = btn.dataset.tempo;
        document.querySelectorAll('#tempoFilterRow .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderSongs();
      });
    });

    // 곡 고치기 모달
    el('songEditSaveBtn').addEventListener('click', saveSongEditor);
    el('songEditDeleteBtn').addEventListener('click', () => editingId && deleteSong(editingId));
    el('songEditSkipBtn').addEventListener('click', () => (organizeQueue.length ? nextInQueue() : closeSongEditor()));
    el('tapTempoBtn').addEventListener('click', handleTap);
    el('songEditAddPageBtn').addEventListener('click', () => el('addPageInput').click());
    el('addPageInput').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      const song = songById(editingId);
      if (!song || !files.length) return;
      for (const file of files) {
        try {
          const { blob, width, height } = await shrinkToBlob(file);
          const imageId = newId();
          await putImage({ id: imageId, blob, width, height, createdAt: new Date().toISOString() });
          song.images.push(imageId);
        } catch (err) {
          /* 실패한 장은 건너뜁니다 */
        }
      }
      saveSongs();
      renderEditorPages(song);
      renderSongs();
    });

    // 악보 보기
    el('viewerPrev').addEventListener('click', () => viewerStep(-1));
    el('viewerNext').addEventListener('click', () => viewerStep(1));
    el('viewerEditBtn').addEventListener('click', () => {
      const id = viewer.ids[viewer.si];
      closeViewer();
      openSongEditor(id);
    });
    el('viewerImage').addEventListener('click', (e) => e.currentTarget.classList.toggle('zoomed'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !el('viewerModal').hidden) keepScreenOn();
    });
    document.addEventListener('keydown', (e) => {
      if (el('viewerModal').hidden) return;
      if (e.key === 'ArrowRight') viewerStep(1);
      if (e.key === 'ArrowLeft') viewerStep(-1);
      if (e.key === 'Escape') closeViewer();
    });

    // 콘티
    el('autoBuildBtn').addEventListener('click', () => {
      const fast = parseInt(el('autoFastCount').value, 10) || 0;
      const slow = parseInt(el('autoSlowCount').value, 10) || 0;
      const picked = autoBuild(fast, slow, autoCategory);
      if (!picked.length) {
        const only = CATEGORY_BY_ID.get(autoCategory);
        alert(only
          ? `${only.label} 중에 빠르기를 정해 둔 곡이 없습니다. 갈래를 "전체"로 두거나, 곡의 빠르기를 먼저 정해 주세요.`
          : '빠르기를 정해 둔 곡이 없습니다. 악보 화면에서 곡마다 빠르기를 먼저 정해 주세요.');
        return;
      }
      createSetlist(todayLabel(), picked.map((s) => s.id));
    });
    el('newSetlistBtn').addEventListener('click', () => createSetlist(todayLabel(), []));

    el('setlistBackBtn').addEventListener('click', () => {
      openSetlistId = null;
      renderSetlists();
    });
    el('setlistTitleInput').addEventListener('change', () => {
      const list = setlistById(openSetlistId);
      if (!list) return;
      list.title = el('setlistTitleInput').value.trim() || todayLabel();
      saveSetlists();
    });
    el('setlistAddBtn').addEventListener('click', openSongPicker);
    el('setlistPlayBtn').addEventListener('click', () => {
      const list = setlistById(openSetlistId);
      if (!list || !list.songIds.length) {
        alert('콘티에 곡을 먼저 담아 주세요.');
        return;
      }
      openViewer(list.songIds, 0);
    });
    el('setlistImageBtn').addEventListener('click', () => {
      const list = setlistById(openSetlistId);
      if (!list || !list.songIds.length) {
        alert('콘티에 곡을 먼저 담아 주세요.');
        return;
      }
      openShareModal();
    });
    el('shareCardBtn').addEventListener('click', () => makeShareImage('card'));
    el('shareSheetsBtn').addEventListener('click', () => makeShareImage('sheets'));
    document.querySelectorAll('[data-close-share]').forEach((btn) => btn.addEventListener('click', closeShareModal));

    el('setlistCopyBtn').addEventListener('click', async () => {
      const list = setlistById(openSetlistId);
      if (!list) return;
      const text = setlistToText(list);
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        ok = false;
      }
      const note = el('setlistCopyResult');
      note.hidden = false;
      note.textContent = ok ? '복사했습니다. 단톡방에 붙여넣으세요.' : text;
    });
    el('setlistDeleteBtn').addEventListener('click', () => {
      const list = setlistById(openSetlistId);
      if (!list) return;
      if (!confirm(`"${list.title}" 콘티를 지울까요? 악보는 그대로 남습니다.`)) return;
      setlists = setlists.filter((l) => l.id !== list.id);
      saveSetlists();
      openSetlistId = null;
      renderSetlists();
    });

    document.querySelectorAll('#pickFilterRow .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickFilter = btn.dataset.pick;
        renderSongPicker();
      });
    });
    el('songPickSearch').addEventListener('input', (e) => {
      pickQuery = e.target.value.trim();
      renderSongPicker();
    });
    el('songPickDoneBtn').addEventListener('click', closeSongPicker);

    document.querySelectorAll('[data-close-worship]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.closest('.modal');
        if (!target) return;
        if (target.id === 'songEditModal') {
          organizeQueue = [];
          closeSongEditor();
        } else if (target.id === 'viewerModal') closeViewer();
        else if (target.id === 'songPickModal') closeSongPicker();
      });
    });
  }

  // 백업 글에는 곡 정보만 담습니다. 사진은 용량이 커서 담을 수 없습니다.
  window.kwakWorship = {
    exportData() {
      return { songs, setlists };
    },
    importData(data) {
      if (!data) return;
      if (Array.isArray(data.songs)) {
        // 사진은 이 기기에만 있으므로, 지금 있는 사진만 이어 붙입니다.
        const known = new Set();
        for (const song of songs) for (const imageId of song.images || []) known.add(imageId);
        songs = data.songs.map((s) => ({
          ...s,
          images: (s.images || []).filter((imageId) => known.has(imageId)),
        }));
        saveSongs();
      }
      if (Array.isArray(data.setlists)) {
        setlists = data.setlists;
        saveSetlists();
      }
      renderSongs();
      renderSetlists();
    },
    summary() {
      return `찬양 ${songs.length}곡, 콘티 ${setlists.length}개`;
    },
  };

  bind();
  renderSongs();
  renderSetlists();
})();
