# Simulasi CAT Ujian Dinas Tingkat I

Aplikasi latihan mandiri berbentuk Computer Assisted Test untuk Ujian Dinas Tingkat I. Satu halaman statis: **100 soal, 90 menit, dua paket setara**, penilaian sesuai ambang batas resmi, dan pembahasan lengkap setelah ujian.

> Situs latihan tidak resmi. Bukan produk BKN atau Kemenimipas dan tidak menggantikan CAT resmi.

## Menjalankan

Tidak ada build step. Buka `index.html` langsung dari disk, atau jalankan server statis sederhana:

```bash
python -m http.server 8080
# lalu buka http://localhost:8080
```

Aplikasi tetap berfungsi saat dibuka lewat `file://` karena seluruh skrip berupa script klasik dan tidak ada aset eksternal.

## Fitur

- **Beranda:** ringkasan aturan, validasi nama, pilihan Paket A/B, tawaran melanjutkan sesi, dan riwayat 10 percobaan terakhir.
- **Ujian:** 100 soal dengan komposisi TWK 40, TPU 40, TSI 20; timer 90 menit berbasis tenggat absolut; navigasi 1–100; penanda ragu-ragu; pengumpulan otomatis saat waktu habis; pintasan keyboard.
- **Hasil:** status LULUS/TIDAK LULUS, skor tiap jenis tes, rincian per sub-materi, dan pembahasan 100 soal dengan filter Semua/Salah/Kosong.
- **Ketahanan:** progres tersimpan di `localStorage`; bila penyimpanan diblokir, aplikasi berjalan dengan penyimpanan memori dan menampilkan pemberitahuan.
- **Responsif:** satu kolom pada ponsel dengan panel nomor soal yang dapat dibuka-tutup.

## Struktur

```text
.
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── engine.js         # hash, PRNG, sampling, penilaian (murni)
│       ├── data-paket-a.js   # 151 soal Paket A
│       ├── data-paket-b.js   # 151 soal Paket B
│       └── app.js            # state, render, timer, penyimpanan
├── tools/validate-bank.mjs
├── netlify.toml
└── README.md
```

## Validasi

```bash
node tools/validate-bank.mjs
```

Pemeriksaan mencakup jumlah dan distribusi soal, kelengkapan field, keunikan id/teks, validitas kunci, komposisi ujian 40/40/20, determinisme per nama, dan seluruh skenario penilaian pada PRD §6.3. Keluaran akhir harus `GAGAL: 0 pemeriksaan`.

## Mengubah soal

Cukup sunting `assets/js/data-paket-a.js` atau `data-paket-b.js`. Setiap soal memakai bentuk:

```js
{
  id: "A-TWK-PAN-001",
  soal: "Pertanyaan ...",
  opsi: ["A", "B", "C", "D", "E"],
  jawaban: 0,
  pembahasan: "Penjelasan singkat.",
  sumber: "PPT UDIN & UPKP - IMIPAS hlm. 21"
}
```

Aturan: id unik, tepat lima opsi, `jawaban` adalah indeks 0–4 pada opsi asli, serta `pembahasan` dan `sumber` wajib diisi. Nama sub-materi harus sama persis dengan blueprint. Setelah mengubah data, jalankan validator.

## Deploy ke Netlify

1. Seret-lepas folder proyek ke [Netlify Drop](https://app.netlify.com/drop), atau
2. Hubungkan repositori Git dan gunakan **publish directory** `.` tanpa build command.

`netlify.toml` sudah menetapkan publish `.` dan header keamanan dasar. Tidak ada fungsi serverless, environment variable, atau redirect.

## Uji cepat timer

Tambahkan parameter `?detik=10` pada URL untuk memakai durasi 10 detik saat menguji pengumpulan otomatis. Tanpa parameter, durasi tetap 90 menit.

## Catatan konten

Bank soal disusun dari kisi-kisi Ujian Dinas Tingkat I (PPT UDIN & UPKP) serta Permen Imipas No. 1 Tahun 2024 untuk materi SOTK. Materi Ujian Dinas Tingkat II dan UPKP tidak dimasukkan. Setiap soal mencantumkan sumbernya pada halaman hasil.
