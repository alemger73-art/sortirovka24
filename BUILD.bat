@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-android-build-once.ps1"
if errorlevel 1 (
  echo.
  echo BUILD FAILED. See build-log.txt
  pause
  exit /b 1
)
echo.
echo BUILD OK. Files in app\frontend\releases\
pause
