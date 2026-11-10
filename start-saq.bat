@echo off
REM ==== Menjalankan SAQ LAB (Astro) ====
REM Klik dua kali file ini, atau taruh shortcut-nya di folder Startup Windows
REM (Win+R -> shell:startup) supaya otomatis jalan saat PC server menyala.
cd /d "%~dp0"
if not exist "dist\server\entry.mjs" (
  echo Build belum ada, menjalankan npm run build ...
  call npm run build || pause
)
title SAQ LAB Server
call npm run start
pause
