@echo off
title Dombla Web Dashboard & MQTT Broker
echo ====================================================
echo   Starting Dombla Web Dashboard...
echo ====================================================

cd /d "%~dp0\web-dashboard"
npm start

pause
