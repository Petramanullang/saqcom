import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run, tx } from './db';
import { MATERI_DIR } from './config';
import { amanPath, ekstensi, nowWib } from './util';
import { getSettings } from './settings';

export interface MateriGrup {
  id: number; nama_matkul: string; nama_dosen: string; jurusan: string; kelas: string;
  semester: number | null; sks: number | null; is_locked: number; jadwal_id: number | null;
}
export interface Materi { id: number; grup_id: number; judul_materi: string; nama_file: string; nama_asli: string; ukuran: number; created_at: string }
export type GrupDenganMateri = MateriGrup & { materi: Materi[] };

export function listGrupMateri(): GrupDenganMateri[] {
  const grup = all<MateriGrup>('SELECT * FROM materi_grup');
  const materi = all<Materi>('SELECT * FROM materi ORDER BY id');
  const map = new Map<number, GrupDenganMateri>(grup.map((g) => [g.id, { ...g, materi: [] }]));
  for (const m of materi) map.get(m.grup_id)?.materi.push(m);
  return [...map.values()];
}

export function getOrCreateGrup(g: Omit<MateriGrup, 'id' | 'is_locked' | 'jadwal_id'> & { jadwal_id?: number | null }): number {
  const ada = g.jadwal_id
    ? get<{ id: number }>('SELECT id FROM materi_grup WHERE jadwal_id = ?', g.jadwal_id)
    : get<{ id: number }>('SELECT id FROM materi_grup WHERE nama_matkul = ? AND nama_dosen = ? AND jurusan = ? AND kelas = ? AND jadwal_id IS NULL', g.nama_matkul, g.nama_dosen, g.jurusan, g.kelas);
  if (ada) return ada.id;
  return Number(run('INSERT INTO materi_grup(nama_matkul, nama_dosen, jurusan, kelas, semester, sks, jadwal_id) VALUES (?,?,?,?,?,?,?)',
    g.nama_matkul, g.nama_dosen, g.jurusan, g.kelas, g.semester, g.sks, g.jadwal_id ?? null).lastInsertRowid);
}

/** Grup materi dari satu jadwal: matkul, dosen, kelas, SKS diambil otomatis. */
export function grupDariJadwal(j: { id: number; nama_matkul: string; jurusan: string; nama_dosen: string | null; kelas: string; sks: number }): number {
  const id = getOrCreateGrup({ nama_matkul: j.nama_matkul, nama_dosen: j.nama_dosen ?? '-', jurusan: j.jurusan, kelas: j.kelas, semester: null, sks: j.sks, jadwal_id: j.id });
  run('UPDATE materi_grup SET nama_matkul = ?, nama_dosen = ?, jurusan = ?, kelas = ?, sks = ? WHERE id = ?', j.nama_matkul, j.nama_dosen ?? '-', j.jurusan, j.kelas, j.sks, id);
  return id;
}

export class MateriError extends Error {}

export async function simpanFileMateri(file: File): Promise<{ nama_file: string; nama_asli: string; ukuran: number }> {
  const s = getSettings();
  if (!file || !file.size) throw new MateriError('Pilih file materi.');
  const ext = ekstensi(file.name);
  if (!s.materiExt.includes(ext)) throw new MateriError(`Tipe file tidak diizinkan. Format: ${s.materiExt.join(', ')}`);
  if (file.size > s.materiMaxMb * 1024 * 1024) throw new MateriError(`Ukuran file melebihi ${s.materiMaxMb} MB.`);
  const nama_file = amanPath(`${crypto.randomBytes(6).toString('hex')}_${file.name}`, 200);
  fs.writeFileSync(path.join(MATERI_DIR, nama_file), Buffer.from(await file.arrayBuffer()));
  return { nama_file, nama_asli: amanPath(file.name, 200), ukuran: file.size };
}

export function hapusFileMateri(nama: string) {
  const p = path.resolve(MATERI_DIR, nama);
  if (p.startsWith(path.resolve(MATERI_DIR) + path.sep) && fs.existsSync(p)) fs.unlinkSync(p);
}

/** Hapus grup kosong (setelah materi terakhirnya dipindah/dihapus). */
export function bersihkanGrupKosong() {
  run('DELETE FROM materi_grup WHERE id NOT IN (SELECT DISTINCT grup_id FROM materi)');
}

export function tambahMateri(grupId: number, judul: string, f: { nama_file: string; nama_asli: string; ukuran: number }) {
  return tx(() => Number(run('INSERT INTO materi(grup_id, judul_materi, nama_file, nama_asli, ukuran, created_at) VALUES (?,?,?,?,?,?)',
    grupId, judul, f.nama_file, f.nama_asli, f.ukuran, nowWib()).lastInsertRowid));
}

export const pathMateri = (m: Materi) => {
  const p = path.resolve(MATERI_DIR, m.nama_file);
  return p.startsWith(path.resolve(MATERI_DIR) + path.sep) ? p : null;
};
