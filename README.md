# SAQ LAB — versi Astro

Portal Laboratorium SAQ ITPLN: upload tugas, Tugas Masuk (admin), materi, kontrak tempat duduk, quiz, dan timer.
Pengganti versi PHP lama (folder `saq/`). Stack: **Astro 7 (SSR, adapter Node) + Tailwind 4 + Alpine.js + SQLite bawaan Node.js**.

---

## 1. Syarat

- **Node.js 24 LTS** (minimal 22.23.4) — cek dengan `node -v`. Download: https://nodejs.org
  Database memakai `node:sqlite` bawaan Node, jadi **tidak perlu** Visual Studio/build tools atau MySQL.
- Laragon/XAMPP hanya dipakai bila ingin mahasiswa tetap membuka `http://192.168.2.50/` (lihat langkah 4).

## 2. Install & jalankan pertama kali (di PC server)

```bat
cd E:\Code\saq\saq-astro
npm install
npm run build
npm run start
```

Server berjalan di `http://0.0.0.0:4321`. Dari PC lain buka `http://<IP-server>:4321`.
Atau cukup klik dua kali **`start-saq.bat`** (otomatis build kalau belum).

> Windows Firewall akan bertanya saat pertama kali — pilih **Allow** untuk jaringan *Private*.

### Pindahkan data dari versi PHP

Buka **Menu Asisten → Pengaturan → Impor Data Versi PHP**, isi path folder PHP lama
(mis. `C:\laragon\www\saq` atau `E:\Code\saq\saq`), klik **Mulai Impor**.
Yang disalin: dosen, mata kuliah, materi (+file), kelas & kursi kontrak, laporan kerusakan, quiz + jawaban,
dan semua folder tugas di `uploads/`. File lama tidak diubah. Aman diulang (tidak dobel).

## 3. Jalan otomatis saat PC server menyala

Pilih salah satu:

- **Paling mudah:** `Win + R` → `shell:startup` → taruh *shortcut* ke `start-saq.bat` di folder itu.
- **Tanpa jendela terbuka (PM2):**
  ```bat
  npm install -g pm2 pm2-windows-startup
  pm2-startup install
  pm2 start scripts/start.mjs --name saq
  pm2 save
  ```

## 4. (Opsional) Lewat Apache Laragon/XAMPP di port 80

Supaya mahasiswa cukup membuka `http://192.168.2.50/`:

1. Aktifkan modul di `httpd.conf` (Laragon: *Menu → Apache → httpd.conf*), hapus `#` di depan:
   ```apache
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   ```
2. Buat file virtual host (Laragon: `C:\laragon\etc\apache2\sites-enabled\00-saq.conf`,
   XAMPP: tambahkan ke `apache\conf\extra\httpd-vhosts.conf`):
   ```apache
   <VirtualHost *:80>
       ServerName 192.168.2.50
       ServerAlias localhost saq.test
       ProxyPreserveHost On
       ProxyPass        / http://127.0.0.1:4321/
       ProxyPassReverse / http://127.0.0.1:4321/
       LimitRequestBody 209715200
   </VirtualHost>
   ```
3. Restart Apache.

Aplikasi otomatis membaca IP asli mahasiswa dari header `X-Forwarded-For` (hanya dipercaya bila datang dari Apache di PC yang sama), jadi deteksi PC, kontrak tempat duduk, dan indikasi kecurangan tetap akurat.

> Jika ingin versi PHP tetap bisa dibuka sebagai cadangan, pindahkan ke port lain atau akses lewat `http://192.168.2.50:8080/saq`.

## 5. Jadwal semester (pusat data)

Semua dropdown kelas — upload tugas, quiz, kontrak tempat duduk, upload materi — diambil dari **Panel Asisten → Jadwal Semester**.

- **Semester baru:** klik *Semester baru* (bisa menyalin jadwal semester sebelumnya), atau *Import Excel* dengan format file "Jadwal Ngawas Lab SAQ" (kolom HARI, JAM, MATA KULIAH, DOSEN, KELAS, SKS, PJ, 1, 2, 3). Tombol *Template* mengunduh contoh file.
- **Semester aktif** hanya satu. Mengganti semester aktif otomatis mengganti semua dropdown; data semester lama tetap tersimpan.
- Mata kuliah berlabel `(SI)` → jurusan SI. Tanpa label → mengikuti mata kuliah yang sudah ada (contoh: KSI = SI), kalau baru → TI.
- **Kelas default** = kelas yang sedang berjalan (jam mulai s/d SKS × 50 menit + 30 menit). Di luar jam itu dipilih kelas terdekat hari ini.
- **Kelas pengganti / pindah jam:** catat di bagian bawah halaman Jadwal; pada tanggal itu kelas tersebut jadi default.
- **Kelas tambahan manual** (di luar jadwal): *Tugas, Deadline & Mahasiswa → Kelas tambahan*.
- Asisten **PJ** dari jadwal otomatis terisi saat membuka sesi Kontrak.

### Melihat database lewat SQL

*Panel Asisten → Struktur Database* menampilkan semua tabel dan menjalankan query SELECT (baca saja).
File `data/saq.db` juga bisa dibuka di **DB Browser for SQLite**. View yang paling mudah dibaca:

| View | Isi |
|---|---|
| `v_jadwal` | semester, hari, jam, mata kuliah, jurusan, dosen, kelas, SKS, asisten PJ & 1–3 |
| `v_pengumpulan` | tugas masuk + kelas, mata kuliah, dosen, tugas/pertemuan |
| `v_kontrak` | kursi kontrak per kelas |

Relasi utama: `semester` → `jadwal` (→ `matkul`, `dosen`) → `jadwal_asisten` (→ `asisten`).
`kelas_tugas`, `kontrak_kelas`, `materi_grup` punya kolom `jadwal_id`; `quiz.kelas_akses` berisi daftar `jadwal_id` yang boleh mengerjakan.

## 6. Akses admin

Panel Asisten (`/admin/*`, tampilan sidebar terpisah dari halaman mahasiswa) hanya terbuka dari IP di **Pengaturan → IP PC Admin & Asisten**
(default `192.168.2.50`, `192.168.2.51`, dan localhost). Jika terkunci, jalankan server dengan:

```bat
set SAQ_ADMIN_IPS=192.168.2.77
npm run start
```

## 7. Data & backup

Semua data ada di folder **`data/`**:

| Isi | Keterangan |
|---|---|
| `data/saq.db` | database SQLite (dosen, matkul, kontrak, quiz, catatan tugas) |
| `data/uploads/` | file tugas mahasiswa per kelas |
| `data/materi/` | file materi praktikum |

Backup = salin folder `data/` (sebaiknya saat server dimatikan). Lokasi bisa dipindah dengan env `SAQ_DATA_DIR`.

## 8. Update kode

Setelah mengubah kode / `git pull`: jalankan **`update-saq.bat`** (npm install + build), lalu restart server.
Untuk pengembangan: `npm run dev` (auto-reload di `http://localhost:4321`).

---

## Peta halaman

| URL | Untuk | Isi |
|---|---|---|
| `/` | Mahasiswa | Upload tugas (NIM & nama terpisah, pilih kelas + tugas/pertemuan, kode bukti) |
| `/materi` | Mahasiswa | Download materi (yang dikunci tidak bisa diunduh) |
| `/kontrak` | Mahasiswa | Denah kursi, boarding pass PDF, lapor PC rusak |
| `/quiz` | Mahasiswa | Daftar & pengerjaan quiz |
| `/admin` | Asisten | Dashboard (jadwal hari ini, kelas yang sedang berjalan) |
| `/admin/jadwal` | Asisten | Jadwal semester, import/export Excel, kelas pengganti |
| `/admin/asisten` | Asisten | Daftar asisten & tugas ngawas per semester |
| `/admin/database` | Asisten | Struktur database + query SQL baca-saja |
| `/admin/tugas` | Asisten | **Tugas Masuk** — default hari ini, 20 per halaman, dropdown kelas + cari, pratinjau, ZIP, Excel, belum kumpul, indikasi, arsip |
| `/admin/tugas/kelas` | Asisten | Tugas + deadline per kelas, kelas tambahan manual, daftar mahasiswa (otomatis dari Kontrak / Excel / teks) |
| `/admin/materi` | Asisten | Upload & kunci materi |
| `/admin/kontrak` | Asisten | Sesi kontrak, kursi, pindah/isi manual, laporan kerusakan, PDF & Excel |
| `/admin/quiz` | Asisten | Builder, hasil & leaderboard quiz |
| `/admin/dosen`, `/admin/matkul` | Asisten | Master data |
| `/admin/timer` | Asisten | Timer kelas layar penuh |
| `/admin/pengaturan` | Asisten | IP admin, jaringan lab, batas upload, impor data PHP |

## Struktur kode

```
src/
  pages/            halaman & endpoint (file = URL)
  lib/              logika: db.ts (skema SQLite), tugas.ts, kontrak.ts, materi.ts, impor.ts, auth.ts
  layouts/Base.astro, components/   tampilan bersama (header, footer, ikon)
  legacy/           HTML Alpine dari versi PHP (quiz, timer, denah kontrak) — dipakai apa adanya
  middleware.ts     cek IP admin, proteksi CSRF, header keamanan
public/vendor/      Alpine, SheetJS, html2pdf, SweetAlert2, Sortable (lokal, tanpa internet)
scripts/start.mjs   menjalankan server produksi
```
