@echo off
cd /d "%~dp0"
title Sortirovka24 APK Build
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-android-build-once.ps1"
if errorlevel 1 goto fail
set "APK=%~dp0app\frontend\releases\Sortirovka24-latest-debug.apk"
if not exist "%APK%" goto fail
echo.
echo BUILD OK
explorer /select,"%APK%"
pause
exit /b 0

:fail
echo BUILD FAILED - see build-log.txt
pause
exit /b 1
