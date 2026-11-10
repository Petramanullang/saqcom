import fs from 'node:fs';
import { Zip, ZipPassThrough } from 'fflate';
import { ekstensi } from './util';

const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint', xls: 'application/vnd.ms-excel',
};

/** Format yang aman ditampilkan langsung di browser (tanpa risiko eksekusi skrip). */
export const INLINE_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'mp4', 'webm', 'mp3']);
export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);

/** Ekstensi kode/teks → bahasa highlight.js */
export const CODE_LANG: Record<string, string> = {
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', java: 'java', kt: 'kotlin', py: 'python',
  js: 'javascript', mjs: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', php: 'php',
  html: 'xml', htm: 'xml', xml: 'xml', css: 'css', scss: 'scss', json: 'json', sql: 'sql', md: 'markdown',
  txt: 'plaintext', csv: 'plaintext', log: 'plaintext', go: 'go', rs: 'rust', rb: 'ruby', dart: 'dart',
  sh: 'bash', bat: 'dos', ps1: 'powershell', yml: 'yaml', yaml: 'yaml', ini: 'ini', vb: 'vbnet', swift: 'swift',
  r: 'r', m: 'matlab', lua: 'lua', pas: 'delphi', asm: 'x86asm', ino: 'cpp', gradle: 'gradle', properties: 'properties',
  env: 'ini', gitignore: 'plaintext', vue: 'xml', svelte: 'xml', astro: 'xml',
};

export function mimeDari(nama: string): string {
  return MIME[ekstensi(nama)] || 'application/octet-stream';
}

/** Cek apakah buffer kemungkinan besar teks (UTF-8, tanpa byte NUL). */
export function sepertiTeks(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, n));
    return true;
  } catch {
    // Potongan 8000 byte bisa memotong karakter multi-byte di ujung; coba sedikit lebih pendek.
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(0, Math.max(0, n - 4))); return true; } catch { return false; }
  }
}

export function contentDisposition(tipe: 'inline' | 'attachment', nama: string): string {
  const ascii = nama.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${tipe}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nama)}`;
}

/** Kirim satu file dari disk. */
export function kirimFile(absPath: string, nama: string, inline: boolean): Response {
  if (!fs.existsSync(absPath)) return new Response('File tidak ditemukan di server.', { status: 404 });
  const ext = ekstensi(nama);
  const bolehInline = inline && INLINE_EXT.has(ext);
  const stat = fs.statSync(absPath);
  const stream = fs.createReadStream(absPath);
  const headers: Record<string, string> = {
    'Content-Type': bolehInline ? mimeDari(nama) : 'application/octet-stream',
    'Content-Length': String(stat.size),
    'Content-Disposition': contentDisposition(bolehInline ? 'inline' : 'attachment', nama),
    'Cache-Control': 'private, no-store',
  };
  // PDF viewer Chrome tidak jalan di dalam CSP sandbox; format lain dikunci rapat.
  if (ext !== 'pdf') headers['Content-Security-Policy'] = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";
  return new Response(stream as any, { headers });
}

export interface EntriZip { path: string; abs: string }

/**
 * ZIP dibuat sambil dikirim (streaming), tanpa kompresi ulang → cepat dan hemat RAM
 * walaupun isinya ratusan MB.
 */
export function kirimZip(namaZip: string, entri: EntriZip[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const dipakai = new Set<string>();
      for (const e of entri) {
        if (!fs.existsSync(e.abs)) continue;
        let p = e.path;
        let i = 2;
        while (dipakai.has(p.toLowerCase())) { const dot = e.path.lastIndexOf('.'); p = dot > 0 ? `${e.path.slice(0, dot)} (${i})${e.path.slice(dot)}` : `${e.path} (${i})`; i++; }
        dipakai.add(p.toLowerCase());
        const file = new ZipPassThrough(p);
        const st = fs.statSync(e.abs);
        file.mtime = st.mtime;
        zip.add(file);
        await new Promise<void>((resolve, reject) => {
          const rs = fs.createReadStream(e.abs, { highWaterMark: 256 * 1024 });
          rs.on('data', (b) => file.push(new Uint8Array(b as Buffer)));
          rs.on('end', () => { file.push(new Uint8Array(0), true); resolve(); });
          rs.on('error', reject);
        });
      }
      zip.end();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition('attachment', namaZip),
      'Cache-Control': 'private, no-store',
    },
  });
}
