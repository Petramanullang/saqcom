import type { APIRoute } from 'astro';
import { run } from '../../lib/db';
import { nowWib, randomId, str, int } from '../../lib/util';

const KATEGORI = ['Mouse / Keyboard Error', 'Monitor Blank / Kabel Kendor', 'PC Blue Screen / Sering Mati', 'Internet / Jaringan Putus', 'Aplikasi Hilang / Error'];

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const f = await request.formData();
  const pc = int(f.get('pc'));
  const kategori = str(f.get('kategori'));
  if (pc < 1 || pc > locals.settings.jumlahPc) return redirect('/kontrak');
  run('INSERT INTO laporan_kerusakan(id, waktu, pc, kategori, deskripsi, status) VALUES (?,?,?,?,?,?)',
    randomId(7), nowWib(), pc, KATEGORI.includes(kategori) ? kategori : 'Lainnya', str(f.get('deskripsi')).slice(0, 500), 'pending');
  return redirect(`/kontrak?lapor=${pc}`);
};
