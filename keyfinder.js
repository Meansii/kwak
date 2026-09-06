// 마이크로 들리는 소리에서 키(조성)를 찾아 줍니다.
// 멜론·유튜브를 스피커로 틀어 두면 그 소리를 듣고 12음의 세기를 재서,
// 24개 조성(장조 12 · 단조 12)과 견주어 가장 비슷한 키를 고릅니다.
(() => {
  'use strict';

  const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Krumhansl-Kessler 조성 프로파일 — 사람이 각 조에서 느끼는 12음의 비중입니다.
  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  const LOW_MIDI = 40; // E2
  const HIGH_MIDI = 95; // B6
  const DB_FLOOR = -78;
  const LISTEN_SECONDS = 15;
  const MIN_SECONDS = 4;

  const el = (id) => document.getElementById(id);

  let audioCtx = null;
  let stream = null;
  let analyser = null;
  let rafTimer = null;
  let chroma = new Array(12).fill(0);
  let frames = 0;
  let quietFrames = 0;
  let startedAt = 0;
  let onPick = null;

  function noteFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function correlate(a, b) {
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i] - ma;
      const y = b[i] - mb;
      num += x * y;
      da += x * x;
      db += y * y;
    }
    const den = Math.sqrt(da * db);
    return den === 0 ? 0 : num / den;
  }

  // 12음의 세기를 24개 조성과 견주어 비슷한 순으로 돌려줍니다.
  function rankKeys(profile) {
    const results = [];
    for (let root = 0; root < 12; root++) {
      const rotated = profile.map((_, i) => profile[(i + root) % 12]);
      results.push({ key: PITCH_NAMES[root], minor: false, score: correlate(rotated, MAJOR_PROFILE) });
      results.push({ key: PITCH_NAMES[root] + 'm', minor: true, score: correlate(rotated, MINOR_PROFILE) });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function isRelativePair(a, b) {
    const rootOf = (k) => PITCH_NAMES.indexOf(k.endsWith('m') ? k.slice(0, -1) : k);
    if (a.minor === b.minor) return false;
    const major = a.minor ? b : a;
    const minor = a.minor ? a : b;
    return (rootOf(major.key) + 9) % 12 === rootOf(minor.key);
  }

  // ---------- 듣기 ----------
  function collect() {
    const bins = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(bins);
    const binHz = audioCtx.sampleRate / analyser.fftSize;

    const frame = new Array(12).fill(0);
    let total = 0;
    for (let midi = LOW_MIDI; midi <= HIGH_MIDI; midi++) {
      const f = noteFrequency(midi);
      const from = Math.floor((f * Math.pow(2, -0.5 / 12)) / binHz);
      const to = Math.ceil((f * Math.pow(2, 0.5 / 12)) / binHz);
      let peak = -Infinity;
      for (let i = Math.max(0, from); i <= Math.min(bins.length - 1, to); i++) {
        if (bins[i] > peak) peak = bins[i];
      }
      const weight = peak > DB_FLOOR ? (peak - DB_FLOOR) / -DB_FLOOR : 0;
      frame[midi % 12] += weight;
      total += weight;
    }

    // 조용한 순간은 버립니다. 소리가 있을 때만 한 프레임씩 쌓습니다.
    if (total < 0.6) {
      quietFrames += 1;
    } else {
      for (let i = 0; i < 12; i++) chroma[i] += frame[i] / total;
      frames += 1;
    }
    return total;
  }

  function renderBars(total) {
    const wrap = el('keyFinderBars');
    const max = Math.max(...chroma, 0.0001);
    const bars = wrap.querySelectorAll('.chroma-bar span');
    bars.forEach((bar, i) => {
      bar.style.height = `${Math.round((chroma[i] / max) * 100)}%`;
    });

    const heard = el('keyFinderHeard');
    if (total < 0.6) heard.textContent = '🔇 소리가 잘 안 들립니다 — 더 크게 틀어 주세요';
    else if (total < 2) heard.textContent = '🔈 소리가 조금 작습니다';
    else heard.textContent = '🔊 소리를 잘 듣고 있습니다';
  }

  function renderLive() {
    const elapsed = (Date.now() - startedAt) / 1000;
    const left = Math.max(0, Math.ceil(LISTEN_SECONDS - elapsed));
    el('keyFinderTimer').textContent = left > 0 ? `${left}초 남음` : '정리하는 중…';
    el('keyFinderProgress').style.width = `${Math.min(100, (elapsed / LISTEN_SECONDS) * 100)}%`;

    const total = collect();
    renderBars(total);

    if (frames > 12) {
      const best = rankKeys(chroma)[0];
      el('keyFinderGuess').hidden = false;
      el('keyFinderGuess').textContent = `지금까지는 ${best.key} 같습니다`;
    }

    if (elapsed >= LISTEN_SECONDS) finish();
    else rafTimer = setTimeout(renderLive, 120);
  }

  async function startListening() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('이 브라우저에서는 마이크를 쓸 수 없습니다. 크롬이나 사파리로 열어 주세요.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // 소리를 있는 그대로 들어야 음이 어그러지지 않습니다.
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });
    } catch (e) {
      const name = (e && e.name) || '';
      let message = '마이크를 열지 못했습니다. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        message = '마이크 사용을 허락해 주셔야 소리를 들을 수 있습니다. 주소창 옆의 자물쇠를 눌러 마이크를 켜 주세요.';
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        message = '마이크를 찾지 못했습니다. 마이크가 있는 기기에서 열어 주세요.';
      }
      showError(message);
      return;
    }

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 16384;
    analyser.smoothingTimeConstant = 0.3;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    chroma = new Array(12).fill(0);
    frames = 0;
    quietFrames = 0;
    startedAt = Date.now();

    setStage('listening');
    renderLive();
  }

  function stopAudio() {
    if (rafTimer) clearTimeout(rafTimer);
    rafTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (audioCtx) audioCtx.close().catch(() => {});
    audioCtx = null;
    analyser = null;
  }

  function finish() {
    const elapsed = (Date.now() - startedAt) / 1000;
    stopAudio();

    if (frames < 10) {
      showError(
        elapsed < MIN_SECONDS
          ? '너무 짧게 들었습니다. 노래를 틀어 두고 다시 눌러 주세요.'
          : '소리를 거의 못 들었습니다. 스피커로 크게 틀어 주시고, 이어폰은 빼 주세요.'
      );
      return;
    }

    const ranked = rankKeys(chroma);
    renderResult(ranked);
    setStage('result');
  }

  function renderResult(ranked) {
    const wrap = el('keyFinderResults');
    wrap.innerHTML = '';
    const top = ranked.slice(0, 3);
    // 24개 조성의 한가운데 점수를 0으로 잡아야 1·2·3등의 차이가 눈에 보입니다.
    const middle = ranked[Math.floor(ranked.length / 2)].score;
    const spread = Math.max(0.0001, top[0].score - middle);

    top.forEach((item, index) => {
      const share = Math.round(((item.score - middle) / spread) * 100);
      const row = document.createElement('div');
      row.className = 'kf-result' + (index === 0 ? ' best' : '');
      row.innerHTML = `
        <span class="kf-result-key">${item.key}</span>
        <span class="kf-result-main">
          <span class="kf-result-label">${index === 0 ? '가장 비슷한 키' : '이것도 비슷합니다'}</span>
          <span class="kf-meter"><span style="width:${Math.max(6, share)}%"></span></span>
        </span>
        <button type="button" class="btn btn-${index === 0 ? 'primary' : 'secondary'} kf-pick">이 키로</button>`;
      row.querySelector('.kf-pick').addEventListener('click', () => {
        const pick = onPick;
        close();
        if (pick) pick(item.key);
      });
      wrap.appendChild(row);
    });

    const note = el('keyFinderNote');
    if (isRelativePair(top[0], top[1])) {
      note.textContent = `${top[0].key}와 ${top[1].key}는 조표가 같아 소리로는 잘 안 갈립니다. 악보의 첫 화음이나 마지막 화음을 보고 골라 주세요.`;
    } else {
      note.textContent = '반주가 두껍거나 소리가 작으면 한 칸씩 어긋날 수 있습니다. 악보와 견주어 확인해 주세요.';
    }
  }

  function showError(message) {
    stopAudio();
    setStage('error');
    el('keyFinderError').textContent = message;
  }

  function setStage(stage) {
    el('keyFinderIntro').hidden = stage !== 'intro';
    el('keyFinderListening').hidden = stage !== 'listening';
    el('keyFinderResult').hidden = stage !== 'result';
    el('keyFinderErrorBox').hidden = stage !== 'error';
  }

  function open(callback) {
    onPick = callback || null;
    chroma = new Array(12).fill(0);
    el('keyFinderGuess').hidden = true;
    setStage('intro');
    el('keyFinderModal').hidden = false;
  }

  function close() {
    stopAudio();
    el('keyFinderModal').hidden = true;
    onPick = null;
  }

  function buildBars() {
    const wrap = el('keyFinderBars');
    wrap.innerHTML = '';
    for (const name of PITCH_NAMES) {
      const bar = document.createElement('div');
      bar.className = 'chroma-bar';
      bar.innerHTML = `<span></span><small>${name}</small>`;
      wrap.appendChild(bar);
    }
  }

  function bind() {
    buildBars();
    el('keyFinderStartBtn').addEventListener('click', startListening);
    el('keyFinderStopBtn').addEventListener('click', finish);
    el('keyFinderRetryBtn').addEventListener('click', () => setStage('intro'));
    el('keyFinderAgainBtn').addEventListener('click', () => setStage('intro'));
    document.querySelectorAll('[data-close-keyfinder]').forEach((btn) => btn.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el('keyFinderModal').hidden) close();
    });
    // 화면을 벗어나면 마이크를 놓아 줍니다.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && stream) finish();
    });
  }

  bind();
  window.kwakKeyFinder = { open, close };
})();
