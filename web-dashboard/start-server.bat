@echo off
title Dombla Web Dashboard Server
echo ========================================
echo   Dombla Web Dashboard Server
echo ========================================
echo.
echo Starting server at http://localhost:8000
echo Press Ctrl+C to stop the server.
echo.
start http://localhost:8000
python -m http.server 8000
pause
