#!/usr/bin/env node
/**
 * 로컬 개발 서버 — 매장 구분(VITE_SKIN)은 더 이상 없다. 앱은 단일 공통 빌드이고,
 * 매장 브랜딩은 라이선스 활성화 시 서버가 내려주는 프로필로 결정된다.
 *   node scripts/dev-skin.mjs [prod|demo]
 *   npm run dev / npm run dev:demo
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] || "prod";
if (!["prod", "demo"].includes(mode)) {
  console.error("Usage: node scripts/dev-skin.mjs [prod|demo]");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = { ...process.env, NODE_ENV: "development" };

if (mode === "demo") {
  env.VITE_DEMO_BUILD = "true";
} else {
  delete env.VITE_DEMO_BUILD;
}

if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
}

console.log(`=== 로컬 서버: ${mode === "demo" ? "통합 체험판" : "정식(통합 빌드)"} ===`);
console.log("브라우저: http://localhost:5000");

const child = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
