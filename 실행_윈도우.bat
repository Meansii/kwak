@echo off
cd /d "%~dp0"
title Hair Customer Manager

where node >nul 2>&1
if errorlevel 1 goto nonode

node "scripts\start.js"

echo.
echo Press any key to close this window.
pause >nul
exit /b

:nonode
echo.
echo   Node.js is not installed.
echo   Install the LTS version from https://nodejs.org
echo   and then run this file again.
echo.
start "" "https://nodejs.org/ko/download"
pause
exit /b
