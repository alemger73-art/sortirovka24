@echo off
REM Sortirovka24 - one-click Android APK build (double-click to run)
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -File "%~dp0build-android.ps1"
if errorlevel 1 (
  echo.
  echo BUILD FAILED - see errors above.
  pause
  exit /b 1
)
echo.
echo Done. APK is in the releases folder.
pause
