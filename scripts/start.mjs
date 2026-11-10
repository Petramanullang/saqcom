// Menjalankan server produksi SAQ LAB.
//   npm run start            → http://0.0.0.0:4321
//   PORT=8080 npm run start  → port lain
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.TZ ||= 'Asia/Jakarta';
process.env.HOST ||= '0.0.0.0';
process.env.PORT ||= '4321';
// Sembunyikan peringatan "SQLite is an experimental feature" dari Node 22.
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const entry = path.join(root, 'dist', 'server', 'entry.mjs');
if (!fs.existsSync(entry)) {
  console.error('\n[SAQ] Build belum ada. Jalankan dulu:  npm run build\n');
  process.exit(1);
}
console.log(`\n[SAQ] Server berjalan di http://${process.env.HOST}:${process.env.PORT}  (data: ${process.env.SAQ_DATA_DIR || path.join(root, 'data')})\n`);
await import(pathToFileURL(entry).href);
