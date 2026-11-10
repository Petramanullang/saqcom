import type { APIRoute } from 'astro';
import { kelasAktif, petaKursi } from '../../../lib/kontrak';

export const GET: APIRoute = ({ locals }) => {
  const aktif = kelasAktif();
  const body = aktif ? petaKursi(aktif.id, locals.settings.jumlahPc) : { error: 'Tidak ada sesi aktif' };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
