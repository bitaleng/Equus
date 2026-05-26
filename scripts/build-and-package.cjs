#!/usr/bin/env node
/**
 * v1/v2 빌드 및 패키징 스크립트
 * 사용법:
 *   node scripts/build-and-package.js v1
 *   node scripts/build-and-package.js v2
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version || !['v1', 'v2'].includes(version)) {
  console.error('사용법: node scripts/build-and-package.js [v1|v2]');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist', version);
const skinDir = path.join(root, 'client', 'skins', version);
const zipFile = path.join(root, `netlify-deploy-${version}.zip`);

console.log(`\n========================================`);
console.log(`  빌드 시작: ${version.toUpperCase()}`);
console.log(`========================================\n`);

// 1. Vite 빌드
console.log(`[1/3] Vite 빌드 중... (--mode ${version} --outDir dist/${version})`);
execSync(
  `npx vite build --outDir dist/${version} --mode ${version}`,
  { stdio: 'inherit', cwd: root }
);

// 2. 스킨 파일 덮어쓰기
console.log(`\n[2/3] 스킨 파일 적용 중... (client/skins/${version}/)`);
if (fs.existsSync(skinDir)) {
  copyDir(skinDir, distDir);
  console.log(`  ✓ 스킨 파일 복사 완료`);
} else {
  console.log(`  ! 스킨 폴더 없음, 기본 파일 사용`);
}

// 3. ZIP 패키징
console.log(`\n[3/3] ZIP 생성 중... netlify-deploy-${version}.zip`);
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
