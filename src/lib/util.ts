import crypto from 'node:crypto';
import { TZ } from './config';

const pad = (n: number) => String(n).padStart(2, '0');

/** Bagian tanggal/jam di zona WIB, apa pun timezone OS server. */
function partsWib(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour === '24' ? '00' : p.hour, i: p.minute, s: p.second };
}

/** 'YYYY-MM-DD HH:MM:SS' dalam WIB. */
export function nowWib(d = new Date()): string {
  const p = partsWib(d);
  return `${p.y}-${p.m}-${p.d} ${p.h}:${p.i}:${p.s}`;
}
export function todayWib(): string {
  return nowWib().slice(0, 10);
}
/** Stempel aman untuk nama folder: YYYY-MM-DD_HH-MM-SS */
export function stampWib(d = new Date()): string {
  return nowWib(d).replace(' ', '_').replace(/:/g, '-');
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** '2026-11-10 09:07:00' → '10 Nov 2026, 09:07' */
export function fmtWaktu(s?: string | null, withSec = false): string {
  if (!s) return '-';
  const [d, t = ''] = s.split(' ');
  const [y, m, dd] = d.split('-');
  if (!y || !m || !dd) return s;
  return `${Number(dd)} ${BLN[Number(m) - 1]} ${y}${t ? ', ' + (withSec ? t : t.slice(0, 5)) : ''}`;
}
export function fmtTanggalPanjang(s: string): string {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${HARI[dt.getUTCDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}
export function bulanIndo(m: number) { return BULAN[m]; }

export function fmtUkuran(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function randomId(bytes = 8): string {
  return crypto.randomBytes(bytes).toString('hex');
}
/** Kode pendek mudah dibaca (bukti upload): 8 karakter tanpa huruf ambigu. */
export function kodeBukti(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  return Array.from(b, (x) => abc[x % abc.length]).join('');
}

/** Hanya huruf, angka, spasi, titik, minus, underscore. */
export function bersihkanNama(s: string, max = 80): string {
  return s.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** Untuk komponen path: hilangkan semua kecuali alfanumerik, '-' '_' '.' */
export function amanPath(s: string, max = 120): string {
  const out = s.normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').replace(/^\.+/, '').trim();
  return (out || 'file').slice(0, max);
}
export function ekstensi(nama: string): string {
  const i = nama.lastIndexOf('.');
  return i > 0 ? nama.slice(i + 1).toLowerCase() : '';
}

export function hexToRgb(hex: string): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Flash message lewat query string: ?ok=... / ?err=... */
export function flashUrl(base: string, type: 'ok' | 'err', msg: string): string {
  const u = new URL(base, 'http://x');
  u.searchParams.delete('ok');
  u.searchParams.delete('err');
  u.searchParams.set(type, msg);
  return u.pathname + u.search;
}

export const str = (v: FormDataEntryValue | null | undefined) => (typeof v === 'string' ? v.trim() : '');
export const int = (v: FormDataEntryValue | null | undefined, d = 0) => {
  const n = parseInt(str(v), 10);
  return Number.isFinite(n) ? n : d;
};

/** Ubah nilai <input type="datetime-local"> ('2026-11-10T13:00') → '2026-11-10 13:00:00' */
export function fromDatetimeLocal(v: string): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/);
  return m ? `${m[1]} ${m[2]}:${m[3] ?? '00'}` : null;
}
export function toDatetimeLocal(v?: string | null): string {
  return v ? v.slice(0, 16).replace(' ', 'T') : '';
}
export { pad };
