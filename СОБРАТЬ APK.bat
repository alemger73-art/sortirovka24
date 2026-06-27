@echo off
cd /d "%~dp0"
title Sortirovka24 APK Build v1.0.25
echo.
echo ========================================
echo   Sortirovka24 - APK build
echo   Version 1.0.25
echo   First run may install npm packages (5 min)
echo   Then build 10-15 min. Do not close.
echo ========================================
echo.
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install Node.js 20+ then run: npm install -g pnpm
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-android-build-once.ps1"
if errorlevel 1 goto fail
set "APK=%~dp0app\frontend\releases\Sortirovka24-latest-debug.apk"
if not exist "%APK%" goto fail
echo.
echo [OK] APK ready:
echo %APK%
explorer /select,"%APK%"
pause
exit /b 0

:fail
echo.
echo [ERROR] Build failed. Open build-log.txt in project root.
pause
exit /b 1
