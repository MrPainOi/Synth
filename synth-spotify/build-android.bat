@echo off
title Build Synth Spotify Android APK
echo ========================================================
echo   Building Synth 2: Spotify Edition for Android (.apk)  
echo ========================================================
cd /d "%~dp0"
node build-android.js
pause
