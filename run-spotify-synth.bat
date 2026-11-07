@echo off
cd /d "%~dp0"
echo ========================================================
echo Starting Synth 2 (Spotify Edition) Desktop App...
echo ========================================================
if exist ".\node_modules\electron\dist\electron.exe" (
  ".\node_modules\electron\dist\electron.exe" ./synth-spotify/main.js
) else (
  npx electron ./synth-spotify/main.js
)
