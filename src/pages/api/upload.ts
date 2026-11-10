import type { APIRoute } from 'astro';
import { simpanSubmission, UploadError } from '../../lib/tugas';
import { hostnameDariIp } from '../../lib/auth';
import { fmtWaktu, fmtUkuran } from '../../lib/util';
import { getJadwal, labelKelas } from '../../lib/jadwal';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const s = locals.settings;
  const len = Number(request.headers.get('content-length') || 0);
  if (len > (s.maxTotalMb + 5) * 1024 * 1024) {
    return json({ status: 'error', message: `Total ukuran file melebihi ${s.maxTotalMb} MB.` }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ status: 'error', message: 'Data upload tidak terbaca. Coba ulangi.' }, 400);
  }
  try {
    const sesiRaw = String(form.get('sesi') || '');
    const hasil = await simpanSubmission({
      kelasId: parseInt(String(form.get('kelas') || '0'), 10),
      sesiId: /^\d+$/.test(sesiRaw) ? parseInt(sesiRaw, 10) : null,
      nim: String(form.get('nim') || ''),
      nama: String(form.get('nama') || ''),
      files: form.getAll('files').filter((f): f is File => f instanceof File),
      ip: locals.ip,
      hostname: await hostnameDariIp(locals.ip),
      userAgent: request.headers.get('user-agent') || '',
    });
    return json({
      status: 'success',
      message: 'Semua file berhasil dikumpulkan!',
      kode: hasil.kode,
      waktu: fmtWaktu(hasil.waktu, true),
      kelas: hasil.kelas.jadwal_id ? (() => { const j = getJadwal(hasil.kelas.jadwal_id!); return j ? labelKelas(j) : hasil.kelas.nama; })() : hasil.kelas.nama,
      sesi: hasil.sesi?.judul ?? null,
      terlambat: hasil.terlambat,
      versiKe: hasil.versiKe,
      files: hasil.files.map((f) => ({ nama: f.nama_asli, ukuran: fmtUkuran(f.ukuran) })),
    });
  } catch (e) {
    if (e instanceof UploadError) return json({ status: 'error', message: e.message }, 400);
    console.error('[upload]', e);
    return json({ status: 'error', message: 'Terjadi kesalahan di server. Silakan hubungi asisten lab.' }, 500);
  }
};
