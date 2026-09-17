@echo off
cd /d "%~dp0"
title Dombla Desktop App
echo ========================================
echo   Dombla Desktop App
echo ========================================
echo.
echo Starting Electron app...
echo.
npx electron .
pause
