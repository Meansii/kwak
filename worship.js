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

  function matchesFilters(song) {
    if (tempoFilter === 'todo') {
      if (song.key && song.tempo) return false;
    } else if (tempoFilter !== 'all' && song.tempo !== tempoFilter) {
      return false;
    }
    if (keyFilter !== 'all' && (song.key || '') !== keyFilter) return false;
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
      <span class="song-badges">${keyBadge(song)}${tempoBadge(song)}</span>`;
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
  function autoBuild(fastCount, slowCount) {
    const pool = { fast: [], mid: [], slow: [] };
    for (const song of songs) if (pool[song.tempo]) pool[song.tempo].push(song);

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
          <span class="song-badges">${keyBadge(song)}${tempoBadge(song)}</span>
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
      if (song.key) bits.push(song.key);
      const t = TEMPO_BY_ID.get(song.tempo);
      if (t) bits.push(t.short);
      if (song.bpm) bits.push(song.bpm + 'BPM');
      lines.push(`${i + 1}. ${song.title}${bits.length ? ` (${bits.join(', ')})` : ''}`);
    });
    return lines.join('\n');
  }

  // ---------- 곡 고르기 (콘티에 넣기) ----------
  let pickFilter = 'all';

  function openSongPicker() {
    el('songPickModal').hidden = false;
    renderSongPicker();
  }
  function closeSongPicker() {
    el('songPickModal').hidden = true;
  }

  function renderSongPicker() {
    const list = setlistById(openSetlistId);
    if (!list) return;
    document.querySelectorAll('#pickFilterRow .filter-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.pick === pickFilter);
    });
    const wrap = el('songPickList');
    wrap.innerHTML = '';
    const visible = sortedSongs(songs.filter((s) => pickFilter === 'all' || s.tempo === pickFilter));
    el('songPickEmpty').hidden = visible.length > 0;
    for (const song of visible) {
      const row = document.createElement('li');
      const inList = list.songIds.includes(song.id);
      row.className = 'pick-row' + (inList ? ' picked' : '');
      row.innerHTML = `
        <span class="pick-main">
          <span class="pick-title">${escapeHtml(song.title)}</span>
          <span class="song-badges">${keyBadge(song)}${tempoBadge(song)}</span>
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

    el('organizeBtn').addEventListener('click', () => {
      const todo = unorganizedSongs();
      if (todo.length) startOrganizeQueue(todo.map((s) => s.id));
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
      const picked = autoBuild(fast, slow);
      if (!picked.length) {
        alert('빠르기를 정해 둔 곡이 없습니다. 악보 화면에서 곡마다 빠르기를 먼저 정해 주세요.');
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
