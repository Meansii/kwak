'use strict';
/*
 * 더블클릭 실행용 시작 스크립트.
 *
 * 윈도우 배치파일(.bat)은 한글이 들어가면 명령창 문자표(CP949) 문제로 깨지기 때문에,
 * 배치파일은 영문 몇 줄만 두고 실제 안내는 모두 이 파일에서 한다.
 * Node 는 윈도우 콘솔에 유니코드로 직접 쓰기 때문에 한글이 깨지지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
process.chdir(root);

function line() {
  console.log('─'.repeat(52));
}

/** 처음 실행이면 필요한 파일(node_modules)을 내려받는다. */
function installIfNeeded() {
  if (fs.existsSync(path.join(root, 'node_modules', 'express', 'package.json'))) return;

  console.log('');
  line();
  console.log('  처음 실행이라 필요한 파일을 내려받습니다.');
  console.log('  3~5분 정도 걸립니다. 창을 닫지 말고 기다려 주세요.');
  line();
  console.log('');

  const isWin = process.platform === 'win32';
  const result = spawnSync(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
    shell: isWin,   // 윈도우에서 npm.cmd 를 실행하려면 셸이 필요하다
  });

  if (result.error || result.status !== 0) {
    console.error('');
    console.error('  [!] 필요한 파일을 내려받지 못했습니다.');
    console.error('      인터넷 연결을 확인한 뒤 다시 실행해 주세요.');
    if (result.error) console.error('      (상세: ' + result.error.message + ')');
    console.error('');
    process.exit(1);
  }
}

function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 20) {
    console.error('');
    console.error(`  [!] Node.js 버전이 너무 낮습니다. (현재 ${process.versions.node})`);
    console.error('      https://nodejs.org 에서 LTS 버전을 다시 설치해 주세요.');
    console.error('');
    process.exit(1);
  }

  installIfNeeded();

  // 비밀번호를 따로 정하지 않았다면 첫 비밀번호를 kwak1234 로 둔다.
  // (앱 [설정] 화면에서 한 번 바꾸면 그 뒤로는 바꾼 비밀번호가 우선한다)
  if (!process.env.APP_PASSWORD) process.env.APP_PASSWORD = 'kwak1234';

  require(path.join(root, 'server', 'index.js')).start();
}

main();
