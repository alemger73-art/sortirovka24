@echo off
title Sortirovka24 — сборка AAB для Google Play
cd /d "%~dp0"
echo.
echo === Release AAB for Google Play ===
echo.
call node scripts/store-prep.mjs
if errorlevel 1 (
  echo Keystore missing. Run: npm run setup:play-keystore
  pause
  exit /b 1
)
powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)
echo.
echo Ready: releases\Sortirovka24-release.aab
echo Upload to Play Console - see play-store\UPLOAD_PACK.md
echo.
pause
