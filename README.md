# AkademikAP — Portal Akademik Administrasi Perkantoran PNUP

Portal sistem akademik untuk mengelola data Mahasiswa, Dosen, Staf, Mata
Kuliah, dan Nilai — dengan perhitungan IPS per semester dan IPK kumulatif
otomatis.

## Struktur File

```
akademikap/
├── index.html          → Halaman utama web (untuk GitHub Pages / hosting)
├── css/style.css        → Semua styling tampilan
├── js/app.js            → Logika aplikasi (routing, CRUD, kalkulasi)
├── data/config.js       → Konfigurasi URL Apps Script (WAJIB diisi)
└── apps-script.js       → Backend untuk Google Apps Script (BUKAN untuk
                            di-upload ke GitHub — paste ke Apps Script Editor)
```

## Langkah Instalasi

Panduan lengkap langkah demi langkah (mulai dari nol) ada di dokumen Word
terpisah: **Panduan Instalasi AkademikAP.docx**

Ringkasan singkat:
1. Buat Google Sheets baru
2. Buka Extensions → Apps Script, paste isi `apps-script.js`
3. Deploy sebagai Web App, copy URL-nya
4. Isi URL tersebut ke `data/config.js` pada baris `APPS_SCRIPT_URL`
5. Upload seluruh folder ini (kecuali `apps-script.js`) ke GitHub Pages

## Fitur Utama

- CRUD penuh untuk Mahasiswa, Dosen, Staf, dan Mata Kuliah langsung dari web
- Input nilai per komponen (Tugas 20%, Praktik 50%, UTS 25%, UAS 35%, Absen 5%)
- Kalkulasi otomatis: skor mentah → normalisasi → nilai huruf → bobot IP
- IPS otomatis per semester, IPK kumulatif yang terus diperbarui
- Status kelulusan dan predikat akademik otomatis
- Dashboard ringkasan dan rapor/KHS per mahasiswa
- Mode gelap (Navy Slate) dan terang (Emerald Paper)
- Tampilan responsif untuk HP dan tablet
