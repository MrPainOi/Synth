@echo off
title Build Synth Spotify Android APK
cd /d "%~dp0synth-spotify"
node build-android.js
pause
