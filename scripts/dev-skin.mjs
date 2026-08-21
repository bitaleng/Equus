#!/usr/bin/env node
/**
 * 스킨별 로컬 개발 서버
 *   node scripts/dev-skin.mjs v1|v2|v3|demo
 *   npm run dev:demo
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skin = process.argv[2] || "v1";
if (!["v1", "v2", "v3", "demo"].includes(skin)) {
  console.error("Usage: node scripts/dev-skin.mjs [v1|v2|v3|demo]");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const licenseKey =
  skin === "demo"
    ? "rest_hotel_license_demo"
    : skin === "v3"
      ? "rest_hotel_license_v3"
      : skin === "v2"
        ? "rest_hotel_license_v2"
        : "rest_hotel_license";

const env = {
  ...process.env,
  NODE_ENV: "development",
  VITE_SKIN: skin,
  VITE_LICENSE_STORAGE_KEY: licenseKey,
};

if (skin === "demo") {
  env.VITE_DEMO_BUILD = "true";
} else {
  delete env.VITE_DEMO_BUILD;
}

if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
}

const labels = { v1: "에쿠스(V1)", v2: "히즈(V2)", v3: "홈(V3)", demo: "통합 체험판" };
console.log(`=== 로컬 서버: ${labels[skin]} (VITE_SKIN=${skin}) ===`);
console.log("브라우저: http://localhost:5000");

const child = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: root,
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
