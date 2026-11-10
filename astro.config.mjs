// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: true, port: 4321 },
  // Proteksi CSRF dilakukan sendiri di src/middleware.ts (membandingkan Origin dengan Host),
  // karena pengecekan bawaan Astro tidak membaca port/IP LAN tanpa daftar domain.
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ['node:sqlite'] },
  },
});
