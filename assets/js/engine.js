/*
 * engine.js — logika murni Simulasi CAT Ujian Dinas Tingkat I.
 * Tidak menyentuh DOM. Dapat dijalankan di browser (window.Engine)
 * maupun Node (module.exports) untuk pengujian.
 */
(function () {
  'use strict';

  var SEED_PREFIX = 'catudin-v1';
  var DURATION_SECONDS = 90 * 60;
  var WEIGHT = 5;

  var BLUEPRINT = [
    { jenis: 'TWK', sub: 'Pancasila', ambil: 10 },
    { jenis: 'TWK', sub: 'UUD 1945', ambil: 10 },
    { jenis: 'TWK', sub: 'Sejarah Indonesia', ambil: 10 },
    { jenis: 'TWK', sub: 'Bahasa Indonesia', ambil: 10 },
    { jenis: 'TPU', sub: 'Sistem Perencanaan Pembangunan Nasional', ambil: 5 },
    { jenis: 'TPU', sub: 'Peraturan Kepegawaian', ambil: 10 },
    { jenis: 'TPU', sub: 'Pelayanan Publik', ambil: 10 },
    { jenis: 'TPU', sub: 'Perkantoran', ambil: 10 },
    { jenis: 'TPU', sub: 'Literasi Digital', ambil: 5 },
    { jenis: 'TSI', sub: 'Renstra Instansi / Sistem Perencanaan Pembangunan Daerah', ambil: 10 },
    { jenis: 'TSI', sub: 'SOTK', ambil: 10 }
  ];

  var JENIS = {
    TWK: { kode: 'TWK', label: 'Tes Wawasan Kebangsaan', ambang: 100, maks: 200 },
    TPU: { kode: 'TPU', label: 'Tes Pengetahuan Umum', ambang: 75, maks: 200 },
    TSI: { kode: 'TSI', label: 'Tes Substansi Instansi', ambang: 35, maks: 100 }
  };

  var RULES = {
    durasiDetik: DURATION_SECONDS,
    bobot: WEIGHT,
    totalSoal: 100,
    totalMaks: 500,
    ambang: { TWK: 100, TPU: 75, TSI: 35 }
  };

  function fnv1a(str) {
    var h = 0x811c9dc5;
    var text = String(str);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeName(nama) {
    return String(nama == null ? '' : nama)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  /* Fisher-Yates sebagian: menghasilkan n elemen acak tanpa pengulangan. */
  function pick(pool, n, rng) {
    if (!Array.isArray(pool)) throw new Error('Kumpulan soal tidak valid.');
    if (n > pool.length) {
      throw new Error('Soal yang diminta (' + n + ') melebihi jumlah tersedia (' + pool.length + ').');
    }
    var a = pool.slice();
    var out = [];
    for (var i = 0; i < n; i++) {
      var j = i + Math.floor(rng() * (a.length - i));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
      out.push(a[i]);
    }
    return out;
  }

  function validateQuestion(q) {
    if (!q || typeof q !== 'object') return 'data soal bukan objek';
    if (typeof q.id !== 'string' || !q.id.trim()) return 'id kosong';
    if (typeof q.soal !== 'string' || !q.soal.trim()) return 'teks soal kosong';
    if (!Array.isArray(q.opsi) || q.opsi.length !== 5) return 'opsi harus tepat 5';
    for (var i = 0; i < q.opsi.length; i++) {
      if (typeof q.opsi[i] !== 'string' || !q.opsi[i].trim()) return 'opsi ' + (i + 1) + ' kosong';
    }
    if (new Set(q.opsi.map(function (o) { return o.trim(); })).size !== 5) return 'opsi duplikat';
    if (!Number.isInteger(q.jawaban) || q.jawaban < 0 || q.jawaban > 4) return 'indeks jawaban tidak sah';
    if (typeof q.pembahasan !== 'string' || !q.pembahasan.trim()) return 'pembahasan kosong';
    if (typeof q.sumber !== 'string' || !q.sumber.trim()) return 'sumber kosong';
    return null;
  }

  function buildExam(nama, paket, bank) {
    var paketKey = String(paket == null ? 'A' : paket).trim().toUpperCase();
    if (paketKey !== 'A' && paketKey !== 'B') {
      throw new Error('Paket ujian harus A atau B.');
    }
    if (!bank || typeof bank !== 'object') {
      throw new Error('Bank soal Paket ' + paketKey + ' tidak tersedia. Periksa berkas data soal.');
    }
    var normalized = normalizeName(nama);
    if (!normalized) throw new Error('Nama peserta wajib diisi.');

    var seed = fnv1a(SEED_PREFIX + '|' + normalized + '|' + paketKey);
    var rng = mulberry32(seed);
    var questions = [];

    for (var b = 0; b < BLUEPRINT.length; b++) {
      var row = BLUEPRINT[b];
      var group = bank[row.jenis] && bank[row.jenis][row.sub];
      if (!Array.isArray(group)) {
        throw new Error(
          'Bank soal Paket ' + paketKey + ' tidak lengkap: sub-materi "' + row.sub + '" tidak ditemukan.'
        );
      }
      if (group.length < row.ambil) {
        throw new Error(
          'Bank soal Paket ' + paketKey + ' tidak lengkap: "' + row.sub + '" membutuhkan ' +
          row.ambil + ' soal, tersedia ' + group.length + '.'
        );
      }

      var selected = pick(group, row.ambil, rng);
      for (var s = 0; s < selected.length; s++) {
        var q = selected[s];
        var problem = validateQuestion(q);
        if (problem) {
          throw new Error('Soal ' + (q && q.id ? q.id : '(tanpa id)') + ' tidak valid: ' + problem + '.');
        }
        var order = shuffle([0, 1, 2, 3, 4], rng);
        var opsi = [];
        for (var o = 0; o < order.length; o++) opsi.push(q.opsi[order[o]]);
        questions.push({
          id: q.id,
          jenis: row.jenis,
          sub: row.sub,
          soal: q.soal,
          opsi: opsi,
          jawaban: order.indexOf(q.jawaban),
          pembahasan: q.pembahasan,
          sumber: q.sumber
        });
      }
    }

    return {
      nama: String(nama).replace(/\s+/g, ' ').trim(),
      paket: paketKey,
      seed: seed,
      normalizedName: normalized,
      questions: questions
    };
  }

  function scoreExam(exam, jawaban) {
    var questions = Array.isArray(exam) ? exam : exam && Array.isArray(exam.questions) ? exam.questions : [];
    var answers = Array.isArray(jawaban) ? jawaban : [];
    var jenis = {};
    var subMap = {};
    var kode, i, q, ans, correct, key;

    Object.keys(JENIS).forEach(function (k) {
      jenis[k] = {
        kode: k,
        label: JENIS[k].label,
        benar: 0,
        total: 0,
        skor: 0,
        maks: 0,
        ambang: JENIS[k].ambang,
        lulus: false
      };
    });

    for (i = 0; i < questions.length; i++) {
      q = questions[i];
      if (!q || !jenis[q.jenis]) continue;
      jenis[q.jenis].total += 1;
      ans = answers[i];
      correct = Number.isInteger(ans) && ans === q.jawaban;
      if (correct) jenis[q.jenis].benar += 1;

      key = q.jenis + '|' + q.sub;
      if (!subMap[key]) subMap[key] = { jenis: q.jenis, sub: q.sub, benar: 0, total: 0 };
      subMap[key].total += 1;
      if (correct) subMap[key].benar += 1;
    }

    var total = 0;
    var totalMaks = 0;
    var lulus = questions.length > 0;
    Object.keys(jenis).forEach(function (k) {
      var j = jenis[k];
      j.skor = j.benar * WEIGHT;
      j.maks = j.total * WEIGHT;
      j.lulus = j.skor >= j.ambang;
      if (!j.lulus) lulus = false;
      total += j.skor;
      totalMaks += j.maks;
    });

    var terjawab = 0;
    for (i = 0; i < questions.length; i++) {
      if (Number.isInteger(answers[i])) terjawab += 1;
    }

    var perSub = Object.keys(subMap).map(function (k) { return subMap[k]; });

    return {
      jenis: jenis,
      perSub: perSub,
      total: total,
      totalMaks: totalMaks,
      lulus: lulus,
      terjawab: terjawab,
      kosong: questions.length - terjawab,
      jumlahSoal: questions.length
    };
  }

  function isLulus(skor) {
    if (!skor) return false;
    if (skor.jenis) {
      return Object.keys(JENIS).every(function (k) {
        return skor.jenis[k] && skor.jenis[k].lulus === true;
      });
    }
    return Object.keys(JENIS).every(function (k) {
      return Number(skor[k]) >= JENIS[k].ambang;
    });
  }

  function formatTime(detik) {
    var total = Math.max(0, Math.floor(Number(detik) || 0));
    var menit = Math.floor(total / 60);
    var sisa = total % 60;
    return String(menit).padStart(2, '0') + ':' + String(sisa).padStart(2, '0');
  }

  var Engine = {
    fnv1a: fnv1a,
    mulberry32: mulberry32,
    pick: pick,
    shuffle: shuffle,
    normalizeName: normalizeName,
    buildExam: buildExam,
    scoreExam: scoreExam,
    isLulus: isLulus,
    formatTime: formatTime,
    validateQuestion: validateQuestion,
    BLUEPRINT: BLUEPRINT,
    JENIS: JENIS,
    RULES: RULES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (typeof window !== 'undefined') window.Engine = Engine;
})();
