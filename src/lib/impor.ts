import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, get, run, tx } from './db';
import { UPLOAD_DIR, MATERI_DIR } from './config';
import { amanPath, nowWib } from './util';

/**
 * Impor data dari aplikasi PHP lama (folder htdocs/saq).
 * Aman dijalankan berulang kali: data yang sudah ada tidak diduplikasi.
 */
export interface LaporanImpor { ok: boolean; pesan: string[]; jumlah: Record<string, number> }

const readJson = (p: string) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
};
const decode = (s: any) => String(s ?? '')
  .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function cekFolderLama(dir: string): string | null {
  if (!dir || !fs.existsSync(dir)) return 'Folder tidak ditemukan.';
  const tanda = ['config.php', 'upload.php', 'KONTRAK', 'admin'];
  if (!tanda.some((t) => fs.existsSync(path.join(dir, t)))) return 'Folder ini sepertinya bukan project SAQ PHP (tidak ada config.php / KONTRAK / admin).';
  return null;
}

export function imporDariPhp(dirInput: string): LaporanImpor {
  const dir = path.resolve(dirInput);
  const err = cekFolderLama(dir);
  if (err) return { ok: false, pesan: [err], jumlah: {} };
  const J: Record<string, number> = {};
  const P: string[] = [];
  const tambah = (k: string, n = 1) => (J[k] = (J[k] || 0) + n);

  // ---------- 1. Kelas upload dari config.php ----------
  const warnaKelas = new Map<string, string>();
  const cfg = path.join(dir, 'config.php');
  if (fs.existsSync(cfg)) {
    const src = fs.readFileSync(cfg, 'utf8');
    for (const m of src.matchAll(/'([A-Za-z0-9_]+)'\s*=>\s*'(#[0-9a-fA-F]{6})'/g)) warnaKelas.set(m[1], m[2]);
    const ipBlock = src.match(/ADMIN_ASISTEN_IPS'\s*,\s*\[([\s\S]*?)\]/);
    if (ipBlock) {
      const ips = [...ipBlock[1].matchAll(/'([0-9a-fA-F.:]+)'/g)].map((m) => m[1]).filter((x) => !['127.0.0.1', '::1'].includes(x));
      if (ips.length) P.push(`IP admin di config.php lama: ${ips.join(', ')} (cek di Pengaturan).`);
    }
  }
  const pastikanKelas = (nama: string) => {  // kelas lama → disembunyikan dari form (aktif = 0)
    const ada = get<{ id: number }>('SELECT id FROM kelas_tugas WHERE nama = ?', nama);
    if (ada) return ada.id;
    const urutan = get<{ m: number }>('SELECT COALESCE(MAX(urutan),0)+1 m FROM kelas_tugas')!.m;
    tambah('kelas upload');
    return Number(run('INSERT INTO kelas_tugas(nama, warna, urutan, aktif) VALUES (?,?,?,0)', nama, warnaKelas.get(nama) || '#64748b', urutan).lastInsertRowid);
  };
  for (const nama of warnaKelas.keys()) pastikanKelas(nama);

  tx(() => {
    // ---------- 2. Dosen & Matkul (dicocokkan berdasarkan nama, bukan id) ----------
    for (const d of readJson(path.join(dir, 'admin/data/dosen.json')) || []) {
      const nama = decode(d.nama_dosen).trim();
      if (nama && !get('SELECT 1 FROM dosen WHERE lower(trim(nama_dosen)) = lower(?)', nama)) { run('INSERT INTO dosen(nama_dosen, jurusan) VALUES (?,?)', nama, decode(d.jurusan)); tambah('dosen'); }
    }
    for (const m of readJson(path.join(dir, 'admin/data/matkul.json')) || []) {
      const nama = decode(m.nama_matkul).trim();
      const jur = decode(m.jurusan).trim().toUpperCase() === 'IT' ? 'TI' : decode(m.jurusan).trim();
      if (nama && !get('SELECT 1 FROM matkul WHERE lower(trim(nama_matkul)) = lower(?) AND jurusan = ?', nama, jur)) { run('INSERT INTO matkul(nama_matkul, sks, jurusan, semester) VALUES (?,?,?,?)', nama, m.sks || 2, jur, m.semester || 1); tambah('mata kuliah'); }
    }

    // ---------- 3. Materi (grup lama, tanpa jadwal) ----------
    const materi = readJson(path.join(dir, 'download-files/data/materi.json'));
    for (const g of materi?.matakuliah || []) {
      const kunci = [decode(g.nama_matkul), decode(g.nama_dosen), decode(g.jurusan), decode(g.kelas || '')];
      let grupId = get<{ id: number }>('SELECT id FROM materi_grup WHERE nama_matkul = ? AND nama_dosen = ? AND jurusan = ? AND kelas = ? AND jadwal_id IS NULL', ...kunci)?.id;
      if (!grupId) {
        grupId = Number(run('INSERT INTO materi_grup(nama_matkul, nama_dosen, jurusan, kelas, semester, sks, is_locked) VALUES (?,?,?,?,?,?,?)',
          ...kunci, g.semester ?? null, g.sks ?? null, g.is_locked ? 1 : 0).lastInsertRowid);
        tambah('grup materi');
      }
      for (const m of g.materi || []) {
        const nama = amanPath(m.nama_file, 200);
        if (get('SELECT 1 FROM materi WHERE nama_file = ?', nama)) continue;
        const src = path.join(dir, 'download-files/uploads', m.nama_file);
        let ukuran = 0;
        if (fs.existsSync(src)) {
          const dst = path.join(MATERI_DIR, nama);
          if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
          ukuran = fs.statSync(dst).size;
        } else P.push(`File materi hilang: ${m.nama_file}`);
        run('INSERT INTO materi(grup_id, judul_materi, nama_file, nama_asli, ukuran, created_at) VALUES (?,?,?,?,?,?)',
          grupId, decode(m.judul_materi), nama, m.nama_file.replace(/^[0-9a-f]{13}_/, ''), ukuran, nowWib());
        tambah('file materi');
      }
    }

    // ---------- 4. Kontrak ----------
    const kdir = path.join(dir, 'KONTRAK/data');
    const classes = readJson(path.join(kdir, 'classes.json')) || {};
    for (const [id, c] of Object.entries<any>(classes)) {
      if (!get('SELECT 1 FROM kontrak_kelas WHERE id = ?', id)) {
        const ts = Number(id.replace(/\D/g, ''));
        run('INSERT INTO kontrak_kelas(id, mk, nama, koordinator_mk, asisten_pj, is_active, created_at) VALUES (?,?,?,?,?,?,?)',
          id, decode(c.mk), decode(c.nama), decode(c.koordinator_mk || 'SAQ LABORATORY'), decode(c.asisten_pj || ''), 0, ts ? nowWib(new Date(ts * 1000)) : nowWib());
        tambah('kelas kontrak');
      }
      const kursi = readJson(path.join(kdir, `kontrak_${id}.json`)) || {};
      for (const [no, k] of Object.entries<any>(kursi)) {
        if (k?.status !== 'terisi' || !k.nim) continue;
        if (get('SELECT 1 FROM kontrak_kursi WHERE kelas_id = ? AND no_pc = ?', id, Number(no))) continue;
        run('INSERT INTO kontrak_kursi(kelas_id, no_pc, nim, nama, janji, waktu_kontrak, ip_address) VALUES (?,?,?,?,?,?,?)',
          id, Number(no), String(k.nim), decode(k.nama), k.janji ? 1 : 0, k.waktu_kontrak || nowWib(), k.ip_address || '');
        tambah('kursi kontrak');
      }
    }
    for (const l of readJson(path.join(kdir, 'laporan_kerusakan.json')) || []) {
      if (get('SELECT 1 FROM laporan_kerusakan WHERE id = ?', l.id)) continue;
      run('INSERT INTO laporan_kerusakan(id, waktu, pc, kategori, deskripsi, status) VALUES (?,?,?,?,?,?)', l.id, l.waktu, l.pc, decode(l.kategori), decode(l.deskripsi), l.status || 'pending');
      tambah('laporan kerusakan');
    }

    // ---------- 5. Quiz ----------
    const qdir = path.join(dir, 'admin/quiz/data');
    if (fs.existsSync(qdir)) {
      for (const f of fs.readdirSync(qdir).filter((x) => /^quiz_[a-f0-9]+\.json$/.test(x))) {
        const q = readJson(path.join(qdir, f));
        if (!q?.id) continue;
        if (!get('SELECT 1 FROM quiz WHERE id = ?', q.id)) {
          run('INSERT INTO quiz(id, title, description, status, settings, questions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
            q.id, q.title || 'Quiz', q.description || '', q.status || 'draft', JSON.stringify(q.settings || {}), JSON.stringify(q.questions || []), q.created_at || nowWib(), q.updated_at || nowWib());
          tambah('quiz');
        }
        for (const s of readJson(path.join(qdir, 'submissions', f)) || []) {
          if (!s?.id || get('SELECT 1 FROM quiz_submission WHERE id = ?', s.id)) continue;
          run('INSERT INTO quiz_submission(id, quiz_id, name, nim, score, total, percentage, passed, time_taken, answers, submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            s.id, q.id, s.name || 'Anonim', s.nim || '', s.score || 0, s.total || 0, s.percentage || 0, s.passed === false ? 0 : 1, s.time_taken || 0, JSON.stringify(s.answers || {}), s.submitted_at || nowWib());
          tambah('jawaban quiz');
        }
      }
    }
  });

  // ---------- 6. Upload tugas mahasiswa ----------
  const udir = path.join(dir, 'uploads');
  if (fs.existsSync(udir)) {
    for (const kelasNama of fs.readdirSync(udir)) {
      const kpath = path.join(udir, kelasNama);
      if (!fs.statSync(kpath).isDirectory() || kelasNama.startsWith('.')) continue;
      const kelasId = pastikanKelas(kelasNama);
      for (const folder of fs.readdirSync(kpath)) {
        const fpath = path.join(kpath, folder);
        if (!fs.statSync(fpath).isDirectory()) continue;
        const rel = path.posix.join('impor', amanPath(kelasNama), amanPath(folder));
        if (get('SELECT 1 FROM submission WHERE folder = ?', rel)) continue;
        const files = fs.readdirSync(fpath).filter((x) => x !== 'metadata.json' && !x.startsWith('.') && fs.statSync(path.join(fpath, x)).isFile());
        if (!files.length) continue;
        const meta = readJson(path.join(fpath, 'metadata.json')) || {};
        const username = String(meta.username || folder.split('_')[0] || '');
        // Cari NIM di username, lalu di nama file
        let nim = (username.match(/\d{8,13}/) || [])[0] || '';
        let nama = username.replace(/\d{8,13}/, '').replace(/[_]+/g, ' ').trim();
        if (!nim) {
          for (const f of files) {
            const m = f.match(/(\d{8,13})_([^_]+)/);
            if (m) { nim = m[1]; nama = m[2].trim(); break; }
          }
        }
        if (!nama) nama = username || 'Tanpa Nama';
        if (!nim) nim = username.replace(/\W/g, '').slice(0, 15) || 'TANPA-NIM';
        const waktu = String(meta.upload_time || '').match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
          ? meta.upload_time
          : (() => { const m = folder.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})$/); return m ? `${m[1]} ${m[2]}:${m[3]}:${m[4]}` : nowWib(); })();
        const dst = path.join(UPLOAD_DIR, rel);
        fs.mkdirSync(dst, { recursive: true });
        const saved: { asli: string; simpan: string; ukuran: number; sha: string }[] = [];
        const prefix = username.replace(/[^a-zA-Z0-9]/g, '_') + '_';
        for (const f of files) {
          const simpan = amanPath(f, 200);
          fs.copyFileSync(path.join(fpath, f), path.join(dst, simpan));
          const buf = fs.readFileSync(path.join(dst, simpan));
          saved.push({ asli: f.startsWith(prefix) ? f.slice(prefix.length) : f, simpan, ukuran: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex') });
        }
        tx(() => {
          const kode = 'L' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 7);
          const r = run(`INSERT INTO submission(kode, kelas_id, sesi_id, nim, nama, hostname, ip, user_agent, folder, terlambat, impor, created_at)
            VALUES (?,?,NULL,?,?,?,?,?,?,0,1,?)`, kode, kelasId, nim, nama.toUpperCase(), String(meta.hostname || ''), String(meta.ip_address || ''), String(meta.user_agent || '').slice(0, 300), rel, waktu);
          const st = db.prepare('INSERT INTO submission_file(submission_id, nama_asli, nama_simpan, ukuran, sha256) VALUES (?,?,?,?,?)');
          for (const s of saved) st.run(Number(r.lastInsertRowid), s.asli, s.simpan, s.ukuran, s.sha);
        });
        tambah('pengumpulan tugas');
      }
    }
  }

  const total = Object.values(J).reduce((a, b) => a + b, 0);
  P.unshift(total ? 'Impor selesai.' : 'Tidak ada data baru — semua data lama sudah pernah diimpor.');
  return { ok: true, pesan: P, jumlah: J };
}
