import crypto from 'node:crypto';
import { all, get, run, tx } from './db';
import { nowWib, escapeHtml } from './util';

export interface KelasKontrak { id: string; mk: string; nama: string; koordinator_mk: string; asisten_pj: string; is_active: number; created_at: string; jadwal_id: number | null }
export interface Kursi { kelas_id: string; no_pc: number; nim: string; nama: string; janji: number; waktu_kontrak: string; ip_address: string }
export interface Laporan { id: string; waktu: string; pc: number; kategori: string; deskripsi: string; status: string }

export const listKelasKontrak = () => all<KelasKontrak>('SELECT * FROM kontrak_kelas ORDER BY mk COLLATE NOCASE, nama COLLATE NOCASE');
export const getKelasKontrak = (id: string) => get<KelasKontrak>('SELECT * FROM kontrak_kelas WHERE id = ?', id);
export const kelasAktif = () => get<KelasKontrak>('SELECT * FROM kontrak_kelas WHERE is_active = 1 LIMIT 1');
export const kursiKelas = (id: string) => all<Kursi>('SELECT * FROM kontrak_kursi WHERE kelas_id = ? ORDER BY no_pc', id);
export const getKursi = (id: string, pc: number) => get<Kursi>('SELECT * FROM kontrak_kursi WHERE kelas_id = ? AND no_pc = ?', id, pc);

/** Format lama (JSON per bangku) — dipakai halaman denah. */
export function petaKursi(id: string, jumlahPc: number) {
  const isi = new Map(kursiKelas(id).map((k) => [k.no_pc, k]));
  const out: Record<number, { status: string; nama: string }> = {};
  for (let i = 1; i <= jumlahPc; i++) {
    const k = isi.get(i);
    out[i] = k ? { status: 'terisi', nama: k.nama } : { status: 'kosong', nama: '' };
  }
  return out;
}

export function idKelasBaru() {
  return `kelas_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(2).toString('hex')}`;
}

export function buatKelas(mk: string, nama: string, koordinator = 'SAQ LABORATORY') {
  const id = idKelasBaru();
  run('INSERT INTO kontrak_kelas(id, mk, nama, koordinator_mk, created_at) VALUES (?,?,?,?,?)', id, mk, nama, koordinator || 'SAQ LABORATORY', nowWib());
  return id;
}

/** Hanya boleh satu kelas aktif. */
export function setStatus(id: string, buka: boolean, asistenPj?: string) {
  tx(() => {
    if (buka) run('UPDATE kontrak_kelas SET is_active = 0');
    run('UPDATE kontrak_kelas SET is_active = ? WHERE id = ?', buka ? 1 : 0, id);
    if (buka && asistenPj !== undefined) run('UPDATE kontrak_kelas SET asisten_pj = ? WHERE id = ?', asistenPj, id);
  });
}

export class KontrakError extends Error {
  constructor(public judul: string, pesan: string) { super(pesan); }
}

export function booking(kelasId: string, pc: number, nim: string, nama: string, ip: string) {
  try {
    run('INSERT INTO kontrak_kursi(kelas_id, no_pc, nim, nama, janji, waktu_kontrak, ip_address) VALUES (?,?,?,?,1,?,?)', kelasId, pc, nim, nama, nowWib(), ip);
  } catch (e: any) {
    if (String(e?.message).includes('UNIQUE') || String(e?.code).includes('CONSTRAINT')) {
      throw new KontrakError('Bangku Penuh!', `Maaf, PC ${pc} baru saja dikontrak oleh praktikan lain!`);
    }
    throw e;
  }
}

export function hashTiket(nim: string, waktu: string) {
  return crypto.createHash('md5').update(nim + waktu).digest('hex').slice(0, 16).toUpperCase();
}

export const listLaporan = (status?: string) =>
  status ? all<Laporan>('SELECT * FROM laporan_kerusakan WHERE status = ? ORDER BY waktu DESC', status) : all<Laporan>('SELECT * FROM laporan_kerusakan ORDER BY waktu DESC');

/** Isi template HTML lama ({{KUNCI}}) dengan nilai yang sudah di-escape. */
export function isiTemplate(tpl: string, nilai: Record<string, string | number>, mentah: Record<string, string> = {}) {
  let out = tpl;
  for (const [k, v] of Object.entries(mentah)) out = out.split(`{{${k}}}`).join(v);
  for (const [k, v] of Object.entries(nilai)) out = out.split(`{{${k}}}`).join(escapeHtml(String(v)));
  return out;
}
