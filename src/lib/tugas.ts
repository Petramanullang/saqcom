import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run, tx, db } from './db';
import { UPLOAD_DIR, BLOCKED_EXT } from './config';
import { getSettings } from './settings';
import { nowWib, stampWib, kodeBukti, amanPath, ekstensi, bersihkanNama } from './util';

export interface Kelas { id: number; nama: string; warna: string; aktif: number; urutan: number; jadwal_id: number | null }
export interface Sesi {
  id: number; kelas_id: number; judul: string; deadline: string | null;
  dibuka: number; tolak_terlambat: number; created_at: string;
}
export interface SubFile { id: number; submission_id: number; nama_asli: string; nama_simpan: string; ukuran: number; sha256: string }
export interface Submission {
  id: number; kode: string; kelas_id: number; sesi_id: number | null; nim: string; nama: string;
  hostname: string; ip: string; user_agent: string; folder: string; terlambat: number;
  diarsipkan: number; impor: number; created_at: string;
  files: SubFile[];
}

export const listKelas = (hanyaAktif = false) =>
  all<Kelas>(`SELECT * FROM kelas_tugas ${hanyaAktif ? 'WHERE aktif = 1' : ''} ORDER BY urutan, nama`);
export const getKelas = (id: number) => get<Kelas>('SELECT * FROM kelas_tugas WHERE id = ?', id);
export const listSesi = (kelasId?: number) =>
  kelasId
    ? all<Sesi>('SELECT * FROM sesi_tugas WHERE kelas_id = ? ORDER BY created_at DESC, id DESC', kelasId)
    : all<Sesi>('SELECT * FROM sesi_tugas ORDER BY created_at DESC, id DESC');
export const getSesi = (id: number) => get<Sesi>('SELECT * FROM sesi_tugas WHERE id = ?', id);

/** Sesi yang sedang dibuka per kelas aktif (untuk form mahasiswa). */
export function sesiTerbukaPerKelas(): Record<number, Sesi[]> {
  const out: Record<number, Sesi[]> = {};
  for (const s of all<Sesi>('SELECT s.* FROM sesi_tugas s JOIN kelas_tugas k ON k.id = s.kelas_id WHERE s.dibuka = 1 AND k.aktif = 1 ORDER BY s.created_at DESC')) {
    (out[s.kelas_id] ||= []).push(s);
  }
  return out;
}

export function isLewatDeadline(sesi: Sesi | undefined | null, waktu = nowWib()): boolean {
  return !!(sesi?.deadline && waktu > sesi.deadline);
}

export class UploadError extends Error {}

export interface UploadInput {
  kelasId: number; sesiId: number | null; nim: string; nama: string;
  files: File[]; ip: string; hostname: string; userAgent: string;
}

export function validasiNim(raw: string): string {
  const nim = raw.replace(/\D/g, '');
  if (nim.length < 5 || nim.length > 15) throw new UploadError('NIM harus berupa angka 5–15 digit.');
  return nim;
}

/** Simpan satu kali pengumpulan (bisa banyak file sekaligus). */
export async function simpanSubmission(inp: UploadInput) {
  const s = getSettings();
  const kelas = getKelas(inp.kelasId);
  if (!kelas || !kelas.aktif) throw new UploadError('Kelas tidak valid. Pilih dari daftar kelas yang tersedia.');
  const nim = validasiNim(inp.nim);
  const nama = bersihkanNama(inp.nama);
  if (nama.length < 2) throw new UploadError('Nama lengkap wajib diisi.');

  let sesi: Sesi | undefined;
  const terbuka = sesiTerbukaPerKelas()[kelas.id] || [];
  if (inp.sesiId) {
    sesi = getSesi(inp.sesiId);
    if (!sesi || sesi.kelas_id !== kelas.id) throw new UploadError('Tugas/pertemuan tidak valid untuk kelas ini.');
    if (!sesi.dibuka) throw new UploadError(`Pengumpulan "${sesi.judul}" sudah ditutup oleh asisten.`);
  } else if (terbuka.length > 0) {
    throw new UploadError('Pilih tugas/pertemuan yang ingin dikumpulkan.');
  }
  const waktu = nowWib();
  const terlambat = isLewatDeadline(sesi, waktu);
  if (terlambat && sesi?.tolak_terlambat) {
    throw new UploadError(`Batas waktu "${sesi.judul}" sudah lewat (${sesi.deadline}). Pengumpulan tidak diterima lagi.`);
  }

  const files = inp.files.filter((f) => f && f.size > 0 && f.name);
  if (files.length === 0) throw new UploadError('Silakan pilih file terlebih dahulu.');
  if (files.length > 30) throw new UploadError('Maksimal 30 file dalam satu kali upload.');
  let total = 0;
  for (const f of files) {
    const ext = ekstensi(f.name);
    if (BLOCKED_EXT.includes(ext)) throw new UploadError(`File "${f.name}" tidak diizinkan (format .${ext} diblokir demi keamanan).`);
    if (s.allowedExt.length && !s.allowedExt.includes(ext)) {
      throw new UploadError(`Format file "${f.name}" tidak diizinkan. Format yang didukung: ${s.allowedExt.join(', ')}`);
    }
    if (f.size > s.maxFileMb * 1024 * 1024) throw new UploadError(`File "${f.name}" melebihi batas ${s.maxFileMb} MB.`);
    total += f.size;
  }
  if (total > s.maxTotalMb * 1024 * 1024) throw new UploadError(`Total ukuran file melebihi ${s.maxTotalMb} MB.`);

  const namaFolder = amanPath(`${nim}_${nama.replace(/\s+/g, '')}_${inp.hostname || 'unknown'}_${stampWib()}`);
  const relFolder = path.posix.join(amanPath(kelas.nama), namaFolder + '_' + crypto.randomBytes(2).toString('hex'));
  const absFolder = path.join(UPLOAD_DIR, relFolder);
  fs.mkdirSync(absFolder, { recursive: true });

  const saved: { nama_asli: string; nama_simpan: string; ukuran: number; sha256: string }[] = [];
  const dipakai = new Set<string>();
  try {
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      let simpan = amanPath(`${nim}_${f.name}`, 150);
      while (dipakai.has(simpan.toLowerCase())) simpan = '_' + simpan;
      dipakai.add(simpan.toLowerCase());
      fs.writeFileSync(path.join(absFolder, simpan), buf);
      saved.push({ nama_asli: amanPath(f.name, 200), nama_simpan: simpan, ukuran: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    }
  } catch (e) {
    fs.rmSync(absFolder, { recursive: true, force: true });
    throw e;
  }

  const kode = kodeBukti();
  const id = tx(() => {
    const r = run(
      `INSERT INTO submission(kode, kelas_id, sesi_id, nim, nama, hostname, ip, user_agent, folder, terlambat, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      kode, kelas.id, sesi?.id ?? null, nim, nama, inp.hostname, inp.ip, inp.userAgent.slice(0, 300), relFolder, terlambat ? 1 : 0, waktu,
    );
    const sid = Number(r.lastInsertRowid);
    const st = db.prepare('INSERT INTO submission_file(submission_id, nama_asli, nama_simpan, ukuran, sha256) VALUES (?,?,?,?,?)');
    for (const f of saved) st.run(sid, f.nama_asli, f.nama_simpan, f.ukuran, f.sha256);
    return sid;
  });
  // Metadata cadangan di folder (berguna kalau database hilang).
  fs.writeFileSync(path.join(absFolder, 'metadata.json'), JSON.stringify({
    kode, nim, nama, kelas: kelas.nama, sesi: sesi?.judul ?? null, upload_time: waktu, hostname: inp.hostname,
    ip_address: inp.ip, terlambat, files: saved.map((f) => f.nama_simpan),
  }, null, 2));

  const sebelumnya = get<{ c: number }>(
    `SELECT COUNT(*) c FROM submission WHERE kelas_id = ? AND nim = ? AND id <> ? AND ${sesi ? 'sesi_id = ?' : "sesi_id IS NULL AND substr(created_at,1,10) = ?"}`,
    kelas.id, nim, id, sesi ? sesi.id : waktu.slice(0, 10),
  )!.c;

  return { id, kode, waktu, kelas, sesi, terlambat, files: saved, versiKe: sebelumnya + 1 };
}

// ---------------------------------------------------------------------------
// Query untuk halaman admin "Tugas Masuk"
// ---------------------------------------------------------------------------

export interface Filter {
  kelasId: number | null;
  sesi: 'all' | 'umum' | number;
  dari: string; // YYYY-MM-DD
  sampai: string;
  q: string;
  arsip: boolean; // true = tampilkan yang diarsipkan saja
  semuaTanggal: boolean; // true = abaikan default "hari ini"
  hal: number;
  /** true bila tanggal diisi otomatis (default hari ini) */
  otomatisHariIni?: boolean;
}

export const PER_HALAMAN = 20;

export function bacaFilter(url: URL): Filter {
  const sp = url.searchParams;
  const sesiRaw = sp.get('sesi') || 'all';
  const kelasRaw = parseInt(sp.get('kelas') || '', 10);
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  const f: Filter = {
    kelasId: Number.isFinite(kelasRaw) ? kelasRaw : null,
    sesi: sesiRaw === 'umum' ? 'umum' : /^\d+$/.test(sesiRaw) ? parseInt(sesiRaw, 10) : 'all',
    dari: iso(sp.get('dari')),
    sampai: iso(sp.get('sampai')),
    q: (sp.get('q') || '').trim().slice(0, 80),
    arsip: sp.get('arsip') === '1',
    semuaTanggal: sp.get('tgl') === 'semua',
    hal: Math.max(1, parseInt(sp.get('hal') || '1', 10) || 1),
  };
  // Default: tampilkan hari ini (kecuali sedang mencari, memilih tugas tertentu, atau melihat arsip)
  if (!f.semuaTanggal && !f.dari && !f.sampai && !f.q && typeof f.sesi !== 'number' && !f.arsip) {
    f.dari = f.sampai = nowWib().slice(0, 10);
    f.otomatisHariIni = true;
  }
  return f;
}

export function filterKeQuery(f: Partial<Filter>, hal?: number): string {
  const sp = new URLSearchParams();
  if (f.kelasId) sp.set('kelas', String(f.kelasId));
  if (f.sesi && f.sesi !== 'all') sp.set('sesi', String(f.sesi));
  if (f.semuaTanggal) sp.set('tgl', 'semua');
  else if (!f.otomatisHariIni) {
    if (f.dari) sp.set('dari', f.dari);
    if (f.sampai) sp.set('sampai', f.sampai);
  }
  if (f.q) sp.set('q', f.q);
  if (f.arsip) sp.set('arsip', '1');
  if (hal && hal > 1) sp.set('hal', String(hal));
  const s = sp.toString();
  return s ? '?' + s : '';
}

export function cariSubmission(f: Filter): Submission[] {
  const where: string[] = ['diarsipkan = ?'];
  const params: any[] = [f.arsip ? 1 : 0];
  if (f.kelasId) { where.push('kelas_id = ?'); params.push(f.kelasId); }
  if (f.sesi === 'umum') where.push('sesi_id IS NULL');
  else if (typeof f.sesi === 'number') { where.push('sesi_id = ?'); params.push(f.sesi); }
  if (f.dari && !f.semuaTanggal) { where.push('created_at >= ?'); params.push(f.dari + ' 00:00:00'); }
  if (f.sampai && !f.semuaTanggal) { where.push('created_at <= ?'); params.push(f.sampai + ' 23:59:59'); }
  if (f.q) {
    where.push('(nim LIKE ? OR nama LIKE ? OR kode LIKE ? OR hostname LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like, like, like);
  }
  const subs = all<Submission>(`SELECT * FROM submission WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC`, ...params);
  return lampirkanFile(subs);
}

export function lampirkanFile(subs: Submission[]): Submission[] {
  if (!subs.length) return subs;
  const map = new Map<number, Submission>();
  for (const s of subs) { s.files = []; map.set(s.id, s); }
  const ids = [...map.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const f of all<SubFile>(`SELECT * FROM submission_file WHERE submission_id IN (${chunk.map(() => '?').join(',')}) ORDER BY nama_asli`, ...chunk)) {
      map.get(f.submission_id)?.files.push(f);
    }
  }
  return subs;
}

export function getSubmissionsByIds(ids: number[]): Submission[] {
  if (!ids.length) return [];
  return lampirkanFile(all<Submission>(`SELECT * FROM submission WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`, ...ids));
}

/** Kunci "satu pengumpulan": kelas + sesi (atau tanggal bila tanpa sesi) + NIM. */
export const kunciKonteks = (s: Pick<Submission, 'kelas_id' | 'sesi_id' | 'created_at'>) =>
  `${s.kelas_id}|${s.sesi_id ?? 'D' + s.created_at.slice(0, 10)}`;

export interface Grup {
  key: string;
  utama: Submission;
  lama: Submission[]; // versi sebelumnya, terbaru dulu
  flags: string[];
}

export interface Indikasi {
  tipe: 'pc' | 'file';
  judul: string;
  detail: string;
  nims: { nim: string; nama: string }[];
}

export function kelompokkan(subs: Submission[]) {
  // subs sudah urut terbaru → terlama
  const grupMap = new Map<string, Grup>();
  for (const s of subs) {
    const key = kunciKonteks(s) + '|' + s.nim;
    const g = grupMap.get(key);
    if (!g) grupMap.set(key, { key, utama: s, lama: [], flags: [] });
    else g.lama.push(s);
  }
  const grup = [...grupMap.values()];

  // ---- Indikasi kecurangan ----
  const indikasi: Indikasi[] = [];
  const flagNim = new Map<string, Set<string>>(); // konteks|nim → flags
  const tandai = (konteks: string, nim: string, flag: string) => {
    const k = konteks + '|' + nim;
    if (!flagNim.has(k)) flagNim.set(k, new Set());
    flagNim.get(k)!.add(flag);
  };

  // 1) Satu PC/IP dipakai beberapa NIM pada konteks yang sama
  const perIp = new Map<string, Map<string, Submission>>();
  for (const s of subs) {
    if (!s.ip || s.impor || s.ip === '127.0.0.1' || s.ip === '::1') continue;
    const k = kunciKonteks(s) + '|' + s.ip;
    if (!perIp.has(k)) perIp.set(k, new Map());
    perIp.get(k)!.set(s.nim, s);
  }
  for (const [k, m] of perIp) {
    if (m.size < 2) continue;
    const contoh = [...m.values()][0];
    const konteks = kunciKonteks(contoh);
    indikasi.push({
      tipe: 'pc', judul: `Satu PC dipakai ${m.size} NIM`,
      detail: `${contoh.hostname || '-'} (${contoh.ip})`,
      nims: [...m.values()].map((x) => ({ nim: x.nim, nama: x.nama })),
    });
    for (const nim of m.keys()) tandai(konteks, nim, 'pc-sama');
    void k;
  }

  // 2) File identik (hash sama) dikumpulkan oleh NIM berbeda dalam kelas yang sama
  const perHash = new Map<string, { nama: string; ukuran: number; subs: Map<string, Submission> }>();
  for (const s of subs) {
    for (const f of s.files) {
      if (!f.sha256 || f.ukuran < 64) continue;
      const k = s.kelas_id + '|' + f.sha256;
      if (!perHash.has(k)) perHash.set(k, { nama: f.nama_asli, ukuran: f.ukuran, subs: new Map() });
      perHash.get(k)!.subs.set(s.nim, s);
    }
  }
  for (const v of perHash.values()) {
    if (v.subs.size < 2) continue;
    indikasi.push({
      tipe: 'file', judul: `File identik di ${v.subs.size} mahasiswa`,
      detail: v.nama,
      nims: [...v.subs.values()].map((x) => ({ nim: x.nim, nama: x.nama })),
    });
    for (const s of v.subs.values()) tandai(kunciKonteks(s), s.nim, 'file-sama');
  }

  for (const g of grup) {
    const k = kunciKonteks(g.utama) + '|' + g.utama.nim;
    if (g.utama.terlambat) g.flags.push('terlambat');
    if (g.lama.length) g.flags.push('ganda');
    for (const f of flagNim.get(k) ?? []) g.flags.push(f);
  }
  return { grup, indikasi };
}

export interface Mahasiswa { kelas_id: number; nim: string; nama: string; sumber: string }
/** Daftar mahasiswa kelas. Jika belum diisi, otomatis pakai data Kontrak dari jadwal yang sama. */
export function rosterKelas(kelasId: number): Mahasiswa[] {
  const r = all<Mahasiswa>('SELECT * FROM mahasiswa_kelas WHERE kelas_id = ? ORDER BY nim', kelasId);
  if (r.length) return r;
  return all<Mahasiswa>(`SELECT ? AS kelas_id, c.nim, c.nama, 'kontrak (otomatis)' AS sumber
    FROM kontrak_kursi c JOIN kontrak_kelas kk ON kk.id = c.kelas_id JOIN kelas_tugas kt ON kt.jadwal_id = kk.jadwal_id
    WHERE kt.id = ? GROUP BY c.nim ORDER BY c.nim`, kelasId, kelasId);
}

export function simpanRoster(kelasId: number, rows: { nim: string; nama: string }[], sumber: string, ganti = false) {
  return tx(() => {
    if (ganti) run('DELETE FROM mahasiswa_kelas WHERE kelas_id = ?', kelasId);
    const st = db.prepare(`INSERT INTO mahasiswa_kelas(kelas_id, nim, nama, sumber) VALUES (?,?,?,?)
      ON CONFLICT(kelas_id, nim) DO UPDATE SET nama = CASE WHEN excluded.nama <> '' THEN excluded.nama ELSE mahasiswa_kelas.nama END, sumber = excluded.sumber`);
    let n = 0;
    for (const r of rows) {
      const nim = String(r.nim ?? '').replace(/\D/g, '');
      if (nim.length < 5 || nim.length > 15) continue;
      st.run(kelasId, nim, bersihkanNama(String(r.nama ?? '')).toUpperCase(), sumber);
      n++;
    }
    return n;
  });
}

/** Path absolut file (dengan proteksi path traversal). */
export function pathFile(sub: Pick<Submission, 'folder'>, f: Pick<SubFile, 'nama_simpan'>): string | null {
  const p = path.resolve(UPLOAD_DIR, sub.folder, f.nama_simpan);
  if (!p.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return null;
  return p;
}

export function hapusSubmission(ids: number[]) {
  const subs = getSubmissionsByIds(ids);
  for (const s of subs) {
    const dir = path.resolve(UPLOAD_DIR, s.folder);
    if (dir.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) fs.rmSync(dir, { recursive: true, force: true });
  }
  tx(() => {
    for (const s of subs) run('DELETE FROM submission WHERE id = ?', s.id);
  });
  return subs.length;
}

export function setArsip(ids: number[], nilai: boolean) {
  return tx(() => {
    let n = 0;
    for (const id of ids) n += Number(run('UPDATE submission SET diarsipkan = ? WHERE id = ?', nilai ? 1 : 0, id).changes);
    return n;
  });
}

/** Hitung ulang flag terlambat semua pengumpulan di satu sesi (setelah deadline diubah). */
export function hitungUlangTerlambat(sesiId: number) {
  const s = getSesi(sesiId);
  if (!s) return;
  if (!s.deadline) run('UPDATE submission SET terlambat = 0 WHERE sesi_id = ?', sesiId);
  else run('UPDATE submission SET terlambat = CASE WHEN created_at > ? THEN 1 ELSE 0 END WHERE sesi_id = ?', s.deadline, sesiId);
}
