/*
 * validate-bank.mjs — pemeriksaan bank soal dan mesin ujian.
 * Jalankan: node tools/validate-bank.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
global.window = {};
const Engine = require('../assets/js/engine.js');
require('../assets/js/data-paket-a.js');
require('../assets/js/data-paket-b.js');

const BANK_A = global.window.BANK_A;
const BANK_B = global.window.BANK_B;

let passed = 0;
let failed = 0;
const failures = [];

function check(condition, label, detail) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(label + (detail ? ' — ' + detail : ''));
  }
}

function group(label) {
  console.log('\n' + label);
}

const EXPECTED = {
  TWK: {
    'Pancasila': 15,
    'UUD 1945': 15,
    'Sejarah Indonesia': 15,
    'Bahasa Indonesia': 15
  },
  TPU: {
    'Sistem Perencanaan Pembangunan Nasional': 8,
    'Peraturan Kepegawaian': 15,
    'Pelayanan Publik': 15,
    'Perkantoran': 15,
    'Literasi Digital': 8
  },
  TSI: {
    'Renstra Instansi / Sistem Perencanaan Pembangunan Daerah': 15,
    'SOTK': 15
  }
};

const EXAM_COUNTS = {
  'Pancasila': 10,
  'UUD 1945': 10,
  'Sejarah Indonesia': 10,
  'Bahasa Indonesia': 10,
  'Sistem Perencanaan Pembangunan Nasional': 5,
  'Peraturan Kepegawaian': 10,
  'Pelayanan Publik': 10,
  'Perkantoran': 10,
  'Literasi Digital': 5,
  'Renstra Instansi / Sistem Perencanaan Pembangunan Daerah': 10,
  'SOTK': 10
};

const allIds = new Set();
const allSoal = new Set();
const allQuestions = [];

function validateBank(bank, paket) {
  const label = 'Paket ' + paket;
  check(bank && typeof bank === 'object', label + ': bank tersedia');

  let total = 0;
  for (const jenis of Object.keys(EXPECTED)) {
    check(bank[jenis] && typeof bank[jenis] === 'object', label + ': grup ' + jenis + ' tersedia');
    if (!bank[jenis]) continue;
    for (const sub of Object.keys(EXPECTED[jenis])) {
      const list = bank[jenis][sub];
      const want = EXPECTED[jenis][sub];
      check(Array.isArray(list), label + ': ' + sub + ' berupa larik');
      if (!Array.isArray(list)) continue;
      check(list.length === want, label + ': jumlah ' + sub + ' = ' + want, 'aktual ' + list.length);
      total += list.length;

      for (const q of list) {
        const where = label + ' / ' + q.id;
        check(typeof q.id === 'string' && q.id.startsWith(paket + '-' + jenis + '-'), where + ': pola id');
        check(!allIds.has(q.id), where + ': id unik', 'duplikat id');
        allIds.add(q.id);

        check(typeof q.soal === 'string' && q.soal.trim().length > 0, where + ': teks soal');
        check(!allSoal.has(q.soal), where + ': teks soal unik', 'duplikat teks');
        allSoal.add(q.soal);

        check(Array.isArray(q.opsi) && q.opsi.length === 5, where + ': 5 opsi');
        if (Array.isArray(q.opsi)) {
          check(new Set(q.opsi).size === 5, where + ': opsi tidak duplikat');
          check(q.opsi.every((o) => typeof o === 'string' && o.trim().length > 0), where + ': semua opsi terisi');
        }
        check(Number.isInteger(q.jawaban) && q.jawaban >= 0 && q.jawaban <= 4, where + ': indeks jawaban 0-4');
        check(typeof q.pembahasan === 'string' && q.pembahasan.trim().length > 0, where + ': pembahasan terisi');
        check(typeof q.sumber === 'string' && q.sumber.trim().length > 0, where + ': sumber terisi');

        allQuestions.push(q);
      }
    }
  }
  check(total === 151, label + ': total 151 soal', 'aktual ' + total);
}

group('1. Struktur bank soal');
validateBank(BANK_A, 'A');
validateBank(BANK_B, 'B');
check(allQuestions.length === 302, 'Total dua paket 302 soal', 'aktual ' + allQuestions.length);

const sourceById = new Map(allQuestions.map((q) => [q.id, q]));

group('2. buildExam: komposisi dan determinisme');
const names = Array.from({ length: 20 }, (_, i) => 'Peserta Uji ' + String(i + 1).padStart(2, '0'));
const sequences = new Set();
const signatures = new Set();

for (const paket of ['A', 'B']) {
  const bank = paket === 'A' ? BANK_A : BANK_B;
  const localSequences = new Set();

  for (const name of names) {
    let exam;
    try {
      exam = Engine.buildExam(name, paket, bank);
    } catch (err) {
      check(false, 'Paket ' + paket + ' / ' + name + ': buildExam berhasil', err.message);
      continue;
    }

    check(exam.questions.length === 100, 'Paket ' + paket + ' / ' + name + ': 100 soal', 'aktual ' + exam.questions.length);
    const counts = { TWK: 0, TPU: 0, TSI: 0 };
    const subCounts = {};
    const ids = new Set();
    let orderOk = true;
    let keysOk = true;
    let optionsOk = true;

    exam.questions.forEach((q, index) => {
      counts[q.jenis] += 1;
      subCounts[q.sub] = (subCounts[q.sub] || 0) + 1;
      if (!ids.has(q.id)) ids.add(q.id);
      else keysOk = false;

      if (q.jenis === 'TWK' && (index < 0 || index > 39)) orderOk = false;
      if (q.jenis === 'TPU' && (index < 40 || index > 79)) orderOk = false;
      if (q.jenis === 'TSI' && (index < 80 || index > 99)) orderOk = false;

      const src = sourceById.get(q.id);
      if (!src) {
        keysOk = false;
        return;
      }
      if (src.opsi[src.jawaban] !== q.opsi[q.jawaban]) keysOk = false;
      const sortedNew = q.opsi.slice().sort();
      const sortedSrc = src.opsi.slice().sort();
      if (JSON.stringify(sortedNew) !== JSON.stringify(sortedSrc)) optionsOk = false;
    });

    check(counts.TWK === 40 && counts.TPU === 40 && counts.TSI === 20, 'Paket ' + paket + ' / ' + name + ': komposisi 40/40/20', JSON.stringify(counts));
    check(orderOk, 'Paket ' + paket + ' / ' + name + ': blok TWK 1-40, TPU 41-80, TSI 81-100');
    check(ids.size === 100, 'Paket ' + paket + ' / ' + name + ': 100 soal unik', 'aktual ' + ids.size);
    check(keysOk, 'Paket ' + paket + ' / ' + name + ': kunci terjaga setelah opsi diacak');
    check(optionsOk, 'Paket ' + paket + ' / ' + name + ': opsi tetap permutasi dari bank');

    for (const sub of Object.keys(EXAM_COUNTS)) {
      check(
        (subCounts[sub] || 0) === EXAM_COUNTS[sub],
        'Paket ' + paket + ' / ' + name + ': ' + sub + ' = ' + EXAM_COUNTS[sub],
        'aktual ' + (subCounts[sub] || 0)
      );
    }

    const sequence = exam.questions.map((q) => q.id + ':' + q.opsi.join('|')).join(';');
    localSequences.add(sequence);
    signatures.add(sequence);
  }

  check(localSequences.size === 20, 'Paket ' + paket + ': 20 nama menghasilkan 20 set berbeda', 'aktual ' + localSequences.size);

  const a = Engine.buildExam('Budi Santoso', paket, bank);
  const b = Engine.buildExam('  budi   santoso  ', paket, bank);
  check(
    JSON.stringify(a.questions) === JSON.stringify(b.questions),
    'Paket ' + paket + ': nama sama (beda spasi/kapital) menghasilkan set identik'
  );

  const p1 = Engine.buildExam('Nama Pertama', paket, bank);
  const p2 = Engine.buildExam('Nama Kedua', paket, bank);
  check(JSON.stringify(p1.questions) !== JSON.stringify(p2.questions), 'Paket ' + paket + ': nama berbeda menghasilkan set berbeda');
}

check(signatures.size === 40, '20 nama x 2 paket menghasilkan 40 set unik', 'aktual ' + signatures.size);
check(
  JSON.stringify(Engine.buildExam('Sama', 'A', BANK_A).questions.map((q) => q.id)) !==
    JSON.stringify(Engine.buildExam('Sama', 'B', BANK_B).questions.map((q) => q.id)),
  'Paket A dan B menghasilkan set berbeda untuk nama sama'
);

group('3. Penilaian dan kelulusan');
const scoringExam = Engine.buildExam('Peserta Skor', 'A', BANK_A);

function answersFor(exam, target) {
  const answers = new Array(exam.questions.length).fill(null);
  const used = { TWK: 0, TPU: 0, TSI: 0 };
  exam.questions.forEach((q, i) => {
    if (used[q.jenis] < (target[q.jenis] || 0)) {
      answers[i] = q.jawaban;
      used[q.jenis] += 1;
    }
  });
  return answers;
}

function assertScore(label, target, expected) {
  const score = Engine.scoreExam(scoringExam, answersFor(scoringExam, target));
  check(score.jenis.TWK.skor === expected.TWK, label + ': TWK = ' + expected.TWK, 'aktual ' + score.jenis.TWK.skor);
  check(score.jenis.TPU.skor === expected.TPU, label + ': TPU = ' + expected.TPU, 'aktual ' + score.jenis.TPU.skor);
  check(score.jenis.TSI.skor === expected.TSI, label + ': TSI = ' + expected.TSI, 'aktual ' + score.jenis.TSI.skor);
  check(score.total === expected.total, label + ': total = ' + expected.total, 'aktual ' + score.total);
  check(score.lulus === expected.lulus, label + ': status ' + (expected.lulus ? 'LULUS' : 'TIDAK LULUS'));
  check(Engine.isLulus(score) === expected.lulus, label + ': isLulus konsisten');
}

assertScore('Semua benar', { TWK: 40, TPU: 40, TSI: 20 }, { TWK: 200, TPU: 200, TSI: 100, total: 500, lulus: true });
assertScore('Lulus tipis', { TWK: 20, TPU: 15, TSI: 7 }, { TWK: 100, TPU: 75, TSI: 35, total: 210, lulus: true });
assertScore('TWK kurang 1 soal', { TWK: 19, TPU: 40, TSI: 20 }, { TWK: 95, TPU: 200, TSI: 100, total: 395, lulus: false });
assertScore('Tanpa jawaban', { TWK: 0, TPU: 0, TSI: 0 }, { TWK: 0, TPU: 0, TSI: 0, total: 0, lulus: false });

const emptyScore = Engine.scoreExam(scoringExam, new Array(100).fill(null));
check(emptyScore.kosong === 100, 'Tanpa jawaban: 100 soal kosong', 'aktual ' + emptyScore.kosong);
check(emptyScore.terjawab === 0, 'Tanpa jawaban: 0 terjawab', 'aktual ' + emptyScore.terjawab);

group('4. Utilitas');
check(Engine.formatTime(5400) === '90:00', 'formatTime(5400) = 90:00', Engine.formatTime(5400));
check(Engine.formatTime(0) === '00:00', 'formatTime(0) = 00:00', Engine.formatTime(0));
check(Engine.formatTime(65) === '01:05', 'formatTime(65) = 01:05', Engine.formatTime(65));
check(Engine.normalizeName('  Budi   Santoso ').toLowerCase() === 'budi santoso', 'normalizeName merapatkan spasi');
check(Engine.fnv1a('abc') === 440920331, 'fnv1a konsisten', String(Engine.fnv1a('abc')));

console.log('\n' + '='.repeat(56));
console.log('LULUS: ' + passed + ' pemeriksaan');
if (failed) {
  console.log('GAGAL: ' + failed + ' pemeriksaan');
  failures.forEach((f) => console.log('  - ' + f));
  process.exitCode = 1;
} else {
  console.log('GAGAL: 0 pemeriksaan');
  console.log('Seluruh pemeriksaan bank soal dan mesin ujian lolos.');
}
