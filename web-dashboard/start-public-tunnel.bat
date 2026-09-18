@echo off
cd /d "%~dp0"
title Dombla Public Cloudflare Tunnel
echo ============================================================
echo   Dombla — Public Cloudflare Tunnel Launcher
echo   Routing: http://localhost:8000 -> Public HTTPS URL
echo ============================================================
echo.
echo Connecting your laptop to Cloudflare's worldwide network...
echo Your public HTTPS address will appear below:
echo.
cloudflared tunnel --url http://localhost:8000
pause
