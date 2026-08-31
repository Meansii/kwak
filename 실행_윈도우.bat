@echo off
chcp 65001 > nul
title 미용실 고객관리 앱
cd /d "%~dp0"

echo.
echo  ===================================================
echo    미용실 고객관리 앱을 시작합니다
echo  ===================================================
echo.

where node > nul 2>&1
if errorlevel 1 (
  echo  [!] Node.js 가 설치되어 있지 않습니다.
  echo.
  echo      https://nodejs.org  에 접속해서 왼쪽의 LTS 버전을 내려받아
  echo      설치한 뒤, 이 파일을 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  처음 실행이라 필요한 파일을 내려받습니다. 3~5분 정도 걸립니다...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [!] 설치에 실패했습니다. 인터넷 연결을 확인하고 다시 실행해 주세요.
    pause
    exit /b 1
  )
)

REM 비밀번호를 바꾸려면 아래 줄의 kwak1234 부분을 원하는 값으로 고치세요.
if "%APP_PASSWORD%"=="" set APP_PASSWORD=kwak1234

echo.
call npm start

echo.
echo  앱이 종료되었습니다.
pause
