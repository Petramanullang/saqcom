import dns from 'node:dns/promises';
import { getSettings } from './settings';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function normalisasi(ip: string): string {
  ip = ip.trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

/**
 * IP asli klien. Jika request datang dari reverse proxy di PC yang sama
 * (Apache Laragon/XAMPP → 127.0.0.1), pakai header X-Forwarded-For.
 * Header itu HANYA dipercaya bila koneksi berasal dari loopback.
 */
export function clientIp(request: Request, socketAddr: string | undefined): { ip: string; viaProxy: boolean } {
  const sock = normalisasi(socketAddr || '');
  const xff = request.headers.get('x-forwarded-for');
  if (LOOPBACK.has(sock) || sock === '127.0.0.1') {
    if (xff) {
      const first = normalisasi(xff.split(',')[0]);
      if (first) return { ip: first, viaProxy: true };
    }
  }
  return { ip: sock || '0.0.0.0', viaProxy: false };
}

export function isLoopback(ip: string) {
  return LOOPBACK.has(ip) || ip === '127.0.0.1';
}

export function isAdminIp(ip: string): boolean {
  const s = getSettings();
  if (isLoopback(ip)) return s.allowLocalhostAdmin;
  return s.adminIps.includes(ip);
}

/** Nomor PC dari IP lab (192.168.2.N → N). 0 jika bukan IP lab. */
export function pcDariIp(ip: string): number {
  const s = getSettings();
  if (!ip.startsWith(s.labIpPrefix)) return 0;
  const n = parseInt(ip.slice(s.labIpPrefix.length), 10);
  return n >= 1 && n <= s.jumlahPc ? n : 0;
}

const hostCache = new Map<string, { name: string; at: number }>();

/** Nama komputer klien (reverse lookup OS, dengan timeout supaya upload tidak lambat). */
export async function hostnameDariIp(ip: string): Promise<string> {
  if (isLoopback(ip)) return 'localhost';
  const c = hostCache.get(ip);
  if (c && Date.now() - c.at < 30 * 60_000) return c.name;
  let name = '';
  try {
    const res = await Promise.race([
      dns.lookupService(ip, 0).then((r) => r.hostname),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
    ]);
    name = res && res !== ip ? res.split('.')[0] : '';
  } catch { /* tidak ketemu */ }
  if (!name) {
    const pc = pcDariIp(ip);
    name = pc ? `PC-${pc}` : ip;
  }
  hostCache.set(ip, { name, at: Date.now() });
  return name;
}
