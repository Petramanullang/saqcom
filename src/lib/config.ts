import path from 'node:path';
import fs from 'node:fs';

/**
 * Lokasi data aplikasi. Default: folder `data/` di root project.
 * Bisa diganti lewat environment variable SAQ_DATA_DIR.
 */
export const DATA_DIR = path.resolve(process.env.SAQ_DATA_DIR || path.join(process.cwd(), 'data'));
export const DB_PATH = path.join(DATA_DIR, 'saq.db');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // tugas mahasiswa
export const MATERI_DIR = path.join(DATA_DIR, 'materi'); // materi praktikum
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

for (const dir of [DATA_DIR, UPLOAD_DIR, MATERI_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Ekstensi yang SELALU ditolak untuk upload (bisa dieksekusi server/OS). */
export const BLOCKED_EXT = [
  'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'phps', 'pht',
  'htaccess', 'htpasswd', 'cgi', 'asp', 'aspx', 'jsp', 'shtml',
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'vbs', 'ps1', 'dll',
];

export const TZ = 'Asia/Jakarta';
