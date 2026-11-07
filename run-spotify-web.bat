@echo off
cd /d "%~dp0"
echo ========================================================
echo Starting Synth 2 Web Server on http://127.0.0.1:3030...
echo ========================================================
node ./synth-spotify/server.js
pause
