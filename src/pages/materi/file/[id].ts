import type { APIRoute } from 'astro';
import { get } from '../../../lib/db';
import { pathMateri, type Materi, type MateriGrup } from '../../../lib/materi';
import { kirimFile } from '../../../lib/files';

export const GET: APIRoute = ({ params, locals, url }) => {
  const m = get<Materi>('SELECT * FROM materi WHERE id = ?', Number(params.id));
  if (!m) return new Response('Materi tidak ditemukan', { status: 404 });
  const g = get<MateriGrup>('SELECT * FROM materi_grup WHERE id = ?', m.grup_id);
  if (g?.is_locked && !locals.isAdmin) return new Response('Akses materi ini sedang dikunci oleh asisten.', { status: 403 });
  const abs = pathMateri(m);
  if (!abs) return new Response('Path tidak valid', { status: 400 });
  return kirimFile(abs, m.nama_asli || m.nama_file, url.searchParams.get('inline') === '1');
};
