@echo off
title Sortirovka24 — подготовка к магазинам
cd /d "%~dp0"
echo.
echo === Store prep: env + screenshots + keystore check ===
echo.
call node scripts/store-prep.mjs
if errorlevel 1 (
  echo.
  echo Prep failed. If keystore missing: npm run setup:play-keystore
  pause
  exit /b 1
)
echo.
powershell -ExecutionPolicy Bypass -File scripts\pre-store-check.ps1
echo.
pause
