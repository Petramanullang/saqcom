import { db, all } from './db';
import { seedJadwalAwal } from './jadwal';

export interface Settings {
  /** IP PC admin/asisten (selain localhost). */
  adminIps: string[];
  /** Izinkan akses admin dari 127.0.0.1/::1 (PC server sendiri). */
  allowLocalhostAdmin: boolean;
  /** Prefix IP jaringan lab, contoh '192.168.2.' — IP .N = PC N. */
  labIpPrefix: string;
  jumlahPc: number;
  screenTaskUrl: string;
  /** Upload tugas */
  maxFileMb: number;
  maxTotalMb: number;
  /** Ekstensi yang diizinkan. Kosong = semua format (kecuali yang diblokir sistem). */
  allowedExt: string[];
  /** Materi */
  materiExt: string[];
  materiMaxMb: number;
  lokasiLab: string;
}

export const DEFAULT_SETTINGS: Settings = {
  adminIps: ['192.168.2.50', '192.168.2.51'],
  allowLocalhostAdmin: true,
  labIpPrefix: '192.168.2.',
  jumlahPc: 42,
  screenTaskUrl: 'http://192.168.2.51:7070',
  maxFileMb: 10,
  maxTotalMb: 50,
  allowedExt: [],
  materiExt: ['pdf', 'zip', 'docx', 'pptx', 'xlsx', 'rar'],
  materiMaxMb: 50,
  lokasiLab: 'SAQ Lab, Lantai 3',
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: any = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      try { s[r.key] = JSON.parse(r.value); } catch { /* abaikan */ }
    }
  }
  // Override dari environment (berguna jika terkunci di luar halaman admin).
  if (process.env.SAQ_ADMIN_IPS) {
    s.adminIps = Array.from(new Set([...s.adminIps, ...process.env.SAQ_ADMIN_IPS.split(',').map((x) => x.trim()).filter(Boolean)]));
  }
  cache = s as Settings;
  return cache;
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
  }
  cache = null;
}

/** Data awal: jadwal semester Ganjil 2026/2027 (sekali saja, saat database masih kosong). */
seedJadwalAwal();
