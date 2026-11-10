import type { APIRoute } from 'astro';
import { get } from '../../../../lib/db';
import { pathFile, type SubFile, type Submission } from '../../../../lib/tugas';
import { kirimFile } from '../../../../lib/files';

export const GET: APIRoute = ({ params, url }) => {
  const f = get<SubFile>('SELECT * FROM submission_file WHERE id = ?', Number(params.id));
  if (!f) return new Response('File tidak ditemukan', { status: 404 });
  const s = get<Submission>('SELECT * FROM submission WHERE id = ?', f.submission_id)!;
  const abs = pathFile(s, f);
  if (!abs) return new Response('Path tidak valid', { status: 400 });
  const nama = `${s.nim}_${f.nama_asli}`;
  return kirimFile(abs, nama, url.searchParams.get('inline') === '1');
};
