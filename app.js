(() => {
  'use strict';

  const STORAGE_KEYS = {
    completedDays: 'kwak_bible_completed_days',
    sessions: 'kwak_prayer_sessions',
    prayers: 'kwak_prayer_requests',
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
    } else {
      todayEl.textContent = `${idx + 1}일차 · ${labelForDay(READING_PLAN[idx])}`;
      todayEl.classList.remove('done');
      btn.disabled = false;
      btn.textContent = '오늘 읽기 완료';
    }
  }

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

      const meta = document.createElement('div');
      meta.className = 'prayer-item-meta';
      const dateSpan = document.createElement('span');
      dateSpan.textContent = p.answered
        ? `${formatDate(p.createdAt)} 시작 · ${formatDate(p.answeredAt)} 응답`
        : `${formatDate(p.createdAt)} 시작`;

      const actions = document.createElement('div');
      actions.className = 'prayer-item-actions';
      const answerBtn = document.createElement('button');
      answerBtn.className = 'answer-btn';
      answerBtn.textContent = p.answered ? '응답 취소' : '응답됨';
      answerBtn.addEventListener('click', () => toggleAnswered(p.id));
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', () => deletePrayer(p.id));

      actions.appendChild(answerBtn);
      actions.appendChild(deleteBtn);
      meta.appendChild(dateSpan);
      meta.appendChild(actions);

      li.appendChild(text);
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

  function deletePrayer(id) {
    prayers = prayers.filter((x) => x.id !== id);
    saveJSON(STORAGE_KEYS.prayers, prayers);
    renderPrayers();
  }

  document.getElementById('prayerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('prayerInput');
    const text = input.value.trim();
    if (!text) return;
    prayers.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      createdAt: new Date().toISOString(),
      answered: false,
      answeredAt: null,
    });
    saveJSON(STORAGE_KEYS.prayers, prayers);
    input.value = '';
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
})();
