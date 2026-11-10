import { defineMiddleware } from 'astro:middleware';
import { clientIp, isAdminIp, pcDariIp } from './lib/auth';
import { getSettings } from './lib/settings';
import { aksesDitolakHtml } from './lib/ditolak';

export const onRequest = defineMiddleware(async (ctx, next) => {
  let sock: string | undefined;
  try { sock = ctx.clientAddress; } catch { sock = undefined; }
  const { ip, viaProxy } = clientIp(ctx.request, sock);
  ctx.locals.ip = ip;
  ctx.locals.isAdmin = isAdminIp(ip);
  ctx.locals.pc = pcDariIp(ip);
  ctx.locals.settings = getSettings();

  const p = ctx.url.pathname;

  // ---- Proteksi CSRF: POST/PUT/DELETE harus berasal dari halaman SAQ sendiri ----
  const m = ctx.request.method;
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
    const h = ctx.request.headers;
    const sumber = h.get('origin') || h.get('referer');
    const hostSah = [h.get('host'), viaProxy ? h.get('x-forwarded-host') : null].filter(Boolean).map((x) => x!.split(',')[0].trim().toLowerCase());
    let cocok = false;
    if (sumber) {
      try { cocok = hostSah.includes(new URL(sumber).host.toLowerCase()); } catch { cocok = false; }
    }
    if (!cocok) {
      return new Response('Permintaan ditolak (asal halaman tidak dikenal). Muat ulang halaman lalu coba lagi.', { status: 403 });
    }
  }
  const butuhAdmin = p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/');
  if (butuhAdmin && !ctx.locals.isAdmin) {
    if (p.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: false, error: 'Akses khusus admin/asisten' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(aksesDitolakHtml(ip), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const res = await next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'same-origin');
  if (!res.headers.has('X-Frame-Options')) res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
});
