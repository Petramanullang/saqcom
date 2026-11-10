import type { APIRoute } from 'astro';
import { all, get, run } from '../../lib/db';
import { randomId, bersihkanNama } from '../../lib/util';
import { getJadwal, labelKelas } from '../../lib/jadwal';

/**
 * API Quiz — kontrak request/response sama dengan admin/quiz/api.php versi lama,
 * supaya halaman Alpine yang lama tetap berjalan. Bedanya: aksi admin dikunci IP,
 * dan kunci jawaban TIDAK pernah dikirim ke mahasiswa sebelum submit.
 */
interface QuizRow { id: string; title: string; description: string; status: string; settings: string; questions: string; kelas_akses: string; created_at: string; updated_at: string }
interface SubRow { id: string; quiz_id: string; name: string; nim: string; score: number; total: number; percentage: number; passed: number; time_taken: number; answers: string; submitted_at: string }

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const isoNow = () => {
  // ISO 8601 dengan offset WIB, sama seperti date('c') di PHP lama
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 19) + '+07:00';
};
const KUNCI = ['correctAnswer', 'correctAnswers'];
/** Quiz tanpa daftar kelas = boleh semua kelas. */
const bolehAkses = (akses: number[], jadwalId: number) => !akses.length || akses.includes(jadwalId);
const namaKelasAkses = (akses: number[]) => akses.map((id) => { const j = getJadwal(id); return j ? labelKelas(j) : null; }).filter(Boolean) as string[];

function parseQuiz(r: QuizRow) {
  return { id: r.id, title: r.title, description: r.description, status: r.status, settings: JSON.parse(r.settings || '{}'), questions: JSON.parse(r.questions || '[]'), kelas_akses: (JSON.parse(r.kelas_akses || '[]') as number[]).map(Number), created_at: r.created_at, updated_at: r.updated_at };
}
const getQuizRow = (id: string) => get<QuizRow>('SELECT * FROM quiz WHERE id = ?', id);
const subsOf = (quizId: string) => all<SubRow>('SELECT * FROM quiz_submission WHERE quiz_id = ?', quizId).map((s) => ({ ...s, passed: !!s.passed, answers: JSON.parse(s.answers || '{}') }));

// ---------- Leaderboard (sama dengan versi PHP) ----------
type Sub = ReturnType<typeof subsOf>[number];
function bandingkan(a: Sub, b: Sub): number {
  if (a.percentage !== b.percentage) return a.percentage > b.percentage ? -1 : 1;
  if (a.score !== b.score) return a.score > b.score ? -1 : 1;
  const ta = a.time_taken ?? 999999999, tb = b.time_taken ?? 999999999;
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (a.submitted_at !== b.submitted_at) return a.submitted_at < b.submitted_at ? -1 : 1;
  return a.id.localeCompare(b.id);
}
function leaderboard(subs: Sub[], topN = 15) {
  const sorted = [...subs].sort(bandingkan);
  const rankById: Record<string, number> = {};
  let rank = 1;
  sorted.forEach((s, i) => {
    if (i > 0) {
      const p = sorted[i - 1];
      const seri = p.percentage === s.percentage && p.score === s.score && p.time_taken === s.time_taken && p.submitted_at === s.submitted_at;
      if (!seri) rank = i + 1;
    }
    rankById[s.id] = rank;
  });
  return {
    rankById,
    leaderboard: sorted.slice(0, topN).map((s, i) => ({ rank: rankById[s.id] ?? i + 1, name: s.name, nim: s.nim, percentage: s.percentage, score: s.score, total: s.total, time_taken: s.time_taken, id: s.id })),
  };
}

function nilai(q: any, ans: any): boolean {
  switch (q.type) {
    case 'multiple_choice':
    case 'dropdown':
      return ans !== null && ans !== undefined && ans !== '' && Number(ans) === Number(q.correctAnswer ?? -1);
    case 'checkbox': {
      const c = (q.correctAnswers || []).map(Number).sort();
      const g = (Array.isArray(ans) ? ans : ans == null ? [] : [ans]).map(Number).sort();
      return c.length === g.length && c.every((v: number, i: number) => v === g[i]);
    }
    case 'true_false':
      return String(ans ?? '') === String(q.correctAnswer ?? '');
    case 'short_answer':
    case 'fill_blank': {
      if (q.correctAnswer == null || q.correctAnswer === '') return false;
      const ok = String(q.correctAnswer).toLowerCase().split(',').map((x) => x.trim());
      return ok.includes(String(ans ?? '').toLowerCase().trim());
    }
    case 'rating':
    case 'date':
    case 'time':
      if (q.correctAnswer == null || q.correctAnswer === '') return false;
      return String(ans) === String(q.correctAnswer);
    default:
      return false; // essay: dinilai manual
  }
}

export const ALL: APIRoute = async ({ request, url, locals }) => {
  const action = url.searchParams.get('action') || '';
  const admin = locals.isAdmin;
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const butuhAdmin = ['list_quizzes', 'save_quiz', 'delete_quiz', 'set_status', 'list_submissions', 'get_submission', 'delete_submission'];
  if (butuhAdmin.includes(action) && !admin) return json({ ok: false, error: 'Akses khusus admin/asisten' }, 403);
  const butuhPost = ['save_quiz', 'delete_quiz', 'set_status', 'submit_quiz', 'delete_submission'];
  if (butuhPost.includes(action) && request.method !== 'POST') return json({ ok: false, error: 'POST required' }, 405);

  try {
    switch (action) {
      case 'list_quizzes': {
        const hitung = new Map(all<{ quiz_id: string; c: number }>('SELECT quiz_id, COUNT(*) c FROM quiz_submission GROUP BY quiz_id').map((r) => [r.quiz_id, r.c]));
        const quizzes = all<QuizRow>('SELECT * FROM quiz ORDER BY updated_at DESC').map((r) => {
          const q = parseQuiz(r);
          return { id: q.id, title: q.title, description: q.description, status: q.status, question_count: q.questions.length, time_limit: Number(q.settings.timeLimit || 0), created_at: q.created_at, updated_at: q.updated_at, submission_count: hitung.get(q.id) || 0, kelas_akses: namaKelasAkses(q.kelas_akses) };
        });
        return json({ ok: true, quizzes });
      }
      case 'list_open_quizzes': {
        const hitung = new Map(all<{ quiz_id: string; c: number }>('SELECT quiz_id, COUNT(*) c FROM quiz_submission GROUP BY quiz_id').map((r) => [r.quiz_id, r.c]));
        const kelas = Number(url.searchParams.get('kelas')) || 0;
        const quizzes = all<QuizRow>("SELECT * FROM quiz WHERE status = 'open' ORDER BY updated_at DESC").map(parseQuiz)
          .filter((q) => !kelas || bolehAkses(q.kelas_akses, kelas)).map((q) => {
          return { kelas_akses: namaKelasAkses(q.kelas_akses), id: q.id, title: q.title, description: q.description, question_count: q.questions.length, time_limit: Number(q.settings.timeLimit || 0), submission_count: hitung.get(q.id) || 0, updated_at: q.updated_at };
        });
        return json({ ok: true, quizzes });
      }
      case 'get_quiz': {
        const r = getQuizRow(url.searchParams.get('id') || '');
        if (!r) return json({ ok: false, error: 'Quiz tidak ditemukan' });
        const quiz = parseQuiz(r);
        const kelasMhs = Number(url.searchParams.get('kelas')) || 0;
        if (!admin && quiz.kelas_akses.length && !bolehAkses(quiz.kelas_akses, kelasMhs)) {
          return json({ ok: false, error: `Quiz ini hanya untuk: ${namaKelasAkses(quiz.kelas_akses).join(', ')}. Pilih kelas Anda di halaman Quiz.` });
        }
        if (!admin) {
          if (quiz.status !== 'open') return json({ ok: false, error: quiz.status === 'locked' ? 'Quiz sedang dikunci oleh asisten.' : 'Quiz belum dibuka atau sudah ditutup.' });
          quiz.questions = quiz.questions.map((q: any) => { const c = { ...q }; for (const k of KUNCI) delete c[k]; return c; });
        }
        return json({ ok: true, quiz });
      }
      case 'save_quiz': {
        if (!String(body.title || '').trim()) return json({ ok: false, error: 'Judul quiz wajib diisi' });
        const isNew = !body.id;
        const id = isNew ? randomId(8) : String(body.id).replace(/[^a-f0-9]/g, '');
        const lama = isNew ? undefined : getQuizRow(id);
        const st = body.settings || {};
        const settings = {
          timeLimit: Number(st.timeLimit) || 0, shuffleQuestions: !!st.shuffleQuestions, shuffleOptions: !!st.shuffleOptions,
          showResults: st.showResults !== false, showCorrectAnswers: st.showCorrectAnswers !== false, allowRetake: !!st.allowRetake,
          passingScore: Number(st.passingScore) || 0,
        };
        const now = isoNow();
        const status = ['draft', 'open', 'locked', 'closed'].includes(body.status) ? body.status : 'draft';
        const questions = Array.isArray(body.questions) ? body.questions : [];
        const kelasAkses = (Array.isArray(body.kelas_akses) ? body.kelas_akses : []).map(Number).filter((id: number) => id > 0 && getJadwal(id));
        if (lama) {
          run('UPDATE quiz SET title = ?, description = ?, status = ?, settings = ?, questions = ?, kelas_akses = ?, updated_at = ? WHERE id = ?',
            String(body.title).trim(), String(body.description || '').trim(), status, JSON.stringify(settings), JSON.stringify(questions), JSON.stringify(kelasAkses), now, id);
        } else {
          run('INSERT INTO quiz(id, title, description, status, settings, questions, kelas_akses, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
            id, String(body.title).trim(), String(body.description || '').trim(), status, JSON.stringify(settings), JSON.stringify(questions), JSON.stringify(kelasAkses), now, now);
        }
        return json({ ok: true, id, created: !lama });
      }
      case 'delete_quiz':
        run('DELETE FROM quiz WHERE id = ?', String(body.id || ''));
        return json({ ok: true });
      case 'set_status': {
        if (!['draft', 'open', 'locked', 'closed'].includes(body.status)) return json({ ok: false, error: 'Invalid id or status' });
        const r = run('UPDATE quiz SET status = ?, updated_at = ? WHERE id = ?', body.status, isoNow(), String(body.id || ''));
        return Number(r.changes) ? json({ ok: true, status: body.status }) : json({ ok: false, error: 'Quiz not found' });
      }
      case 'submit_quiz': {
        const r = getQuizRow(String(body.quiz_id || ''));
        if (!r) return json({ ok: false, error: 'Quiz tidak ditemukan' });
        const quiz = parseQuiz(r);
        if (quiz.status !== 'open' && !admin) return json({ ok: false, error: 'Quiz sudah ditutup. Jawaban tidak dapat dikirim.' });
        const jadwalId = Number(body.kelas) || 0;
        if (!admin && quiz.kelas_akses.length && !bolehAkses(quiz.kelas_akses, jadwalId)) return json({ ok: false, error: 'Quiz ini bukan untuk kelas Anda.' });
        const nim = String(body.nim || '').replace(/\s/g, '').slice(0, 20);
        const name = bersihkanNama(String(body.name || 'Anonim')) || 'Anonim';
        if (nim && !quiz.settings.allowRetake && get('SELECT 1 FROM quiz_submission WHERE quiz_id = ? AND nim = ?', quiz.id, nim)) {
          return json({ ok: false, error: `NIM ${nim} sudah mengerjakan quiz ini. Pengulangan tidak diizinkan.` });
        }
        const answers = body.answers || {};
        let total = 0, earned = 0;
        const graded: Record<string, any> = {};
        for (const q of quiz.questions) {
          const benar = nilai(q, answers[q.id]);
          const pts = Number(q.points) || 1;
          total += pts;
          if (benar) earned += pts;
          graded[q.id] = { answer: answers[q.id] ?? null, correct: benar, earned: benar ? pts : 0, points: pts };
        }
        const percentage = total > 0 ? Math.round((earned / total) * 1000) / 10 : 0;
        const passed = quiz.settings.passingScore > 0 ? percentage >= quiz.settings.passingScore : true;
        const id = randomId(8);
        const time_taken = Math.max(0, Number(body.time_taken) || 0);
        run('INSERT INTO quiz_submission(id, quiz_id, name, nim, score, total, percentage, passed, time_taken, answers, ip, submitted_at, jadwal_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          id, quiz.id, name, nim, earned, total, percentage, passed ? 1 : 0, time_taken, JSON.stringify(graded), locals.ip, isoNow(), jadwalId || null);
        const answer_key = quiz.settings.showCorrectAnswers
          ? Object.fromEntries(quiz.questions.map((q: any) => [q.id, Object.fromEntries(KUNCI.filter((k) => k in q).map((k) => [k, q[k]]))]))
          : undefined;
        return json({ ok: true, submission_id: id, score: earned, total, percentage, passed, time_taken, graded, answer_key });
      }
      case 'list_submissions': {
        const quizId = url.searchParams.get('quiz_id') || '';
        const subs = subsOf(quizId);
        const lb = leaderboard(subs);
        const light = subs.map((s) => ({ id: s.id, name: s.name, nim: s.nim, score: s.score, total: s.total, percentage: s.percentage, passed: s.passed, time_taken: s.time_taken, submitted_at: s.submitted_at, rank: lb.rankById[s.id] ?? null }))
          .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
        return json({ ok: true, submissions: light, leaderboard: lb.leaderboard, total_count: subs.length });
      }
      case 'get_submission': {
        const quizId = url.searchParams.get('quiz_id') || '';
        const subs = subsOf(quizId);
        const s = subs.find((x) => x.id === url.searchParams.get('sub_id'));
        if (!s) return json({ ok: false, error: 'Submission not found' });
        const r = getQuizRow(quizId);
        const lb = leaderboard(subs);
        return json({ ok: true, submission: s, quiz: r ? parseQuiz(r) : {}, rank: lb.rankById[s.id] ?? null, total_count: subs.length, leaderboard: lb.leaderboard });
      }
      case 'delete_submission':
        run('DELETE FROM quiz_submission WHERE id = ? AND quiz_id = ?', String(body.sub_id || ''), String(body.quiz_id || ''));
        return json({ ok: true });
      default:
        return json({ ok: false, error: 'Unknown action' }, 400);
    }
  } catch (e: any) {
    console.error('[quiz]', e);
    return json({ ok: false, error: e?.message || 'Server error' }, 500);
  }
};
