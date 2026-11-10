@echo off
REM Jalankan setelah ada perubahan kode: install dependency + build ulang.
cd /d "%~dp0"
call npm install || goto :err
call npm run build || goto :err
echo.
echo Selesai. Tutup jendela server lama lalu jalankan start-saq.bat lagi.
pause
exit /b 0
:err
echo Terjadi error, cek pesan di atas.
pause
