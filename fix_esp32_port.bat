@echo off
title ESP32 Port Fixer
cd /d "%~dp0"

:: Check for administrative permissions
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Resolving ESP32 COM Port conflict...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix_esp32_port.ps1"
echo.
echo ========================================================
echo Done! You can now unplug and replug your ESP32 USB cable.
echo ========================================================
pause
