@echo off
cd /d "%~dp0"
title Dombla Web Dashboard Server
echo ============================================================
echo   Dombla Web Dashboard ^& MQTT Remote Bridge
echo ============================================================
echo.
echo Starting Node.js server at http://localhost:8000
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

start http://localhost:8000
node server.js
pause
