#!/bin/bash
# 맥에서 더블클릭으로 실행하는 파일입니다.
cd "$(dirname "$0")" || exit 1

if ! command -v node > /dev/null 2>&1; then
  echo
  echo "  Node.js 가 설치되어 있지 않습니다."
  echo "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  echo
  open "https://nodejs.org/ko/download" 2>/dev/null
  read -r -p "엔터를 누르면 창이 닫힙니다..."
  exit 1
fi

node "scripts/start.js"

echo
read -r -p "엔터를 누르면 창이 닫힙니다..."
