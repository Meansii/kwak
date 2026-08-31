#!/bin/bash
# 맥에서 더블클릭으로 실행하는 파일입니다.
cd "$(dirname "$0")" || exit 1

echo
echo " ==================================================="
echo "   미용실 고객관리 앱을 시작합니다"
echo " ==================================================="
echo

if ! command -v node > /dev/null 2>&1; then
  echo " [!] Node.js 가 설치되어 있지 않습니다."
  echo
  echo "     https://nodejs.org 에 접속해 LTS 버전을 내려받아 설치한 뒤,"
  echo "     이 파일을 다시 실행해 주세요."
  echo
  read -r -p "엔터를 누르면 창이 닫힙니다..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo " 처음 실행이라 필요한 파일을 내려받습니다. 3~5분 정도 걸립니다..."
  echo
  if ! npm install; then
    echo
    echo " [!] 설치에 실패했습니다. 인터넷 연결을 확인하고 다시 실행해 주세요."
    read -r -p "엔터를 누르면 창이 닫힙니다..."
    exit 1
  fi
fi

# 비밀번호를 바꾸려면 아래 kwak1234 부분을 원하는 값으로 고치세요.
export APP_PASSWORD="${APP_PASSWORD:-kwak1234}"

npm start

echo
echo " 앱이 종료되었습니다."
read -r -p "엔터를 누르면 창이 닫힙니다..."
