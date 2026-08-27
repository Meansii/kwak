(() => {
  'use strict';

  const STORAGE_KEYS = {
    completedDays: 'kwak_bible_completed_days',
    sessions: 'kwak_prayer_sessions',
    prayers: 'kwak_prayer_requests',
    bibleUrl: 'kwak_bible_url_pattern',
    bibleAppUrl: 'kwak_bible_app_url_pattern',
  };

  const CHAPTERS_PER_DAY = 5;

  const BIBLE_BOOKS = [
    ['창세기', 50], ['출애굽기', 40], ['레위기', 27], ['민수기', 36], ['신명기', 34],
    ['여호수아', 24], ['사사기', 21], ['룻기', 4], ['사무엘상', 31], ['사무엘하', 24],
    ['열왕기상', 22], ['열왕기하', 25], ['역대상', 29], ['역대하', 36], ['에스라', 10],
    ['느헤미야', 13], ['에스더', 10], ['욥기', 42], ['시편', 150], ['잠언', 31],
    ['전도서', 12], ['아가', 8], ['이사야', 66], ['예레미야', 52], ['예레미야애가', 5],
    ['에스겔', 48], ['다니엘', 12], ['호세아', 14], ['요엘', 3], ['아모스', 9],
    ['오바댜', 1], ['요나', 4], ['미가', 7], ['나훔', 3], ['하박국', 3],
    ['스바냐', 3], ['학개', 2], ['스가랴', 14], ['말라기', 4],
    ['마태복음', 28], ['마가복음', 16], ['누가복음', 24], ['요한복음', 21], ['사도행전', 28],
    ['로마서', 16], ['고린도전서', 16], ['고린도후서', 13], ['갈라디아서', 6], ['에베소서', 6],
    ['빌립보서', 4], ['골로새서', 4], ['데살로니가전서', 5], ['데살로니가후서', 3],
    ['디모데전서', 6], ['디모데후서', 4], ['디도서', 3], ['빌레몬서', 1], ['히브리서', 13],
    ['야고보서', 5], ['베드로전서', 5], ['베드로후서', 3], ['요한일서', 5], ['요한이서', 1],
    ['요한삼서', 1], ['유다서', 1], ['요한계시록', 22],
  ];

  // BIBLE_BOOKS 와 같은 순서의 표준 USFM 약어 (성경 앱 링크에 씁니다)
  const USFM_CODES = [
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
    '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
    'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
    'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
    'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
    'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
  ];

  const DEFAULT_BIBLE_URL = 'https://www.bible.com/bible/88/{usfm}.{chapter}.NKRV';

  function buildChapterSequence() {
    const seq = [];
    for (const [book, chapters] of BIBLE_BOOKS) {
      for (let c = 1; c <= chapters; c++) seq.push({ book, chapter: c });
    }
    return seq;
  }

  function buildReadingPlan() {
    const seq = buildChapterSequence();
    const days = [];
    for (let i = 0; i < seq.length; i += CHAPTERS_PER_DAY) {
      days.push(seq.slice(i, i + CHAPTERS_PER_DAY));
    }
    return days;
  }

  function labelForDay(dayChapters) {
    const groups = [];
    for (const { book, chapter } of dayChapters) {
      const last = groups[groups.length - 1];
      if (last && last.book === book && chapter === last.end + 1) {
        last.end = chapter;
      } else {
        groups.push({ book, start: chapter, end: chapter });
      }
    }
    return groups
      .map((g) => (g.start === g.end ? `${g.book} ${g.start}장` : `${g.book} ${g.start}~${g.end}장`))
      .join(', ');
  }

  const READING_PLAN = buildReadingPlan();
  const BOOK_USFM = new Map(BIBLE_BOOKS.map(([name], i) => [name, USFM_CODES[i]]));

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- Bible reading tab ----------
  let completedDays = loadJSON(STORAGE_KEYS.completedDays, []);
  const completedSet = () => new Set(completedDays);

  function firstIncompleteDayIndex() {
    const set = completedSet();
    for (let i = 0; i < READING_PLAN.length; i++) {
      if (!set.has(i)) return i;
    }
    return -1;
  }

  function renderToday() {
    const idx = firstIncompleteDayIndex();
    const todayEl = document.getElementById('todayReading');
    const btn = document.getElementById('todayCompleteBtn');
    if (idx === -1) {
      todayEl.textContent = '축하합니다! 성경 통독을 모두 마쳤습니다 🎉';
      todayEl.classList.add('done');
      btn.disabled = true;
      btn.textContent = '통독 완료';
      renderChapterLinks(null);
    } else {
      todayEl.textContent = `${idx + 1}일차 · ${labelForDay(READING_PLAN[idx])}`;
      todayEl.classList.remove('done');
      btn.disabled = false;
      btn.textContent = '오늘 읽기 완료';
      renderChapterLinks(READING_PLAN[idx]);
    }
  }

  // ---------- 성경 앱으로 열기 ----------
  const bibleUrlInput = document.getElementById('bibleUrlInput');

  function bibleUrlPattern() {
    try {
      // 저장된 적이 없으면 기본 주소, 일부러 비웠으면 빈 값(= 열지 않음)입니다.
      const saved = localStorage.getItem(STORAGE_KEYS.bibleUrl);
      return saved === null ? DEFAULT_BIBLE_URL : saved;
    } catch (e) {
      return DEFAULT_BIBLE_URL;
    }
  }

  function saveBibleUrl(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function bibleAppUrlPattern() {
    try {
      return localStorage.getItem(STORAGE_KEYS.bibleAppUrl) || '';
    } catch (e) {
      return '';
    }
  }

  function chapterUrl(book, chapter, pattern) {
    const template = pattern === undefined ? bibleUrlPattern() : pattern;
    if (!template) return '';
    return template
      .replace(/\{usfm\}/g, BOOK_USFM.get(book) || '')
      .replace(/\{book\}/g, encodeURIComponent(book))
      .replace(/\{chapter\}/g, String(chapter));
  }

  // 앱 스킴이 설정돼 있으면 먼저 앱을 열어 보고, 아무 일도 안 일어나면 웹으로 넘어갑니다.
  function openChapter(appUrl, webUrl, label) {
    if (!appUrl) {
      openWeb(webUrl, label);
      return;
    }

    let switched = false;
    const onVisibilityChange = () => {
      if (document.hidden) switched = true; // 앱으로 넘어가면 이 화면은 숨겨집니다.
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const timer = setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (switched || document.hidden) return;
      openWeb(webUrl, label);
    }, 1500);

    try {
      window.location.href = appUrl;
    } catch (e) {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      openWeb(webUrl, label);
    }
  }

  // 미리보기(샌드박스) 안에서는 새 창 열기가 조용히 차단됩니다.
  // 그때는 주소를 띄워서 복사해 갈 수 있게 합니다.
  function openWeb(url, label) {
    // 'noopener' 를 옵션으로 넘기면 열기에 성공해도 null 이 돌아와서, 열렸는지 알 수 없습니다.
    let win = null;
    try {
      win = window.open(url, '_blank');
    } catch (e) {
      win = null;
    }
    if (win) {
      try { win.opener = null; } catch (e) { /* 교차 출처면 건드릴 수 없습니다 */ }
      return;
    }
    showLinkFallback(url, label);
  }

  function showLinkFallback(url, label) {
    document.getElementById('linkFallbackLabel').textContent = label;
    const field = document.getElementById('linkFallbackUrl');
    field.value = url;
    document.getElementById('linkFallbackCopied').hidden = true;
    document.getElementById('linkModal').hidden = false;
  }

  function renderTargetNote(visible) {
    const note = document.getElementById('bibleTargetNote');
    note.hidden = !visible;
    if (!visible) return;
    const appPattern = bibleAppUrlPattern();
    if (!appPattern && !bibleUrlPattern()) {
      document.getElementById('bibleTargetText').textContent = '장을 눌러도 다른 앱이 열리지 않습니다';
      return;
    }
    let where;
    if (appPattern) {
      where = appPattern.replace(/:.*$/, '');
      document.getElementById('bibleTargetText').textContent = `지금은 ${where} 앱으로 열립니다`;
    } else {
      let host = '웹';
      try { host = new URL(bibleUrlPattern()).hostname.replace(/^www\./, ''); } catch (e) { /* 형식이 달라도 넘어갑니다 */ }
      document.getElementById('bibleTargetText').textContent = `지금은 웹(${host})으로 열립니다`;
    }
  }

  function renderChapterLinks(dayChapters) {
    const wrap = document.getElementById('todayChapters');
    wrap.innerHTML = '';
    renderTargetNote(Boolean(dayChapters));
    if (!dayChapters) return;

    // 한 책 안에서만 읽는 날은 "1장"처럼 짧게, 책이 넘어가는 날은 책 이름까지 보여 줍니다.
    const singleBook = new Set(dayChapters.map((c) => c.book)).size === 1;
    const frag = document.createDocumentFragment();
    dayChapters.forEach(({ book, chapter }) => {
      const webUrl = chapterUrl(book, chapter);
      const appUrl = chapterUrl(book, chapter, bibleAppUrlPattern());
      const label = `${book} ${chapter}장`;
      const text = singleBook ? `${chapter}장` : label;

      if (!webUrl && !appUrl) {
        const span = document.createElement('span');
        span.className = 'chapter-link is-static';
        span.textContent = text;
        frag.appendChild(span);
        return;
      }

      const a = document.createElement('a');
      a.className = 'chapter-link';
      a.href = webUrl || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = text;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openChapter(appUrl, webUrl, label);
      });
      frag.appendChild(a);
    });
    wrap.appendChild(frag);
  }

  document.getElementById('linkModal').querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => { document.getElementById('linkModal').hidden = true; });
  });
  document.getElementById('linkFallbackUrl').addEventListener('focus', (e) => e.target.select());
  document.getElementById('linkFallbackCopyBtn').addEventListener('click', async () => {
    const field = document.getElementById('linkFallbackUrl');
    field.select();
    let ok = false;
    try {
      await navigator.clipboard.writeText(field.value);
      ok = true;
    } catch (e) {
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    document.getElementById('linkFallbackCopied').hidden = !ok;
  });

  const bibleAppUrlInput = document.getElementById('bibleAppUrlInput');

  bibleUrlInput.value = bibleUrlPattern();
  bibleAppUrlInput.value = bibleAppUrlPattern();

  // 성경 앱에서 복사한 주소(예: .../GEN.1.NKRV)를 그대로 붙여넣어도 되게,
  // 책 약어와 장 번호를 자동으로 자리표시자로 바꿔 줍니다.
  function toChapterPattern(url) {
    if (!url || url.indexOf('{') !== -1) return url;
    const replaced = url.replace(/\/([1-3]?[A-Z]{2,3})\.(\d+)/, '/{usfm}.{chapter}');
    if (replaced !== url) return replaced;
    // 한글 책 이름 + 장 번호 형태도 받아 줍니다.
    return url.replace(/([가-힣]{2,7})\s*(\d+)\s*장/, '{book} {chapter}장');
  }

  bibleUrlInput.addEventListener('change', () => {
    const value = toChapterPattern(bibleUrlInput.value.trim());
    bibleUrlInput.value = value;
    saveBibleUrl(STORAGE_KEYS.bibleUrl, value);
    renderBibleTab();
  });
  bibleAppUrlInput.addEventListener('change', () => {
    const value = toChapterPattern(bibleAppUrlInput.value.trim());
    bibleAppUrlInput.value = value;
    saveBibleUrl(STORAGE_KEYS.bibleAppUrl, value);
    renderBibleTab();
  });
  document.getElementById('bibleTargetChangeBtn').addEventListener('click', () => {
    const panel = document.querySelector('.bible-source');
    panel.open = true;
    panel.scrollIntoView({ block: 'nearest' });
    bibleAppUrlInput.focus();
  });

  document.getElementById('bibleAppTestBtn').addEventListener('click', () => {
    const result = document.getElementById('bibleAppTestResult');
    const pattern = bibleAppUrlInput.value.trim();
    result.hidden = false;
    if (!pattern) {
      result.textContent = '앱 주소를 먼저 넣어 주세요.';
      return;
    }

    result.textContent = '창세기 1장으로 열어보는 중…';
    let switched = false;
    const onVisibilityChange = () => {
      if (document.hidden) switched = true;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      result.textContent = (switched || document.hidden)
        ? '앱이 열렸습니다. 이대로 쓰시면 됩니다.'
        : '앱이 열리지 않았어요. 주소를 다시 확인해 주세요.';
    }, 1800);

    try {
      window.location.href = chapterUrl('창세기', 1, pattern);
    } catch (e) { /* 잘못된 주소면 아래 안내가 뜹니다 */ }
  });

  document.getElementById('bibleNoOpenBtn').addEventListener('click', () => {
    bibleAppUrlInput.value = '';
    bibleUrlInput.value = '';
    saveBibleUrl(STORAGE_KEYS.bibleAppUrl, '');
    saveBibleUrl(STORAGE_KEYS.bibleUrl, '');
    document.getElementById('bibleAppTestResult').hidden = true;
    renderBibleTab();
  });

  document.getElementById('bibleUrlResetBtn').addEventListener('click', () => {
    bibleUrlInput.value = DEFAULT_BIBLE_URL;
    bibleAppUrlInput.value = '';
    saveBibleUrl(STORAGE_KEYS.bibleUrl, DEFAULT_BIBLE_URL);
    saveBibleUrl(STORAGE_KEYS.bibleAppUrl, '');
    renderBibleTab();
  });

  function renderProgress() {
    const total = READING_PLAN.length;
    const done = completedDays.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('progressText').textContent = `${done} / ${total}일차`;
    document.getElementById('progressPercent').textContent = `${pct}%`;
    document.getElementById('progressFill').style.width = `${pct}%`;
  }

  function renderReadingList() {
    const list = document.getElementById('readingList');
    const set = completedSet();
    const currentIdx = firstIncompleteDayIndex();
    const frag = document.createDocumentFragment();
    READING_PLAN.forEach((dayChapters, idx) => {
      const li = document.createElement('li');
      const isDone = set.has(idx);
      if (isDone) li.classList.add('done');
      if (idx === currentIdx) li.classList.add('current');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isDone;
      checkbox.addEventListener('change', () => toggleDay(idx, checkbox.checked));

      const dayNum = document.createElement('span');
      dayNum.className = 'reading-day';
      dayNum.textContent = `${idx + 1}일`;

      const label = document.createElement('span');
      label.className = 'reading-label';
      label.textContent = labelForDay(dayChapters);

      li.appendChild(checkbox);
      li.appendChild(dayNum);
      li.appendChild(label);
      frag.appendChild(li);
    });
    list.innerHTML = '';
    list.appendChild(frag);
  }

  function toggleDay(idx, checked) {
    const set = completedSet();
    if (checked) set.add(idx); else set.delete(idx);
    completedDays = Array.from(set).sort((a, b) => a - b);
    saveJSON(STORAGE_KEYS.completedDays, completedDays);
    renderBibleTab();
  }

  function renderBibleTab() {
    renderToday();
    renderProgress();
    renderReadingList();
  }

  document.getElementById('todayCompleteBtn').addEventListener('click', () => {
    const idx = firstIncompleteDayIndex();
    if (idx === -1) return;
    toggleDay(idx, true);
  });

  document.getElementById('resetPlanBtn').addEventListener('click', () => {
    if (!confirm('통독 체크 기록을 모두 초기화할까요?')) return;
    completedDays = [];
    saveJSON(STORAGE_KEYS.completedDays, completedDays);
    renderBibleTab();
  });

  // ---------- Prayer timer tab ----------
  let sessions = loadJSON(STORAGE_KEYS.sessions, []);
  let timerTotalSeconds = 60 * 60;
  let timerRemaining = timerTotalSeconds;
  let timerHandle = null;
  let timerEndAt = null;
  let timerRunning = false;

  const timerDisplay = document.getElementById('timerDisplay');
  const timerMinutesInput = document.getElementById('timerMinutes');
  const startBtn = document.getElementById('timerStartBtn');
  const pauseBtn = document.getElementById('timerPauseBtn');
  const resetBtn = document.getElementById('timerResetBtn');

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function renderTimer() {
    timerDisplay.textContent = formatTime(timerRemaining);
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      [0, 0.35, 0.7].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.32);
      });
    } catch (e) { /* audio not available */ }
  }

  function tick() {
    const remainingMs = timerEndAt - Date.now();
    timerRemaining = remainingMs / 1000;
    if (timerRemaining <= 0) {
      timerRemaining = 0;
      renderTimer();
      finishTimer(true);
      return;
    }
    renderTimer();
  }

  function startTimer() {
    if (timerRunning) return;
    if (timerRemaining <= 0) {
      const mins = Math.max(1, Math.min(180, parseInt(timerMinutesInput.value, 10) || 60));
      timerTotalSeconds = mins * 60;
      timerRemaining = timerTotalSeconds;
    }
    timerEndAt = Date.now() + timerRemaining * 1000;
    timerHandle = setInterval(tick, 250);
    timerRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    timerMinutesInput.disabled = true;
  }

  function pauseTimer() {
    if (!timerRunning) return;
    clearInterval(timerHandle);
    timerRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
  }

  function resetTimer() {
    clearInterval(timerHandle);
    timerRunning = false;
    const mins = Math.max(1, Math.min(180, parseInt(timerMinutesInput.value, 10) || 60));
    timerTotalSeconds = mins * 60;
    timerRemaining = timerTotalSeconds;
    renderTimer();
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    timerMinutesInput.disabled = false;
  }

  function finishTimer(completed) {
    clearInterval(timerHandle);
    timerRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    timerMinutesInput.disabled = false;
    if (completed) {
      playChime();
      sessions.unshift({ date: new Date().toISOString(), minutes: Math.round(timerTotalSeconds / 60) });
      sessions = sessions.slice(0, 50);
      saveJSON(STORAGE_KEYS.sessions, sessions);
      renderSessions();
    }
  }

  function renderSessions() {
    const list = document.getElementById('sessionList');
    const empty = document.getElementById('sessionEmpty');
    list.innerHTML = '';
    if (sessions.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    const frag = document.createDocumentFragment();
    sessions.forEach((s) => {
      const li = document.createElement('li');
      const date = new Date(s.date);
      const dateStr = `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      li.innerHTML = `<span class="session-date">${dateStr}</span><span>${s.minutes}분 기도 완료</span>`;
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', pauseTimer);
  resetBtn.addEventListener('click', resetTimer);
  timerMinutesInput.addEventListener('change', () => {
    if (!timerRunning) resetTimer();
  });

  document.getElementById('clearSessionsBtn').addEventListener('click', () => {
    if (!confirm('기도 기록을 모두 삭제할까요?')) return;
    sessions = [];
    saveJSON(STORAGE_KEYS.sessions, sessions);
    renderSessions();
  });

  // ---------- Prayer requests tab ----------
  let prayers = loadJSON(STORAGE_KEYS.prayers, []);
  let currentFilter = 'all';

  function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function renderPrayers() {
    const list = document.getElementById('prayerList');
    const empty = document.getElementById('prayerEmpty');
    const filtered = prayers.filter((p) => {
      if (currentFilter === 'active') return !p.answered;
      if (currentFilter === 'answered') return p.answered;
      return true;
    });

    list.innerHTML = '';
    if (filtered.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    const frag = document.createDocumentFragment();
    filtered.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'prayer-item' + (p.answered ? ' answered' : '');

      const text = document.createElement('div');
      text.className = 'prayer-item-text';
      text.textContent = p.text;

      li.appendChild(text);

      if (p.verse) {
        const verse = document.createElement('div');
        verse.className = 'prayer-item-verse';
        verse.textContent = `📖 ${p.verse}`;
        li.appendChild(verse);
      }

      if (p.verseText) {
        const verseText = document.createElement('blockquote');
        verseText.className = 'prayer-item-verse-text';
        verseText.textContent = p.verseText;
        li.appendChild(verseText);
      }

      const meta = document.createElement('div');
      meta.className = 'prayer-item-meta';
      const dateSpan = document.createElement('span');
      dateSpan.textContent = p.answered
        ? `${formatDate(p.createdAt)} 시작 · ${formatDate(p.answeredAt)} 응답`
        : `${formatDate(p.createdAt)} 시작`;

      const actions = document.createElement('div');
      actions.className = 'prayer-item-actions';
      const verseBtn = document.createElement('button');
      verseBtn.className = 'verse-btn';
      verseBtn.textContent = p.verse ? '말씀 수정' : '말씀 추가';
      verseBtn.addEventListener('click', () => editVerse(p.id));
      const answerBtn = document.createElement('button');
      answerBtn.className = 'answer-btn';
      answerBtn.textContent = p.answered ? '응답 취소' : '응답됨';
      answerBtn.addEventListener('click', () => toggleAnswered(p.id));
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', () => deletePrayer(p.id));

      actions.appendChild(verseBtn);
      actions.appendChild(answerBtn);
      actions.appendChild(deleteBtn);
      meta.appendChild(dateSpan);
      meta.appendChild(actions);

      li.appendChild(meta);
      frag.appendChild(li);
    });
    list.appendChild(frag);
  }

  function toggleAnswered(id) {
    const p = prayers.find((x) => x.id === id);
    if (!p) return;
    p.answered = !p.answered;
    p.answeredAt = p.answered ? new Date().toISOString() : null;
    saveJSON(STORAGE_KEYS.prayers, prayers);
    renderPrayers();
  }

  // ---------- 말씀 찾기 ----------
  const TOPICS = window.VERSE_TOPICS || [];

  // 같은 구절이 여러 주제에 있으면 하나로 합칩니다.
  const VERSE_INDEX = (() => {
    const byRef = new Map();
    TOPICS.forEach((t) => {
      const keys = [t.topic].concat(t.aliases || []);
      t.verses.forEach((v) => {
        const found = byRef.get(v.ref);
        if (found) {
          found.keys.push(...keys);
        } else {
          byRef.set(v.ref, { ref: v.ref, text: v.text, keys: keys.slice() });
        }
      });
    });
    return Array.from(byRef.values());
  })();

  function searchVerses(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    VERSE_INDEX.forEach((v, order) => {
      let score = 0;
      if (v.keys.some((k) => k.toLowerCase() === q)) score = 4;
      else if (v.keys.some((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()))) score = 3;
      else if (v.ref.toLowerCase().includes(q)) score = 2;
      else if (v.text.toLowerCase().includes(q)) score = 1;
      if (score > 0) scored.push({ v, score, order });
    });
    scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
    return scored.slice(0, 40).map((s) => s.v);
  }

  const verseModal = document.getElementById('verseModal');
  const verseSearchInput = document.getElementById('verseSearchInput');
  const verseResultsEl = document.getElementById('verseResults');
  const verseNoResultEl = document.getElementById('verseNoResult');
  const verseChipsEl = document.getElementById('verseChips');
  const pendingVerseEl = document.getElementById('pendingVerseText');

  // 새 기도제목 폼에 담아둔 말씀 본문 (참조는 입력칸에 그대로 보입니다)
  let pendingVerseText = '';
  // 모달이 어디로 결과를 넣을지: null 이면 새 기도제목 폼, 아니면 해당 기도제목 id
  let verseTargetId = null;

  function renderVerseChips() {
    const frag = document.createDocumentFragment();
    TOPICS.forEach((t) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'verse-chip';
      chip.textContent = t.topic;
      chip.addEventListener('click', () => {
        verseSearchInput.value = t.topic;
        renderVerseResults();
      });
      frag.appendChild(chip);
    });
    verseChipsEl.appendChild(frag);
  }

  function renderVerseResults() {
    const query = verseSearchInput.value;
    const results = searchVerses(query);

    Array.from(verseChipsEl.children).forEach((chip) => {
      chip.classList.toggle('active', chip.textContent === query.trim());
    });

    verseResultsEl.innerHTML = '';
    verseNoResultEl.hidden = !(query.trim() && results.length === 0);

    const frag = document.createDocumentFragment();
    results.forEach((v) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'verse-result';

      const ref = document.createElement('div');
      ref.className = 'verse-result-ref';
      ref.textContent = v.ref;

      const text = document.createElement('div');
      text.className = 'verse-result-text';
      text.textContent = v.text;

      btn.appendChild(ref);
      btn.appendChild(text);
      btn.addEventListener('click', () => applyVerse(v.ref, v.text));
      li.appendChild(btn);
      frag.appendChild(li);
    });
    verseResultsEl.appendChild(frag);
  }

  function openVerseSearch(targetId) {
    verseTargetId = targetId || null;
    verseModal.hidden = false;
    const seed = verseTargetId
      ? (prayers.find((p) => p.id === verseTargetId) || {}).verse || ''
      : document.getElementById('prayerVerseInput').value;
    verseSearchInput.value = seed;
    renderVerseResults();
    verseSearchInput.focus();
  }

  function closeVerseSearch() {
    verseModal.hidden = true;
    verseTargetId = null;
  }

  function renderPendingVerse() {
    if (pendingVerseText) {
      pendingVerseEl.textContent = pendingVerseText;
      pendingVerseEl.hidden = false;
    } else {
      pendingVerseEl.hidden = true;
    }
  }

  function applyVerse(ref, text) {
    if (verseTargetId) {
      const p = prayers.find((x) => x.id === verseTargetId);
      if (p) {
        p.verse = ref;
        p.verseText = text || '';
        saveJSON(STORAGE_KEYS.prayers, prayers);
        renderPrayers();
      }
    } else {
      document.getElementById('prayerVerseInput').value = ref;
      pendingVerseText = text || '';
      renderPendingVerse();
    }
    closeVerseSearch();
  }

  verseModal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeVerseSearch);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !verseModal.hidden) closeVerseSearch();
  });
  verseSearchInput.addEventListener('input', renderVerseResults);
  document.getElementById('verseSearchBtn').addEventListener('click', () => openVerseSearch(null));
  // 참조를 직접 고쳐 쓰면 찾아둔 본문은 떼어 냅니다.
  document.getElementById('prayerVerseInput').addEventListener('input', () => {
    if (!pendingVerseText) return;
    pendingVerseText = '';
    renderPendingVerse();
  });
  document.getElementById('verseManualBtn').addEventListener('click', () => {
    const seed = verseTargetId
      ? (prayers.find((p) => p.id === verseTargetId) || {}).verse || ''
      : document.getElementById('prayerVerseInput').value;
    const input = prompt('관련 말씀을 직접 적어주세요 (예: 빌립보서 4:6)', seed);
    if (input === null) return;
    applyVerse(input.trim(), '');
  });
  renderVerseChips();

  function editVerse(id) {
    openVerseSearch(id);
  }

  function deletePrayer(id) {
    prayers = prayers.filter((x) => x.id !== id);
    saveJSON(STORAGE_KEYS.prayers, prayers);
    renderPrayers();
  }

  document.getElementById('prayerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('prayerInput');
    const verseInput = document.getElementById('prayerVerseInput');
    const text = input.value.trim();
    if (!text) return;
    prayers.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      verse: verseInput.value.trim(),
      verseText: pendingVerseText,
      createdAt: new Date().toISOString(),
      answered: false,
      answeredAt: null,
    });
    saveJSON(STORAGE_KEYS.prayers, prayers);
    input.value = '';
    verseInput.value = '';
    pendingVerseText = '';
    renderPendingVerse();
    renderPrayers();
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderPrayers();
    });
  });

  // ---------- Tab navigation ----------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // ---------- Init ----------
  renderBibleTab();
  renderTimer();
  renderSessions();
  renderPrayers();

  // ---------- PWA: service worker + install prompt ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  let deferredInstallPrompt = null;
  const installBtn = document.getElementById('installBtn');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    installBtn.hidden = true;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    deferredInstallPrompt = null;
  });
})();
