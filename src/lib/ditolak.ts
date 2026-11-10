import { escapeHtml } from './util';

/** Halaman "Akses Ditolak" mandiri (tanpa build CSS, jadi aman dipanggil dari middleware). */
export function aksesDitolakHtml(ip: string): string {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Akses Ditolak - SAQ LAB</title>
<script>try{if(localStorage.getItem('darkMode')==='enabled')document.documentElement.classList.add('dark')}catch(e){}</script>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f9fafb;color:#111827}
.dark body{background:#111827;color:#f3f4f6}
.card{max-width:420px;width:100%;background:#fff;border:1px solid #fee2e2;border-radius:28px;padding:32px;text-align:center;position:relative;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.08)}
.dark .card{background:#1f2937;border-color:#7f1d1d55}
.bar{position:absolute;top:0;left:0;right:0;height:6px;background:#ef4444}
.ic{width:72px;height:72px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;color:#ef4444;font-size:34px;font-weight:900}
.dark .ic{background:#7f1d1d33}
h1{font-size:22px;margin:0 0 8px}p{color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px}
code{background:#f3f4f6;padding:2px 6px;border-radius:6px;font-size:12px}.dark code{background:#374151}
a{display:block;padding:12px;border-radius:14px;background:#fef2f2;color:#dc2626;font-weight:700;text-decoration:none;font-size:14px}
.dark a{background:#7f1d1d33;color:#f87171}
</style></head><body><div class="card"><div class="bar"></div><div class="ic">!</div>
<h1>Akses Ditolak</h1>
<p>Halaman ini hanya dapat diakses dari <b>PC Admin</b> atau <b>Asisten Laboratorium</b> SAQ.<br>IP Anda: <code>${escapeHtml(ip)}</code></p>
<a href="/">Kembali ke Halaman Utama</a></div></body></html>`;
}
