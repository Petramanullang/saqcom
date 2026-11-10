import type { APIRoute } from 'astro';
import { bacaFilter, cariSubmission, getSubmissionsByIds, kelompokkan, listKelas, listSesi, pathFile, type Submission } from '../../../lib/tugas';
import { kirimZip, type EntriZip } from '../../../lib/files';
import { amanPath, todayWib } from '../../../lib/util';

/**
 * /admin/tugas/zip?ids=1,2,3             → pengumpulan tertentu
 * /admin/tugas/zip?<filter>&versi=semua  → semua hasil filter (default: hanya versi terbaru)
 */
export const GET: APIRoute = ({ url }) => {
  const kelas = new Map(listKelas().map((k) => [k.id, k.nama]));
  const sesi = new Map(listSesi().map((s) => [s.id, s.judul]));
  const idsParam = url.searchParams.get('ids');
  const semuaVersi = url.searchParams.get('versi') === 'semua';

  let subs: Submission[];
  if (idsParam) {
    subs = getSubmissionsByIds(idsParam.split(',').map(Number).filter(Boolean).slice(0, 2000));
  } else {
    const f = bacaFilter(url);
    const all = cariSubmission(f);
    subs = semuaVersi ? all : kelompokkan(all).grup.map((g) => g.utama);
  }
  if (!subs.length) return new Response('Tidak ada file untuk diunduh pada filter ini.', { status: 404 });

  // Hitung versi per (konteks+nim) agar versi lama diberi label v1, v2, …
  const urut = [...subs].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const versi = new Map<number, number>();
  const hit = new Map<string, number>();
  for (const s of urut) {
    const k = `${s.kelas_id}|${s.sesi_id ?? s.created_at.slice(0, 10)}|${s.nim}`;
    const n = (hit.get(k) || 0) + 1;
    hit.set(k, n);
    versi.set(s.id, n);
  }
  const adaGanda = [...hit.values()].some((n) => n > 1);

  const entri: EntriZip[] = [];
  for (const s of subs) {
    const k = amanPath(kelas.get(s.kelas_id) || 'kelas');
    const ses = amanPath(s.sesi_id ? sesi.get(s.sesi_id) || `sesi-${s.sesi_id}` : `Umum ${s.created_at.slice(0, 10)}`);
    let mhs = amanPath(`${s.nim}_${s.nama}`);
    if (adaGanda) mhs += `/v${versi.get(s.id)}_${s.created_at.slice(0, 16).replace(/[: ]/g, '-')}`;
    for (const f of s.files) {
      const abs = pathFile(s, f);
      if (abs) entri.push({ path: `${k}/${ses}/${mhs}/${amanPath(f.nama_asli)}`, abs });
    }
  }
  const satuKelas = new Set(subs.map((s) => s.kelas_id)).size === 1 ? kelas.get(subs[0].kelas_id) : 'Semua-Kelas';
  const nama = subs.length === 1
    ? `${subs[0].nim}_${amanPath(subs[0].nama)}.zip`
    : `Tugas_${amanPath(satuKelas || 'SAQ')}_${todayWib()}.zip`;
  return kirimZip(nama, entri);
};
