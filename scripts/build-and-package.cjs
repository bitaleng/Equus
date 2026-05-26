#!/usr/bin/env node
/**
 * v1/v2 빌드 및 패키징 스크립트
 * 사용법:
 *   node scripts/build-and-package.cjs v1
 *   node scripts/build-and-package.cjs v2
 *
 * 빌드 흐름:
 *  1) npx vite build --mode {version}  →  항상 dist/public 으로 출력됨
 *     (vite.config.ts root가 client/ 이므로 --outDir CLI 인자는 무시됨)
 *  2) dist/public 전체를 dist/{version} 으로 복사
 *  3) client/skins/{version}/ 파일을 dist/{version} 위에 덮어씀 (아이콘, manifest 등)
 *  4) dist/{version} 을 ZIP으로 패키징
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !['v1', 'v2'].includes(version)) {
  console.error('사용법: node scripts/build-and-package.cjs [v1|v2]');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'dist', 'public'); // Vite가 항상 출력하는 곳
const distDir = path.join(root, 'dist', version);    // 버전별 최종 폴더
const skinDir = path.join(root, 'client', 'skins', version);
const zipFile = path.join(root, `netlify-deploy-${version}.zip`);

console.log(`\n========================================`);
console.log(`  빌드 시작: ${version.toUpperCase()}`);
console.log(`========================================\n`);

// 1. Vite 빌드 (출력: dist/public)
console.log(`[1/4] Vite 빌드 중... (mode: ${version})`);
execSync(
  `npx vite build --mode ${version}`,
  { stdio: 'inherit', cwd: root }
);

// 2. dist/public → dist/{version} 복사
console.log(`\n[2/4] dist/public → dist/${version} 복사 중...`);
if (!fs.existsSync(publicDir)) {
  console.error(`  오류: ${publicDir} 가 존재하지 않습니다. Vite 빌드가 실패한 것 같습니다.`);
  process.exit(1);
}
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
copyDir(publicDir, distDir);
console.log(`  ✓ 빌드 파일 복사 완료`);

// 3. 스킨 파일 덮어쓰기
console.log(`\n[3/4] 스킨 파일 적용 중... (client/skins/${version}/)`);
if (fs.existsSync(skinDir)) {
  copyDir(skinDir, distDir);
  console.log(`  ✓ 스킨 파일 복사 완료`);
} else {
  console.log(`  ! 스킨 폴더 없음, 기본 파일 사용`);
}

// 4. ZIP 패키징
console.log(`\n[4/4] ZIP 생성 중... netlify-deploy-${version}.zip`);
if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
execSync(
  `cd "${distDir}" && zip -r "${zipFile}" .`,
  { stdio: 'inherit' }
);

const stats = fs.statSync(zipFile);
const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
console.log(`\n========================================`);
console.log(`  완료! netlify-deploy-${version}.zip (${sizeMB}MB)`);
console.log(`========================================\n`);

// ---- 헬퍼 함수 ----
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  복사: ${entry.name}`);
    }
  }
}
