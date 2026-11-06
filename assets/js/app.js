/*
 * app.js — state, render, timer, penyimpanan, dan peristiwa.
 * Bergantung pada window.Engine, window.BANK_A, dan window.BANK_B.
 */
(function () {
  'use strict';

  var Engine = window.Engine;
  var KEYS = {
    session: 'catudin.v1.session',
    history: 'catudin.v1.history',
    lastName: 'catudin.v1.lastName'
  };
  var TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .'-]+$/;
  var STORAGE_OK = true;
  var memoryStore = {};
  var storageNoticeShown = false;
  var session = null;
  var timerId = null;
  var lastRemaining = null;
  var pendingStart = null;
  var confirmAction = null;
  var lastFocused = null;
  var openModals = [];
  var currentFilter = 'all';
  var nameTouched = false;

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function letterOf(index) {
    return String.fromCharCode(65 + index);
  }

  /* ---------------- penyimpanan ---------------- */

  function showStorageNotice() {
    if (storageNoticeShown) return;
    storageNoticeShown = true;
    var notice = $('storage-notice');
    if (notice) notice.hidden = false;
  }

  function readRaw(key) {
    if (STORAGE_OK) {
      try {
        return window.localStorage.getItem(key);
      } catch (err) {
        STORAGE_OK = false;
        showStorageNotice();
      }
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }

  function writeRaw(key, value) {
    memoryStore[key] = value;
    if (!STORAGE_OK) return;
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      STORAGE_OK = false;
      showStorageNotice();
    }
  }

  function removeRaw(key) {
    delete memoryStore[key];
    if (!STORAGE_OK) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      STORAGE_OK = false;
      showStorageNotice();
    }
  }

  function parseJSON(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function loadSession() {
    var data = parseJSON(readRaw(KEYS.session), null);
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.questions) || data.questions.length !== 100) return null;
    if (!Array.isArray(data.jawaban) || !Array.isArray(data.ragu)) return null;
    return data;
  }

  function saveSession() {
    if (!session) return;
    session.updatedAt = Date.now();
    session.tabId = TAB_ID;
    writeRaw(KEYS.session, JSON.stringify(session));
  }

  function loadHistory() {
    var data = parseJSON(readRaw(KEYS.history), null);
    if (!Array.isArray(data)) return [];
    return data.filter(function (item) {
      return item && typeof item === 'object' && typeof item.nama === 'string';
    }).slice(0, 10);
  }

  function addHistory(entry) {
    var history = loadHistory();
    history.unshift(entry);
    history = history.slice(0, 10);
    writeRaw(KEYS.history, JSON.stringify(history));
  }

  function countAnswered() {
    if (!session) return 0;
    var count = 0;
    for (var i = 0; i < session.jawaban.length; i++) {
      if (Number.isInteger(session.jawaban[i])) count += 1;
    }
    return count;
  }

  function countMarked() {
    if (!session) return 0;
    return session.ragu.filter(Boolean).length;
  }

  /* ---------------- validasi nama ---------------- */

  function validateName(value) {
    var name = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!name) return { ok: false, message: 'Nama wajib diisi.' };
    if (name.length < 3) return { ok: false, message: 'Nama minimal 3 karakter.' };
    if (name.length > 60) return { ok: false, message: 'Nama maksimal 60 karakter.' };
    if (!NAME_RE.test(name)) {
      return { ok: false, message: 'Nama hanya boleh berisi huruf, angka, spasi, titik, apostrof, atau tanda hubung.' };
    }
    return { ok: true, value: name };
  }

  function updateNameValidation(showError) {
    var input = $('input-name');
    var error = $('name-error');
    var result = validateName(input.value);
    $('btn-start').disabled = !result.ok;
    input.setAttribute('aria-invalid', result.ok ? 'false' : 'true');
    if (!result.ok && showError) {
      error.textContent = result.message;
      error.hidden = false;
    } else {
      error.hidden = true;
      error.textContent = '';
    }
    return result;
  }

  /* ---------------- navigasi layar ---------------- */

  function showScreen(name) {
    ['home', 'exam', 'result'].forEach(function (key) {
      var screen = $('screen-' + key);
      if (screen) screen.hidden = key !== name;
    });
    document.body.classList.toggle('is-exam', name === 'exam');
    document.body.classList.toggle('is-result', name === 'result');
    if (name !== 'exam') {
      stopTimer();
      closeNav(false);
    }
    try {
      window.scrollTo(0, 0);
    } catch (err) {
      /* abaikan */
    }
    if (name === 'home') {
      renderResume();
      renderHistory();
    }
  }

  function getPaket() {
    var checked = document.querySelector('input[name="paket"]:checked');
    return checked ? checked.value : 'A';
  }

  function setPaketRadios(paket) {
    var radios = document.querySelectorAll('input[name="paket"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === paket;
    }
  }

  function getBank(paket) {
    return paket === 'B' ? window.BANK_B : window.BANK_A;
  }

  function showBankError(message) {
    var box = $('bank-error');
    if (!box) return;
    box.textContent = message || 'Bank soal tidak dapat dimuat.';
    box.hidden = false;
    try {
      box.scrollIntoView({ block: 'center' });
    } catch (err) {
      /* abaikan */
    }
  }

  function hideBankError() {
    var box = $('bank-error');
    if (box) {
      box.hidden = true;
      box.textContent = '';
    }
  }

  /* ---------------- mulai ujian ---------------- */

  function requestStart(event) {
    if (event) event.preventDefault();
    var result = updateNameValidation(true);
    if (!result.ok) {
      $('input-name').focus();
      return;
    }
    var paket = getPaket();
    if (!getBank(paket)) {
      showBankError('Bank soal Paket ' + paket + ' tidak tersedia. Periksa berkas assets/js/data-paket-' + paket.toLowerCase() + '.js.');
      return;
    }
    pendingStart = { nama: result.value, paket: paket };
    openModal('modal-rules');
  }

  function startExam(config) {
    if (!config) return;
    try {
      var bank = getBank(config.paket);
      var exam = Engine.buildExam(config.nama, config.paket, bank);
      var now = Date.now();
      var duration = getTestDuration();
      session = {
        nama: exam.nama,
        paket: exam.paket,
        seed: exam.seed,
        startedAt: now,
        deadline: now + duration * 1000,
        questions: exam.questions,
        jawaban: exam.questions.map(function () { return null; }),
        ragu: exam.questions.map(function () { return false; }),
        current: 0,
        finishedAt: null,
        finishReason: null,
        historySaved: false
      };
      lastRemaining = null;
      hideBankError();
      writeRaw(KEYS.lastName, exam.nama);
      setPaketRadios(exam.paket);
      saveSession();
      buildNav();
      showScreen('exam');
      renderQuestion(true);
      startTimer();
      $('multitab-banner').hidden = true;
    } catch (err) {
      showBankError(err && err.message ? err.message : 'Bank soal tidak dapat dimuat.');
      showScreen('home');
    }
  }

  function getTestDuration() {
    try {
      var params = new URLSearchParams(window.location.search);
      var test = parseInt(params.get('detik'), 10);
      if (Number.isFinite(test) && test > 0) return test;
    } catch (err) {
      /* abaikan */
    }
    return Engine.RULES.durasiDetik;
  }

  /* ---------------- resume ---------------- */

  function renderResume() {
    var banner = $('resume-banner');
    if (!banner) return;
    if (session && !session.finishedAt) {
      var remaining = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
      $('resume-summary').textContent =
        session.nama + ' · Paket ' + session.paket + ' · sisa ' + Engine.formatTime(remaining) +
        ' · ' + countAnswered() + '/100 terjawab';
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  function resumeExam() {
    if (!session || session.finishedAt) return;
    if (Date.now() >= session.deadline) {
      finalizeSession('timeout');
      return;
    }
    buildNav();
    showScreen('exam');
    renderQuestion(true);
    startTimer();
  }

  function discardSession() {
    askConfirm(
      'Mulai baru?',
      'Sesi ujian yang belum selesai akan dihapus. Jawaban pada sesi tersebut tidak dapat dikembalikan.',
      'Hapus dan Mulai Baru',
      function () {
        session = null;
        removeRaw(KEYS.session);
        renderResume();
        showScreen('home');
        $('input-name').focus();
      }
    );
  }

  /* ---------------- render ujian ---------------- */

  function buildNav() {
    var container = $('nav-groups');
    if (!container || !session) return;
    container.textContent = '';
    var groups = [];
    var currentJenis = null;

    session.questions.forEach(function (q, index) {
      if (q.jenis !== currentJenis) {
        currentJenis = q.jenis;
        groups.push({ jenis: q.jenis, indexes: [] });
      }
      groups[groups.length - 1].indexes.push(index);
    });

    groups.forEach(function (group) {
      var section = el('section', 'nav-group');
      var heading = el('h3', 'nav-group-head');
      var label = el('span', 'nav-group-label', Engine.JENIS[group.jenis].label);
      var range = el('span', 'nav-group-range', (group.indexes[0] + 1) + '–' + (group.indexes[group.indexes.length - 1] + 1));
      heading.appendChild(label);
      heading.appendChild(range);
      var grid = el('div', 'nav-grid');
      group.indexes.forEach(function (index) {
        var button = el('button', 'nav-btn', String(index + 1));
        button.type = 'button';
        button.dataset.index = String(index);
        button.addEventListener('click', function () { goTo(index); });
        grid.appendChild(button);
      });
      section.appendChild(heading);
      section.appendChild(grid);
      container.appendChild(section);
    });

    updateNav();
  }

  function updateNav() {
    if (!session) return;
    var buttons = $('nav-groups').querySelectorAll('.nav-btn');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var index = Number(button.dataset.index);
      var q = session.questions[index];
      var answered = Number.isInteger(session.jawaban[index]);
      var marked = session.ragu[index] === true;
      button.classList.toggle('is-answered', answered);
      button.classList.toggle('is-marked', marked);
      button.classList.toggle('is-current', index === session.current);
      if (index === session.current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      var status = answered ? 'terjawab' : 'belum dijawab';
      if (marked) status += ', ragu-ragu';
      button.setAttribute('aria-label', 'Soal ' + (index + 1) + ', ' + q.jenis + ', ' + status);
      button.title = q.sub;
    }
    var answeredCount = countAnswered();
    var markedCount = countMarked();
    $('nav-summary').textContent = answeredCount + ' terjawab · ' + markedCount + ' ragu-ragu';
    $('exam-progress').textContent = answeredCount + ' / ' + session.questions.length;
  }

  function renderQuestion(focusHeading) {
    if (!session) return;
    var index = session.current;
    var q = session.questions[index];
    if (!q) return;

    $('exam-name').textContent = session.nama;
    $('exam-paket').textContent = 'Paket ' + session.paket;
    $('question-jenis').textContent = q.jenis;
    $('question-jenis').className = 'badge badge-' + q.jenis.toLowerCase();
    $('question-sub').textContent = q.sub;
    $('question-number').textContent = 'Soal ' + (index + 1) + ' dari ' + session.questions.length;
    $('question-text').textContent = q.soal;
    $('question-marked').hidden = !session.ragu[index];

    renderOptions(q);
    updateMarkButton();
    updateNav();
    $('btn-prev').disabled = index === 0;
    $('btn-next').disabled = index === session.questions.length - 1;

    if (focusHeading) {
      try {
        $('question-number').focus({ preventScroll: true });
      } catch (err) {
        $('question-number').focus();
      }
      try {
        window.scrollTo(0, 0);
      } catch (err) {
        /* abaikan */
      }
    }
  }

  function renderOptions(q) {
    var wrap = $('options');
    if (!wrap) return;
    wrap.textContent = '';
    var selected = session.jawaban[session.current];
    q.opsi.forEach(function (text, index) {
      var button = el('button', 'option');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', selected === index ? 'true' : 'false');
      button.dataset.index = String(index);
      if (selected === index) button.classList.add('is-selected');
      button.appendChild(el('span', 'option-letter', letterOf(index)));
      button.appendChild(el('span', 'option-text', text));
      button.addEventListener('click', function () { selectOption(index); });
      wrap.appendChild(button);
    });
  }

  function selectOption(index) {
    if (!session || session.finishedAt) return;
    session.jawaban[session.current] = index;
    saveSession();
    var buttons = $('options').querySelectorAll('.option');
    for (var i = 0; i < buttons.length; i++) {
      var selected = Number(buttons[i].dataset.index) === index;
      buttons[i].classList.toggle('is-selected', selected);
      buttons[i].setAttribute('aria-checked', selected ? 'true' : 'false');
    }
    updateNav();
    renderResume();
  }

  function toggleMark() {
    if (!session || session.finishedAt) return;
    session.ragu[session.current] = !session.ragu[session.current];
    saveSession();
    $('question-marked').hidden = !session.ragu[session.current];
    updateMarkButton();
    updateNav();
    renderResume();
  }

  function updateMarkButton() {
    var active = session.ragu[session.current] === true;
    var button = $('btn-mark');
    button.classList.toggle('is-on', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.textContent = active ? 'Batalkan Tanda Ragu-ragu' : 'Tandai Ragu-ragu';
  }

  function goTo(index) {
    if (!session || session.finishedAt) return;
    var next = Math.max(0, Math.min(session.questions.length - 1, Number(index)));
    session.current = next;
    saveSession();
    renderQuestion(true);
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      closeNav(false);
    }
  }

  function prevQuestion() {
    if (!session) return;
    goTo(session.current - 1);
  }

  function nextQuestion() {
    if (!session) return;
    goTo(session.current + 1);
  }

  function openNav() {
    var nav = $('exam-nav');
    if (!nav) return;
    nav.classList.add('is-open');
    $('btn-nav-toggle').setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  }

  function closeNav(restoreFocus) {
    var nav = $('exam-nav');
    if (!nav) return;
    var wasOpen = nav.classList.contains('is-open');
    nav.classList.remove('is-open');
    if ($('btn-nav-toggle')) $('btn-nav-toggle').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    if (wasOpen && restoreFocus) $('btn-nav-toggle').focus();
  }

  function toggleNav() {
    var nav = $('exam-nav');
    if (!nav) return;
    if (nav.classList.contains('is-open')) closeNav(true);
    else openNav();
  }

  /* ---------------- timer ---------------- */

  function startTimer() {
    stopTimer();
    if (!session || session.finishedAt) return;
    lastRemaining = null;
    tickTimer();
    if (session && !session.finishedAt) {
      timerId = window.setInterval(tickTimer, 1000);
    }
  }

  function stopTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    document.title = 'Simulasi CAT Ujian Dinas Tingkat I';
  }

  function tickTimer() {
    if (!session || session.finishedAt) return;
    var remaining = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
    updateTimer(remaining);
    if (remaining <= 0) {
      finalizeSession('timeout');
      return;
    }
    announceThreshold(remaining);
    lastRemaining = remaining;
  }

  function updateTimer(remaining) {
    var timer = $('timer');
    if (!timer) return;
    timer.textContent = Engine.formatTime(remaining);
    $('timer-box').classList.toggle('is-danger', remaining <= 300);
    document.title = Engine.formatTime(remaining) + ' · Simulasi CAT UDIN';
  }

  function announceThreshold(remaining) {
    if (lastRemaining === null) return;
    var thresholds = [600, 300, 60];
    for (var i = 0; i < thresholds.length; i++) {
      var threshold = thresholds[i];
      if (lastRemaining > threshold && remaining <= threshold) {
        $('timer-announcer').textContent = 'Sisa waktu ' + Engine.formatTime(remaining) + '.';
        break;
      }
    }
  }

  /* ---------------- finalisasi dan hasil ---------------- */

  function requestFinish() {
    if (!session || session.finishedAt) return;
    var empty = session.questions.length - countAnswered();
    var marked = countMarked();
    var message;
    if (empty === 0 && marked === 0) {
      message = 'Semua soal telah dijawab dan tidak ada soal yang ditandai ragu-ragu. Kumpulkan jawaban sekarang?';
    } else {
      message = 'Masih ada ' + empty + ' soal kosong dan ' + marked + ' soal ditandai ragu-ragu. Kumpulkan jawaban sekarang?';
    }
    askConfirm('Selesai ujian?', message, 'Kumpulkan Jawaban', function () {
      finalizeSession('manual');
    });
  }

  function finalizeSession(reason) {
    if (!session) return;
    stopTimer();

    if (!session.finishedAt) {
      session.finishedAt = reason === 'timeout' ? Math.min(Date.now(), session.deadline) : Date.now();
      session.finishReason = reason;
    } else if (!session.finishReason) {
      session.finishReason = reason;
    }

    var score = Engine.scoreExam(session.questions, session.jawaban);

    if (!session.historySaved) {
      addHistory({
        id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        tanggal: new Date().toISOString(),
        nama: session.nama,
        paket: session.paket,
        TWK: score.jenis.TWK.skor,
        TPU: score.jenis.TPU.skor,
        TSI: score.jenis.TSI.skor,
        total: score.total,
        lulus: score.lulus,
        alasan: session.finishReason || 'manual'
      });
      session.historySaved = true;
    }

    saveSession();
    renderResult(score);
    showScreen('result');
    document.title = 'Hasil · Simulasi CAT UDIN';
  }

  function renderResult(score) {
    var lulus = score.lulus;
    var timeout = session.finishReason === 'timeout';
    var banner = $('result-banner');
    banner.classList.toggle('is-pass', lulus);
    banner.classList.toggle('is-fail', !lulus);

    $('result-eyebrow').textContent = timeout ? 'Waktu habis · hasil simulasi' : 'Hasil simulasi';
    $('result-status').textContent = lulus ? 'LULUS' : 'TIDAK LULUS';
    $('result-icon').textContent = lulus ? '✓' : '✗';
    $('result-subtitle').textContent = lulus
      ? (timeout ? 'Waktu habis, jawaban terkumpul otomatis, dan seluruh ambang batas terpenuhi.' : 'Seluruh ambang batas terpenuhi.')
      : failureMessage(score);

    var finishedAt = session.finishedAt || Date.now();
    var meta = session.nama + ' · Paket ' + session.paket + ' · ' + formatDateTime(finishedAt) +
      ' · ' + score.terjawab + ' terjawab' + (timeout ? ' · waktu habis' : '');
    $('result-meta').textContent = meta;
    $('print-meta').textContent = meta;
    $('result-total').textContent = score.total;

    renderScoreCards(score);
    renderDetail(score);
    renderDiscussion();
  }

  function failureMessage(score) {
    var failed = [];
    Object.keys(Engine.JENIS).forEach(function (key) {
      var data = score.jenis[key];
      if (!data.lulus) {
        failed.push(key + ' ' + data.skor + ' dari ambang ' + data.ambang);
      }
    });
    if (!failed.length) return 'Seluruh ambang batas terpenuhi.';
    return 'Belum memenuhi ambang batas: ' + failed.join('; ') + '.';
  }

  function renderScoreCards(score) {
    var wrap = $('score-cards');
    wrap.textContent = '';
    Object.keys(Engine.JENIS).forEach(function (key) {
      var meta = Engine.JENIS[key];
      var data = score.jenis[key];
      var card = el('article', 'score-card ' + (data.lulus ? 'is-pass' : 'is-fail'));

      var head = el('div', 'score-card-head');
      head.appendChild(el('span', 'score-kode', key));
      head.appendChild(el('span', 'score-name', meta.label));
      head.appendChild(el('span', 'score-status', data.lulus ? '✓ Tercapai' : '✗ Belum'));
      card.appendChild(head);

      var value = el('p', 'score-value');
      value.appendChild(el('strong', null, String(data.skor)));
      value.appendChild(el('span', null, '/ ' + data.maks));
      card.appendChild(value);

      var bar = el('div', 'score-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', 'Nilai ' + key + ' ' + data.skor + ' dari ' + data.maks);
      var fill = el('span', 'score-bar-fill');
      fill.style.width = Math.max(0, Math.min(100, data.maks ? (data.skor / data.maks) * 100 : 0)) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);

      card.appendChild(el('p', 'score-foot', 'Ambang batas ' + data.ambang + ' · benar ' + data.benar + '/' + data.total));
      wrap.appendChild(card);
    });
  }

  function renderDetail(score) {
    var body = $('detail-body');
    body.textContent = '';
    score.perSub.forEach(function (row) {
      var tr = document.createElement('tr');
      var jenisCell = document.createElement('td');
      jenisCell.dataset.label = 'Jenis';
      jenisCell.appendChild(el('span', 'badge badge-' + row.jenis.toLowerCase(), row.jenis));
      tr.appendChild(jenisCell);
      var subCell = document.createElement('td');
      subCell.dataset.label = 'Sub-materi';
      subCell.textContent = row.sub;
      tr.appendChild(subCell);
      var benarCell = document.createElement('td');
      benarCell.className = 'num';
      benarCell.dataset.label = 'Benar';
      benarCell.textContent = row.benar + ' / ' + row.total;
      tr.appendChild(benarCell);
      var totalCell = document.createElement('td');
      totalCell.className = 'num';
      totalCell.dataset.label = 'Jumlah soal';
      totalCell.textContent = String(row.total);
      tr.appendChild(totalCell);
      body.appendChild(tr);
    });
  }

  function renderDiscussion() {
    var list = $('discussion-list');
    list.textContent = '';
    var counts = { all: 0, wrong: 0, empty: 0 };

    session.questions.forEach(function (q, index) {
      var answer = session.jawaban[index];
      var hasAnswer = Number.isInteger(answer) && answer >= 0 && answer < q.opsi.length;
      var correct = hasAnswer && answer === q.jawaban;
      var status = !hasAnswer ? 'empty' : correct ? 'correct' : 'wrong';
      counts.all += 1;
      if (status === 'wrong') counts.wrong += 1;
      if (status === 'empty') counts.empty += 1;
      list.appendChild(buildDiscussionItem(q, index, hasAnswer ? answer : null, status));
    });

    $('count-all').textContent = String(counts.all);
    $('count-wrong').textContent = String(counts.wrong);
    $('count-empty').textContent = String(counts.empty);
    applyFilter('all');
  }

  function buildDiscussionItem(q, index, answer, status) {
    var item = el('article', 'discussion-item is-' + status);
    item.dataset.status = status;

    var head = el('div', 'discussion-item-head');
    head.appendChild(el('span', 'discussion-num', 'Soal ' + (index + 1)));
    head.appendChild(el('span', 'badge badge-' + q.jenis.toLowerCase(), q.jenis));
    head.appendChild(el('span', 'badge badge-sub', q.sub));
    var label = status === 'correct' ? 'Benar' : status === 'wrong' ? 'Salah' : 'Kosong';
    head.appendChild(el('span', 'discussion-tag is-' + status, label));
    item.appendChild(head);

    item.appendChild(el('p', 'discussion-question', q.soal));

    var answerRow = el('div', 'answer-line');
    answerRow.appendChild(el('span', 'answer-label', 'Jawaban Anda'));
    answerRow.appendChild(el('p', 'answer-value' + (status === 'empty' ? ' is-empty' : ''), answer === null ? 'Tidak dijawab' : letterOf(answer) + '. ' + q.opsi[answer]));
    item.appendChild(answerRow);

    var keyRow = el('div', 'answer-line is-key');
    keyRow.appendChild(el('span', 'answer-label', 'Kunci'));
    keyRow.appendChild(el('p', 'answer-value', letterOf(q.jawaban) + '. ' + q.opsi[q.jawaban]));
    item.appendChild(keyRow);

    var explanation = el('div', 'explanation');
    explanation.appendChild(el('strong', null, 'Pembahasan'));
    explanation.appendChild(el('p', null, q.pembahasan));
    item.appendChild(explanation);

    item.appendChild(el('p', 'source-line', 'Sumber: ' + q.sumber));
    return item;
  }

  function applyFilter(filter) {
    currentFilter = filter;
    var items = $('discussion-list').children;
    var visible = 0;
    for (var i = 0; i < items.length; i++) {
      var show = filter === 'all' || items[i].dataset.status === filter;
      items[i].hidden = !show;
      if (show) visible += 1;
    }
    $('discussion-empty').hidden = visible !== 0;
    var buttons = $('filter-buttons').querySelectorAll('.filter-btn');
    for (var j = 0; j < buttons.length; j++) {
      var active = buttons[j].dataset.filter === filter;
      buttons[j].classList.toggle('is-active', active);
      buttons[j].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  /* ---------------- riwayat ---------------- */

  function formatDateShort(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    try {
      return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (err) {
      return date.toISOString().slice(0, 10);
    }
  }

  function formatDateTime(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    try {
      return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) +
        ', ' + date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch (err) {
      return date.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function renderHistory() {
    var history = loadHistory();
    var table = $('history-table');
    var body = $('history-body');
    var empty = $('history-empty');
    var clear = $('btn-clear-history');
    body.textContent = '';

    if (!history.length) {
      table.hidden = true;
      empty.hidden = false;
      clear.disabled = true;
      return;
    }

    table.hidden = false;
    empty.hidden = true;
    clear.disabled = false;

    history.forEach(function (item) {
      var tr = document.createElement('tr');
      addHistoryCell(tr, 'Tanggal', formatDateShort(item.tanggal), item.tanggal);
      addHistoryCell(tr, 'Nama', item.nama, '');
      addHistoryCell(tr, 'Paket', item.paket || '—', '');
      addHistoryCell(tr, 'TWK', String(item.TWK), '');
      addHistoryCell(tr, 'TPU', String(item.TPU), '');
      addHistoryCell(tr, 'TSI', String(item.TSI), '');
      addHistoryCell(tr, 'Total', String(item.total), '');
      var statusCell = document.createElement('td');
      statusCell.dataset.label = 'Hasil';
      statusCell.appendChild(el('span', 'badge-result ' + (item.lulus ? 'is-pass' : 'is-fail'), item.lulus ? 'LULUS' : 'TIDAK LULUS'));
      if (item.alasan === 'timeout') statusCell.appendChild(el('span', 'history-note', 'waktu habis'));
      tr.appendChild(statusCell);
      body.appendChild(tr);
    });
  }

  function addHistoryCell(tr, label, text, title) {
    var cell = document.createElement('td');
    cell.dataset.label = label;
    cell.textContent = text;
    if (title) cell.title = formatDateTime(title);
    tr.appendChild(cell);
  }

  /* ---------------- modal ---------------- */

  function openModal(id) {
    var modal = $(id);
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    openModals.push(modal);
    document.body.classList.add('modal-open');
    var target = modal.querySelector('[data-autofocus]') || modal.querySelector('button, [href], input, select, textarea');
    if (target) {
      try {
        target.focus();
      } catch (err) {
        /* abaikan */
      }
    }
  }

  function closeModal(id) {
    var modal = $(id);
    if (!modal) return;
    modal.hidden = true;
    openModals = openModals.filter(function (item) { return item !== modal; });
    if (!openModals.length) document.body.classList.remove('modal-open');
    if (lastFocused && document.contains(lastFocused)) {
      try {
        lastFocused.focus();
      } catch (err) {
        /* abaikan */
      }
    }
  }

  function askConfirm(title, message, okLabel, onOk) {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('btn-confirm-ok').textContent = okLabel || 'Ya';
    confirmAction = onOk;
    openModal('modal-confirm');
  }

  function handleConfirmOk() {
    var action = confirmAction;
    confirmAction = null;
    closeModal('modal-confirm');
    if (action) action();
  }

  function handleConfirmCancel() {
    confirmAction = null;
    closeModal('modal-confirm');
  }

  function trapFocus(event) {
    if (!openModals.length) return;
    var modal = openModals[openModals.length - 1];
    var focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------------- keyboard ---------------- */

  function handleKeydown(event) {
    if (openModals.length) {
      if (event.key === 'Escape') {
        event.preventDefault();
        var modal = openModals[openModals.length - 1];
        if (modal.id === 'modal-confirm') confirmAction = null;
        if (modal.id === 'modal-rules') pendingStart = null;
        closeModal(modal.id);
        return;
      }
      if (event.key === 'Tab') trapFocus(event);
      return;
    }

    if (!$('screen-exam').hidden && $('exam-nav').classList.contains('is-open') && event.key === 'Escape') {
      event.preventDefault();
      closeNav(true);
      return;
    }

    if ($('screen-exam').hidden || !session || session.finishedAt) return;
    var target = event.target;
    var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;

    var key = event.key;
    if (/^[1-5]$/.test(key)) {
      event.preventDefault();
      selectOption(Number(key) - 1);
      return;
    }
    if (/^[a-eA-E]$/.test(key)) {
      event.preventDefault();
      selectOption(key.toUpperCase().charCodeAt(0) - 65);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      prevQuestion();
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      nextQuestion();
      return;
    }
    if (key === 'r' || key === 'R') {
      event.preventDefault();
      toggleMark();
    }
  }

  /* ---------------- peristiwa ---------------- */

  function bindEvents() {
    $('input-name').addEventListener('input', function () {
      nameTouched = true;
      updateNameValidation(nameTouched);
    });
    $('input-name').addEventListener('blur', function () {
      nameTouched = true;
      updateNameValidation(true);
    });
    $('form-start').addEventListener('submit', requestStart);

    $('btn-resume').addEventListener('click', resumeExam);
    $('btn-discard').addEventListener('click', discardSession);

    $('btn-rules-cancel').addEventListener('click', function () {
      pendingStart = null;
      closeModal('modal-rules');
    });
    $('btn-rules-agree').addEventListener('click', function () {
      var config = pendingStart;
      pendingStart = null;
      closeModal('modal-rules');
      if (!config) return;
      if (session && !session.finishedAt) {
        askConfirm(
          'Sesi lama belum selesai',
          'Memulai ujian baru akan menghapus sesi yang sedang berjalan. Lanjutkan?',
          'Mulai Ujian Baru',
          function () { startExam(config); }
        );
      } else {
        startExam(config);
      }
    });

    $('btn-prev').addEventListener('click', prevQuestion);
    $('btn-next').addEventListener('click', nextQuestion);
    $('btn-mark').addEventListener('click', toggleMark);
    $('btn-finish').addEventListener('click', requestFinish);
    $('btn-nav-toggle').addEventListener('click', toggleNav);
    $('btn-nav-close').addEventListener('click', function () { closeNav(true); });
    $('btn-reload-tab').addEventListener('click', function () { window.location.reload(); });

    $('btn-print').addEventListener('click', function () { window.print(); });
    $('btn-repeat').addEventListener('click', function () {
      if (!session) return;
      setPaketRadios(session.paket);
      $('input-name').value = session.nama;
      updateNameValidation(false);
      pendingStart = { nama: session.nama, paket: session.paket };
      openModal('modal-rules');
    });
    $('btn-change').addEventListener('click', function () {
      if (session) {
        setPaketRadios(session.paket);
        $('input-name').value = session.nama;
      }
      showScreen('home');
      nameTouched = false;
      updateNameValidation(false);
      $('input-name').focus();
    });

    $('btn-clear-history').addEventListener('click', function () {
      askConfirm(
        'Hapus riwayat?',
        'Seluruh riwayat latihan pada perangkat ini akan dihapus. Tindakan ini tidak dapat dibatalkan.',
        'Hapus Riwayat',
        function () {
          removeRaw(KEYS.history);
          renderHistory();
        }
      );
    });

    $('filter-buttons').addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.filter-btn') : null;
      if (!button) return;
      applyFilter(button.dataset.filter || 'all');
    });

    $('btn-confirm-cancel').addEventListener('click', handleConfirmCancel);
    $('btn-confirm-ok').addEventListener('click', handleConfirmOk);

    var closers = document.querySelectorAll('[data-close]');
    for (var i = 0; i < closers.length; i++) {
      closers[i].addEventListener('click', function () {
        var id = this.getAttribute('data-close');
        if (id === 'modal-rules') pendingStart = null;
        if (id === 'modal-confirm') confirmAction = null;
        closeModal(id);
      });
    }

    document.addEventListener('keydown', handleKeydown);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && session && !session.finishedAt && !$('screen-exam').hidden) {
        tickTimer();
      }
    });

    window.addEventListener('storage', function (event) {
      if (event.key !== KEYS.session) return;
      if (!session || session.finishedAt) return;
      if ($('screen-exam').hidden) return;
      var other = parseJSON(event.newValue, null);
      if (other && other.tabId && other.tabId !== TAB_ID) {
        $('multitab-banner').hidden = false;
      }
    });

    window.addEventListener('beforeunload', function (event) {
      if (session && !session.finishedAt && !$('screen-exam').hidden) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
      return undefined;
    });

    var noticeClose = document.querySelector('#storage-notice .notice-close');
    if (noticeClose) {
      noticeClose.addEventListener('click', function () {
        $('storage-notice').hidden = true;
      });
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeNav(false);
      renderResume();
    });
  }

  /* ---------------- inisialisasi ---------------- */

  function init() {
    if (!Engine) {
      showBankError('Mesin ujian (engine.js) tidak dapat dimuat. Periksa berkas assets/js/engine.js.');
      return;
    }

    bindEvents();
    session = loadSession();

    var lastName = readRaw(KEYS.lastName);
    if (lastName && !$('input-name').value) {
      $('input-name').value = lastName;
    }

    renderHistory();
    updateNameValidation(false);

    if (session && !session.finishedAt && Date.now() >= session.deadline) {
      finalizeSession('timeout');
      return;
    }

    showScreen('home');
    renderResume();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
