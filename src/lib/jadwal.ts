import { all, get, run, tx, db } from './db';
import { nowWib, amanPath } from './util';

/**
 * Jadwal per semester = pusat data akademik.
 * Semua dropdown kelas (upload tugas, quiz, kontrak, materi) diambil dari sini.
 */

export const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const PERAN = ['PJ', 'Asisten 1', 'Asisten 2', 'Asisten 3'];
const MENIT_PER_SKS = 50;
const TOLERANSI_MENIT = 30;

export interface Semester { id: number; nama: string; aktif: number; created_at: string }
export interface Jadwal {
  id: number; semester_id: number; hari: number; jam_mulai: string; kelas: string; sks: number;
  matkul_id: number; nama_matkul: string; jurusan: string;
  dosen_id: number | null; nama_dosen: string | null;
  asisten: (string | null)[]; // [PJ, 1, 2, 3]
  asisten_id: (number | null)[];
}
export interface Slot { jadwal: Jadwal; tanggal: string; jam_mulai: string; pengganti?: { id: number; keterangan: string } }

export const listSemester = () => all<Semester>('SELECT * FROM semester ORDER BY id DESC');
export const semesterAktif = () => get<Semester>('SELECT * FROM semester WHERE aktif = 1 ORDER BY id DESC LIMIT 1');
export const listAsisten = (hanyaAktif = true) =>
  all<{ id: number; nama: string; aktif: number }>(`SELECT * FROM asisten ${hanyaAktif ? 'WHERE aktif = 1' : ''} ORDER BY nama COLLATE NOCASE`);

export function listJadwal(semesterId?: number): Jadwal[] {
  const sid = semesterId ?? semesterAktif()?.id;
  if (!sid) return [];
  return muatAsisten(all<Jadwal>(
    `SELECT j.*, m.nama_matkul, m.jurusan, d.nama_dosen FROM jadwal j
     JOIN matkul m ON m.id = j.matkul_id LEFT JOIN dosen d ON d.id = j.dosen_id
     WHERE j.semester_id = ? ORDER BY j.hari, j.jam_mulai, m.nama_matkul, j.kelas`, sid));
}

export function getJadwal(id: number): Jadwal | undefined {
  const j = get<Jadwal>(
    `SELECT j.*, m.nama_matkul, m.jurusan, d.nama_dosen FROM jadwal j
     JOIN matkul m ON m.id = j.matkul_id LEFT JOIN dosen d ON d.id = j.dosen_id WHERE j.id = ?`, id);
  return j ? muatAsisten([j])[0] : undefined;
}

function muatAsisten(list: Jadwal[]): Jadwal[] {
  if (!list.length) return list;
  const map = new Map(list.map((j) => [j.id, j]));
  for (const j of list) { j.asisten = [null, null, null, null]; j.asisten_id = [null, null, null, null]; }
  const ids = [...map.keys()];
  for (const r of all<{ jadwal_id: number; urutan: number; asisten_id: number; nama: string }>(
    `SELECT x.jadwal_id, x.urutan, x.asisten_id, a.nama FROM jadwal_asisten x JOIN asisten a ON a.id = x.asisten_id
     WHERE x.jadwal_id IN (${ids.map(() => '?').join(',')})`, ...ids)) {
    const j = map.get(r.jadwal_id);
    if (j && r.urutan >= 0 && r.urutan <= 3) { j.asisten[r.urutan] = r.nama; j.asisten_id[r.urutan] = r.asisten_id; }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Label & waktu
// ---------------------------------------------------------------------------
export const namaMatkul = (j: Pick<Jadwal, 'nama_matkul' | 'jurusan'>) => `${j.nama_matkul} (${j.jurusan})`;
export const labelKelas = (j: Pick<Jadwal, 'nama_matkul' | 'jurusan' | 'kelas'>) => `${namaMatkul(j)} — Kelas ${j.kelas}`;
export const labelWaktu = (j: Pick<Jadwal, 'hari' | 'jam_mulai'>) => `${HARI[j.hari]} ${j.jam_mulai}`;
export const labelLengkap = (j: Jadwal) => `${labelWaktu(j)} · ${labelKelas(j)}`;

export const keMenit = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
export const dariMenit = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const jamSelesai = (j: Pick<Jadwal, 'jam_mulai' | 'sks'>, mulai = j.jam_mulai) => dariMenit(keMenit(mulai) + j.sks * MENIT_PER_SKS);

/** Normalisasi '7:20', '07.20', '7:20:00' → '07:20' */
export function normalJam(s: string): string | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), i = Number(m[2]);
  return h < 24 && i < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}
export function hariDariTeks(s: string): number {
  const t = String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const idx = ['', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'].indexOf(t);
  return idx > 0 ? idx : 0;
}

function sekarangWib() {
  const s = nowWib();
  const [tgl, jam] = s.split(' ');
  const [y, m, d] = tgl.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Minggu
  return { tanggal: tgl, hari: dow === 0 ? 7 : dow, menit: keMenit(jam.slice(0, 5)) };
}
function awalMinggu(tanggal: string, hari: number) {
  const [y, m, d] = tanggal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - (hari - 1)));
  return t.toISOString().slice(0, 10);
}
function tambahHari(tanggal: string, n: number) {
  const [y, m, d] = tanggal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Slot kelas hari ini (jadwal reguler + kelas pengganti), lalu tentukan kelas default:
 * kelas yang sedang berjalan (mulai s/d selesai + 30 menit). Jika tidak ada → yang terdekat hari ini.
 */
export function kelasHariIni(semesterId?: number) {
  const now = sekarangWib();
  const semua = listJadwal(semesterId);
  const byId = new Map(semua.map((j) => [j.id, j]));
  const senin = awalMinggu(now.tanggal, now.hari);
  const minggu = tambahHari(senin, 6);
  const pengganti = all<{ id: number; jadwal_id: number; tanggal: string; jam_mulai: string; ganti_reguler: number; keterangan: string }>(
    'SELECT * FROM jadwal_pengganti WHERE tanggal BETWEEN ? AND ?', senin, minggu);
  const ditiadakan = new Set(pengganti.filter((p) => p.ganti_reguler).map((p) => p.jadwal_id));

  const slots: Slot[] = [];
  for (const j of semua) if (j.hari === now.hari && !ditiadakan.has(j.id)) slots.push({ jadwal: j, tanggal: now.tanggal, jam_mulai: j.jam_mulai });
  for (const p of pengganti) {
    const j = byId.get(p.jadwal_id);
    if (j && p.tanggal === now.tanggal) slots.push({ jadwal: j, tanggal: p.tanggal, jam_mulai: p.jam_mulai, pengganti: { id: p.id, keterangan: p.keterangan } });
  }
  slots.sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));

  let berjalan: Slot | null = null;
  let terdekat: Slot | null = null;
  let jarakMin = Infinity;
  for (const s of slots) {
    const mulai = keMenit(s.jam_mulai);
    const selesai = mulai + s.jadwal.sks * MENIT_PER_SKS + TOLERANSI_MENIT;
    if (now.menit >= mulai && now.menit < selesai) { berjalan = berjalan ?? s; continue; }
    const jarak = now.menit < mulai ? mulai - now.menit : now.menit - selesai;
    if (jarak < jarakMin) { jarakMin = jarak; terdekat = s; }
  }
  const pilihan = berjalan ?? terdekat;
  return { now, slots, berjalan, defaultJadwalId: pilihan?.jadwal.id ?? null, semua };
}

/** Data siap pakai untuk komponen dropdown kelas di browser. */
export function opsiKelas(semesterId?: number) {
  const { slots, berjalan, defaultJadwalId, semua } = kelasHariIni(semesterId);
  const kelasTugas = new Map(all<{ id: number; jadwal_id: number }>('SELECT id, jadwal_id FROM kelas_tugas WHERE jadwal_id IS NOT NULL').map((r) => [r.jadwal_id, r.id]));
  const kontrak = new Map(all<{ id: string; jadwal_id: number }>('SELECT id, jadwal_id FROM kontrak_kelas WHERE jadwal_id IS NOT NULL ORDER BY created_at').map((r) => [r.jadwal_id, r.id]));
  const item = (j: Jadwal) => ({
    id: j.id, kelasTugasId: kelasTugas.get(j.id) ?? null, kontrakId: kontrak.get(j.id) ?? null, label: labelKelas(j), matkul: namaMatkul(j), kelas: j.kelas,
    waktu: labelWaktu(j), selesai: jamSelesai(j), hari: j.hari, dosen: j.nama_dosen ?? '', pj: j.asisten[0] ?? '',
    cari: `${labelLengkap(j)} ${j.nama_dosen ?? ''} ${j.asisten.filter(Boolean).join(' ')}`.toLowerCase(),
  });
  return {
    berjalanId: berjalan?.jadwal.id ?? null,
    defaultId: defaultJadwalId,
    hariIni: slots.map((s) => ({ ...item(s.jadwal), waktu: `Hari ini ${s.jam_mulai}`, pengganti: s.pengganti?.keterangan ?? null })),
    semua: semua.map(item),
  };
}

// ---------------------------------------------------------------------------
// Master data: cari atau buat
// ---------------------------------------------------------------------------
const huruf = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function rapikanNama(s: string): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t !== t.toUpperCase()) return t; // sudah campuran huruf besar/kecil
  const kecil = new Set(['dan', 'di', 'ke', 'dari', 'untuk', 'yang', 'atau', 'pada']);
  return t.toLowerCase().split(' ').map((w, i) => {
    if (/^(i|ii|iii|iv|v|vi)$/.test(w)) return w.toUpperCase();
    if (i > 0 && kecil.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/** 'PEMROGRAMAN DASAR (SI)' → { nama: 'Pemrograman Dasar', jurusan: 'SI' } */
export function pecahMatkul(raw: string): { nama: string; jurusan: string | null } {
  const m = String(raw ?? '').match(/^(.*?)\s*\(\s*(SI|TI|IT|SD)\s*\)?\s*$/i);
  if (m) return { nama: rapikanNama(m[1]), jurusan: m[2].toUpperCase() === 'IT' ? 'TI' : m[2].toUpperCase() };
  return { nama: rapikanNama(raw), jurusan: null };
}

export function cariAtauBuatMatkul(nama: string, jurusan: string | null, sks = 3): number {
  const kandidat = all<{ id: number; jurusan: string }>('SELECT id, jurusan FROM matkul WHERE lower(trim(nama_matkul)) = ?', huruf(nama));
  if (jurusan) {
    const pas = kandidat.find((k) => normJur(k.jurusan) === jurusan);
    if (pas) return pas.id;
  } else if (kandidat.length) {
    // Tanpa label: utamakan TI; jika hanya ada satu (mis. KSI = SI), pakai itu.
    return (kandidat.find((k) => normJur(k.jurusan) === 'TI') ?? kandidat[0]).id;
  }
  return Number(run('INSERT INTO matkul(nama_matkul, sks, jurusan, semester) VALUES (?,?,?,1)', nama, sks, jurusan ?? 'TI').lastInsertRowid);
}
const normJur = (j: string) => { const u = (j || '').toUpperCase(); return u === 'IT' ? 'TI' : u; };

export function cariAtauBuatDosen(nama: string, jurusan = 'TI'): number | null {
  const n = String(nama ?? '').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  const ada = get<{ id: number }>('SELECT id FROM dosen WHERE lower(trim(nama_dosen)) = ?', huruf(n));
  if (ada) return ada.id;
  return Number(run('INSERT INTO dosen(nama_dosen, jurusan) VALUES (?,?)', n, jurusan).lastInsertRowid);
}

export function cariAtauBuatAsisten(nama: string): number | null {
  const n = rapikanNama(String(nama ?? '').replace(/[^\p{L} .'-]/gu, '').trim());
  if (!n || n === '-') return null;
  const ada = get<{ id: number }>('SELECT id FROM asisten WHERE nama = ? COLLATE NOCASE', n);
  if (ada) return ada.id;
  return Number(run('INSERT INTO asisten(nama) VALUES (?)', n).lastInsertRowid);
}

export function setAsistenJadwal(jadwalId: number, ids: (number | null)[]) {
  run('DELETE FROM jadwal_asisten WHERE jadwal_id = ?', jadwalId);
  const st = db.prepare('INSERT INTO jadwal_asisten(jadwal_id, urutan, asisten_id) VALUES (?,?,?)');
  ids.slice(0, 4).forEach((id, i) => { if (id) st.run(jadwalId, i, id); });
}

// ---------------------------------------------------------------------------
// Semester & sinkron kelas upload
// ---------------------------------------------------------------------------
const PALET = ['#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f97316', '#ec4899', '#14b8a6', '#6366f1', '#ea580c', '#be123c', '#0ea5e9', '#84cc16', '#d946ef', '#06b6d4', '#64748b'];

/** Pastikan setiap jadwal semester aktif punya "kelas upload"; kelas semester lain disembunyikan. */
export function sinkronKelasTugas() {
  const aktif = semesterAktif();
  tx(() => {
    run(`UPDATE kelas_tugas SET aktif = 0 WHERE jadwal_id IS NOT NULL AND jadwal_id NOT IN (SELECT id FROM jadwal WHERE semester_id = ?)`, aktif?.id ?? -1);
    if (!aktif) return;
    const warnaMatkul = new Map<number, string>();
    for (const j of listJadwal(aktif.id)) {
      if (!warnaMatkul.has(j.matkul_id)) warnaMatkul.set(j.matkul_id, PALET[warnaMatkul.size % PALET.length]);
      const nama = amanPath(`${j.nama_matkul} ${j.jurusan} - ${j.kelas} (${aktif.nama.replace('/', '-')})`, 120);
      const ada = get<{ id: number }>('SELECT id FROM kelas_tugas WHERE jadwal_id = ?', j.id);
      if (ada) run('UPDATE kelas_tugas SET nama = ?, aktif = 1, urutan = ? WHERE id = ?', nama, j.hari * 10000 + keMenit(j.jam_mulai), ada.id);
      else {
        const bentrok = get('SELECT 1 FROM kelas_tugas WHERE nama = ?', nama);
        run('INSERT INTO kelas_tugas(nama, warna, aktif, urutan, jadwal_id) VALUES (?,?,1,?,?)',
          bentrok ? `${nama} #${j.id}` : nama, warnaMatkul.get(j.matkul_id)!, j.hari * 10000 + keMenit(j.jam_mulai), j.id);
      }
      // Kelas kontrak tempat duduk ikut dibuat dari jadwal (PJ mengikuti jadwal)
      const mk = `${j.nama_matkul} - ${j.jurusan}`;
      const kk = get<{ id: string }>('SELECT id FROM kontrak_kelas WHERE jadwal_id = ?', j.id);
      if (kk) run('UPDATE kontrak_kelas SET mk = ?, nama = ?, asisten_pj = ? WHERE id = ?', mk, j.kelas, j.asisten[0] ?? '', kk.id);
      else run('INSERT INTO kontrak_kelas(id, mk, nama, koordinator_mk, asisten_pj, is_active, created_at, jadwal_id) VALUES (?,?,?,?,?,0,?,?)',
        `kelas_j${j.id}_${Date.now().toString(36)}`, mk, j.kelas, 'SAQ LABORATORY', j.asisten[0] ?? '', nowWib(), j.id);
    }
  });
}

export function aktifkanSemester(id: number) {
  tx(() => { run('UPDATE semester SET aktif = 0'); run('UPDATE semester SET aktif = 1 WHERE id = ?', id); });
  sinkronKelasTugas();
}

export function buatSemester(nama: string, salinDari?: number | null): number {
  const id = Number(run('INSERT INTO semester(nama, aktif, created_at) VALUES (?,0,?)', nama, nowWib()).lastInsertRowid);
  if (salinDari) {
    tx(() => {
      for (const j of listJadwal(salinDari)) {
        const baru = Number(run('INSERT INTO jadwal(semester_id, hari, jam_mulai, matkul_id, dosen_id, kelas, sks) VALUES (?,?,?,?,?,?,?)',
          id, j.hari, j.jam_mulai, j.matkul_id, j.dosen_id, j.kelas, j.sks).lastInsertRowid);
        setAsistenJadwal(baru, j.asisten_id);
      }
    });
  }
  return id;
}

export interface BarisImpor { hari: string; jam: string; matkul: string; dosen: string; kelas: string; sks: string | number; asisten: string[] }

/** Impor baris jadwal (dari Excel / data awal). Mengembalikan jumlah baris tersimpan + pesan. */
export function imporJadwal(semesterId: number, rows: BarisImpor[], ganti = false) {
  const pesan: string[] = [];
  let n = 0;
  tx(() => {
    if (ganti) run('DELETE FROM jadwal WHERE semester_id = ?', semesterId);
    let hariTerakhir = 0;
    rows.forEach((r, i) => {
      const hari = hariDariTeks(r.hari) || hariTerakhir; // sel HARI di Excel biasanya di-merge
      if (hariDariTeks(r.hari)) hariTerakhir = hari;
      const jam = normalJam(r.jam);
      const { nama, jurusan } = pecahMatkul(r.matkul);
      const kelas = String(r.kelas ?? '').trim().toUpperCase();
      const sks = parseInt(String(r.sks), 10) || 2;
      if (!hari || !jam || !nama || !kelas) { if (nama || jam) pesan.push(`Baris ${i + 1} dilewati (hari/jam/matkul/kelas tidak lengkap).`); return; }
      const matkulId = cariAtauBuatMatkul(nama, jurusan, sks);
      const jur = get<{ jurusan: string }>('SELECT jurusan FROM matkul WHERE id = ?', matkulId)!.jurusan;
      const dosenId = cariAtauBuatDosen(r.dosen, jur);
      const ada = get<{ id: number }>('SELECT id FROM jadwal WHERE semester_id = ? AND matkul_id = ? AND kelas = ?', semesterId, matkulId, kelas);
      let jid: number;
      if (ada) {
        run('UPDATE jadwal SET hari = ?, jam_mulai = ?, dosen_id = ?, sks = ? WHERE id = ?', hari, jam, dosenId, sks, ada.id);
        jid = ada.id;
      } else {
        jid = Number(run('INSERT INTO jadwal(semester_id, hari, jam_mulai, matkul_id, dosen_id, kelas, sks) VALUES (?,?,?,?,?,?,?)',
          semesterId, hari, jam, matkulId, dosenId, kelas, sks).lastInsertRowid);
      }
      setAsistenJadwal(jid, (r.asisten || []).slice(0, 4).map((a) => cariAtauBuatAsisten(a)));
      n++;
    });
  });
  sinkronKelasTugas();
  return { n, pesan };
}

// ---------------------------------------------------------------------------
// Data awal: Jadwal Ngawas Lab SAQ Ganjil 2026/2027
// ---------------------------------------------------------------------------
const SELY = 'Sely Karmila, S.Kom., M.Si';
const YESSY = 'Yessy Asri, ST., MMSI';
const ABDUR = 'Abdurrasyid, SKom., MMSI';
const TITI = 'Titi Okvita Dewi, ST., MT';
const JADWAL_AWAL: BarisImpor[] = [
  { hari: 'Senin', jam: '10:10', matkul: 'Algoritma dan Pemrograman I (TI)', dosen: SELY, kelas: 'C', sks: 3, asisten: ['Lewis', 'Arif', 'Bulan', 'Tria'] },
  { hari: 'Senin', jam: '13:00', matkul: 'Algoritma dan Pemrograman I (TI)', dosen: SELY, kelas: 'B', sks: 3, asisten: ['Haura', 'Nadil', 'Tria', 'Arya'] },
  { hari: 'Selasa', jam: '07:20', matkul: 'Pemrograman Dasar (SI)', dosen: 'Dr. Meilia Nur Indah S., ST., MKom', kelas: 'A', sks: 3, asisten: ['Danis', 'Lewis', 'Fira', ''] },
  { hari: 'Selasa', jam: '10:10', matkul: 'Pemrograman Aplikasi Bergerak (SI)', dosen: 'Afifah Nurlita Octaviasari, S.T., M.Kom', kelas: 'B', sks: 2, asisten: ['Khasyi', 'Fila', 'Gangsar', 'Petra'] },
  { hari: 'Selasa', jam: '13:00', matkul: 'Analisis dan Perancangan Sistem Informasi (SI)', dosen: YESSY, kelas: 'B', sks: 3, asisten: ['Tria', 'Ari', 'Danis', 'Adi'] },
  { hari: 'Rabu', jam: '10:10', matkul: 'Algoritma dan Pemrograman I (TI)', dosen: SELY, kelas: 'E', sks: 3, asisten: ['Syakir', 'Lewis', 'Bulan', 'Danis'] },
  { hari: 'Rabu', jam: '15:00', matkul: 'Analisis dan Perancangan Sistem Informasi (SI)', dosen: YESSY, kelas: 'A', sks: 3, asisten: ['Gangsar', 'Arya', 'Haura', 'Syakir'] },
  { hari: 'Kamis', jam: '07:20', matkul: 'Pemrograman Berorientasi Objek (SI)', dosen: ABDUR, kelas: 'B', sks: 3, asisten: ['Adi', 'Khasyi', 'Syakir', 'Fira'] },
  { hari: 'Kamis', jam: '10:10', matkul: 'Pemrograman Aplikasi Bergerak (SI)', dosen: 'Meilinda Devi Anjarwati, ST., M.Kom', kelas: 'A', sks: 2, asisten: ['Gangsar', 'Petra', 'Adi', ''] },
  { hari: 'Kamis', jam: '13:00', matkul: 'Algoritma dan Pemrograman I (TI)', dosen: SELY, kelas: 'D', sks: 3, asisten: ['Arya', 'Petra', 'Ridzieq', 'Fila'] },
  { hari: 'Jumat', jam: '07:20', matkul: 'Pemrograman Berorientasi Objek (TI)', dosen: ABDUR, kelas: 'C', sks: 2, asisten: ['Arif', 'Rafi', 'Haura', ''] },
  { hari: 'Jumat', jam: '09:10', matkul: 'Pemrograman Berorientasi Objek (TI)', dosen: ABDUR, kelas: 'D', sks: 2, asisten: ['Adi', 'Fira', 'Arif', 'Haura'] },
  { hari: 'Jumat', jam: '13:00', matkul: 'Analisis dan Perancangan Sistem Informasi (SI)', dosen: YESSY, kelas: 'C', sks: 3, asisten: ['Bulan', 'Arif', 'Khasyi', ''] },
  { hari: 'Sabtu', jam: '10:10', matkul: 'Keamanan Sistem Informasi (SI)', dosen: TITI, kelas: 'A', sks: 3, asisten: ['Fira', 'Khasyi', 'Fila', 'Lewis'] },
  { hari: 'Sabtu', jam: '13:00', matkul: 'Keamanan Sistem Informasi (SI)', dosen: TITI, kelas: 'B', sks: 3, asisten: ['Fila', 'Tasya', 'Naufal', 'Petra'] },
  { hari: 'Sabtu', jam: '15:30', matkul: 'Keamanan Sistem Informasi (SI)', dosen: TITI, kelas: 'C', sks: 3, asisten: ['Petra', 'Syakir', '', ''] },
  { hari: 'Sabtu', jam: '18:00', matkul: 'Keamanan Sistem Informasi (SI)', dosen: TITI, kelas: 'D', sks: 2, asisten: ['Gangsar', '', '', ''] },
];

export function seedJadwalAwal() {
  if (get('SELECT 1 FROM settings WHERE key = ?', '_seed_jadwal')) return;
  run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', '_seed_jadwal', 'true');
  if (get('SELECT 1 FROM semester')) return;
  const id = buatSemester('Ganjil 2026/2027');
  run('UPDATE semester SET aktif = 1 WHERE id = ?', id);
  imporJadwal(id, JADWAL_AWAL);
}
