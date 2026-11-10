import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config';

/**
 * SQLite bawaan Node.js (node:sqlite) — tanpa modul native, jadi `npm install`
 * di Windows tidak butuh Visual Studio / build tools.
 */
declare global {
  // eslint-disable-next-line no-var
  var __saqDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`);
  migrate(db);
  return db;
}

const SCHEMA_VERSION = 2;

function kolomAda(db: DatabaseSync, tabel: string, kolom: string) {
  return (db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[]).some((c) => c.name === kolom);
}

function migrate(db: DatabaseSync) {
  const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (v >= SCHEMA_VERSION) return;
  if (v < 1) migrasiV1(db);
  if (v < 2) migrasiV2(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

function migrasiV1(db: DatabaseSync) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- ===== Master data =====
  CREATE TABLE IF NOT EXISTS dosen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_dosen TEXT NOT NULL,
    jurusan TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS matkul (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_matkul TEXT NOT NULL,
    sks INTEGER NOT NULL DEFAULT 2,
    jurusan TEXT NOT NULL,
    semester INTEGER NOT NULL DEFAULT 1
  );

  -- ===== Materi (download files) =====
  CREATE TABLE IF NOT EXISTS materi_grup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_matkul TEXT NOT NULL,
    nama_dosen TEXT NOT NULL,
    jurusan TEXT NOT NULL,
    kelas TEXT NOT NULL DEFAULT '',
    semester INTEGER,
    sks INTEGER,
    is_locked INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS materi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grup_id INTEGER NOT NULL REFERENCES materi_grup(id) ON DELETE CASCADE,
    judul_materi TEXT NOT NULL,
    nama_file TEXT NOT NULL,
    nama_asli TEXT NOT NULL DEFAULT '',
    ukuran INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- ===== Tugas (upload mahasiswa) =====
  CREATE TABLE IF NOT EXISTS kelas_tugas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE,
    warna TEXT NOT NULL DEFAULT '#3b82f6',
    aktif INTEGER NOT NULL DEFAULT 1,
    urutan INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sesi_tugas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kelas_id INTEGER NOT NULL REFERENCES kelas_tugas(id) ON DELETE CASCADE,
    judul TEXT NOT NULL,
    deadline TEXT,               -- 'YYYY-MM-DD HH:MM:SS' (WIB), NULL = tanpa deadline
    dibuka INTEGER NOT NULL DEFAULT 1,
    tolak_terlambat INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mahasiswa_kelas (
    kelas_id INTEGER NOT NULL REFERENCES kelas_tugas(id) ON DELETE CASCADE,
    nim TEXT NOT NULL,
    nama TEXT NOT NULL DEFAULT '',
    sumber TEXT NOT NULL DEFAULT 'manual',
    PRIMARY KEY (kelas_id, nim)
  );
  CREATE TABLE IF NOT EXISTS submission (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode TEXT NOT NULL UNIQUE,
    kelas_id INTEGER NOT NULL REFERENCES kelas_tugas(id) ON DELETE CASCADE,
    sesi_id INTEGER REFERENCES sesi_tugas(id) ON DELETE SET NULL,
    nim TEXT NOT NULL,
    nama TEXT NOT NULL,
    hostname TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL,
    terlambat INTEGER NOT NULL DEFAULT 0,
    diarsipkan INTEGER NOT NULL DEFAULT 0,
    impor INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sub_kelas ON submission(kelas_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sub_nim ON submission(nim);
  CREATE TABLE IF NOT EXISTS submission_file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
    nama_asli TEXT NOT NULL,
    nama_simpan TEXT NOT NULL,
    ukuran INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_file_hash ON submission_file(sha256);

  -- ===== Kontrak tempat duduk =====
  CREATE TABLE IF NOT EXISTS kontrak_kelas (
    id TEXT PRIMARY KEY,
    mk TEXT NOT NULL,
    nama TEXT NOT NULL,
    koordinator_mk TEXT NOT NULL DEFAULT 'SAQ LABORATORY',
    asisten_pj TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kontrak_kursi (
    kelas_id TEXT NOT NULL REFERENCES kontrak_kelas(id) ON DELETE CASCADE,
    no_pc INTEGER NOT NULL,
    nim TEXT NOT NULL,
    nama TEXT NOT NULL,
    janji INTEGER NOT NULL DEFAULT 1,
    waktu_kontrak TEXT NOT NULL,
    ip_address TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (kelas_id, no_pc)
  );
  CREATE TABLE IF NOT EXISTS laporan_kerusakan (
    id TEXT PRIMARY KEY,
    waktu TEXT NOT NULL,
    pc INTEGER NOT NULL,
    kategori TEXT NOT NULL,
    deskripsi TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
  );

  -- ===== Quiz =====
  CREATE TABLE IF NOT EXISTS quiz (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    settings TEXT NOT NULL DEFAULT '{}',
    questions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quiz_submission (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nim TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    percentage REAL NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 1,
    time_taken INTEGER NOT NULL DEFAULT 0,
    answers TEXT NOT NULL DEFAULT '{}',
    ip TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_qs_quiz ON quiz_submission(quiz_id);
  `);
}

/**
 * v2 — Jadwal per semester menjadi pusat data.
 * semester → jadwal (hari, jam, matkul, dosen, kelas, sks) → jadwal_asisten (PJ, 1, 2, 3)
 * Kelas upload, kontrak, materi, dan akses quiz merujuk ke jadwal.
 */
function migrasiV2(db: DatabaseSync) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS semester (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE,          -- 'Ganjil 2026/2027'
    aktif INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS asisten (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE COLLATE NOCASE,
    aktif INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS jadwal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semester_id INTEGER NOT NULL REFERENCES semester(id) ON DELETE CASCADE,
    hari INTEGER NOT NULL CHECK (hari BETWEEN 1 AND 7),   -- 1 = Senin … 7 = Minggu
    jam_mulai TEXT NOT NULL,                               -- 'HH:MM'
    matkul_id INTEGER NOT NULL REFERENCES matkul(id),
    dosen_id INTEGER REFERENCES dosen(id) ON DELETE SET NULL,
    kelas TEXT NOT NULL,
    sks INTEGER NOT NULL DEFAULT 2
  );
  CREATE INDEX IF NOT EXISTS idx_jadwal_sem ON jadwal(semester_id, hari, jam_mulai);
  CREATE TABLE IF NOT EXISTS jadwal_asisten (
    jadwal_id INTEGER NOT NULL REFERENCES jadwal(id) ON DELETE CASCADE,
    urutan INTEGER NOT NULL,           -- 0 = PJ, 1..3 = asisten
    asisten_id INTEGER NOT NULL REFERENCES asisten(id) ON DELETE CASCADE,
    PRIMARY KEY (jadwal_id, urutan)
  );
  -- Kelas pengganti / pindah jam untuk satu tanggal tertentu
  CREATE TABLE IF NOT EXISTS jadwal_pengganti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jadwal_id INTEGER NOT NULL REFERENCES jadwal(id) ON DELETE CASCADE,
    tanggal TEXT NOT NULL,             -- 'YYYY-MM-DD'
    jam_mulai TEXT NOT NULL,
    ganti_reguler INTEGER NOT NULL DEFAULT 1,  -- 1 = jadwal reguler minggu itu ditiadakan
    keterangan TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  `);
  if (!kolomAda(db, 'kelas_tugas', 'jadwal_id')) db.exec('ALTER TABLE kelas_tugas ADD COLUMN jadwal_id INTEGER REFERENCES jadwal(id) ON DELETE SET NULL');
  if (!kolomAda(db, 'kontrak_kelas', 'jadwal_id')) db.exec('ALTER TABLE kontrak_kelas ADD COLUMN jadwal_id INTEGER REFERENCES jadwal(id) ON DELETE SET NULL');
  if (!kolomAda(db, 'materi_grup', 'jadwal_id')) db.exec('ALTER TABLE materi_grup ADD COLUMN jadwal_id INTEGER REFERENCES jadwal(id) ON DELETE SET NULL');
  if (!kolomAda(db, 'quiz', 'kelas_akses')) db.exec("ALTER TABLE quiz ADD COLUMN kelas_akses TEXT NOT NULL DEFAULT '[]'");
  if (!kolomAda(db, 'quiz_submission', 'jadwal_id')) db.exec('ALTER TABLE quiz_submission ADD COLUMN jadwal_id INTEGER');
  // Kelas upload lama (sebelum ada jadwal) disembunyikan dari form; datanya tetap ada.
  db.exec('UPDATE kelas_tugas SET aktif = 0 WHERE jadwal_id IS NULL');
  buatView(db);
}

/** View untuk dibaca langsung di SQL (DB Browser for SQLite, dsb.). */
export function buatView(db: DatabaseSync) {
  db.exec(`
  DROP VIEW IF EXISTS v_jadwal;
  CREATE VIEW v_jadwal AS
  SELECT s.nama AS semester, s.aktif AS semester_aktif, j.id AS jadwal_id,
    CASE j.hari WHEN 1 THEN 'Senin' WHEN 2 THEN 'Selasa' WHEN 3 THEN 'Rabu' WHEN 4 THEN 'Kamis'
      WHEN 5 THEN 'Jumat' WHEN 6 THEN 'Sabtu' ELSE 'Minggu' END AS hari,
    j.jam_mulai AS jam, m.nama_matkul AS mata_kuliah, m.jurusan, d.nama_dosen AS dosen, j.kelas, j.sks,
    (SELECT a.nama FROM jadwal_asisten x JOIN asisten a ON a.id = x.asisten_id WHERE x.jadwal_id = j.id AND x.urutan = 0) AS asisten_pj,
    (SELECT a.nama FROM jadwal_asisten x JOIN asisten a ON a.id = x.asisten_id WHERE x.jadwal_id = j.id AND x.urutan = 1) AS asisten_1,
    (SELECT a.nama FROM jadwal_asisten x JOIN asisten a ON a.id = x.asisten_id WHERE x.jadwal_id = j.id AND x.urutan = 2) AS asisten_2,
    (SELECT a.nama FROM jadwal_asisten x JOIN asisten a ON a.id = x.asisten_id WHERE x.jadwal_id = j.id AND x.urutan = 3) AS asisten_3
  FROM jadwal j JOIN semester s ON s.id = j.semester_id JOIN matkul m ON m.id = j.matkul_id LEFT JOIN dosen d ON d.id = j.dosen_id
  ORDER BY s.id, j.hari, j.jam_mulai;

  DROP VIEW IF EXISTS v_pengumpulan;
  CREATE VIEW v_pengumpulan AS
  SELECT sub.id, sub.kode, sub.created_at AS waktu, sub.nim, sub.nama, k.nama AS kelas_upload,
    vj.semester, vj.mata_kuliah, vj.kelas, vj.dosen, st.judul AS tugas, sub.terlambat, sub.hostname, sub.ip,
    (SELECT COUNT(*) FROM submission_file f WHERE f.submission_id = sub.id) AS jumlah_file, sub.diarsipkan
  FROM submission sub JOIN kelas_tugas k ON k.id = sub.kelas_id
  LEFT JOIN v_jadwal vj ON vj.jadwal_id = k.jadwal_id LEFT JOIN sesi_tugas st ON st.id = sub.sesi_id;

  DROP VIEW IF EXISTS v_kontrak;
  CREATE VIEW v_kontrak AS
  SELECT kk.mk AS mata_kuliah, kk.nama AS kelas, kk.asisten_pj, kk.is_active AS sesi_aktif,
    c.no_pc, c.nim, c.nama, c.waktu_kontrak, c.ip_address
  FROM kontrak_kursi c JOIN kontrak_kelas kk ON kk.id = c.kelas_id ORDER BY kk.mk, kk.nama, c.no_pc;
  `);
}

export const db: DatabaseSync = globalThis.__saqDb ?? (globalThis.__saqDb = open());

/** Jalankan fungsi di dalam transaksi (BEGIN IMMEDIATE → aman untuk banyak PC sekaligus). */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

type Row = Record<string, any>;
export const all = <T = Row>(sql: string, ...params: any[]) => db.prepare(sql).all(...params) as T[];
export const get = <T = Row>(sql: string, ...params: any[]) => db.prepare(sql).get(...params) as T | undefined;
export const run = (sql: string, ...params: any[]) => db.prepare(sql).run(...params);
