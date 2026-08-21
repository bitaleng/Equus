/**
 * zip 배포용: Netlify Functions를 의존성 포함해 단일 JS로 묶습니다.
 * (드래그&드롭 배포에는 node_modules가 없어 @netlify/blobs import가 실패함)
 *
 * Usage: node scripts/bundle-netlify-functions.mjs <functions-out-dir>
 */
import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.resolve(
  process.argv[2] || path.join(root, "dist/public/netlify/functions")
);

fs.mkdirSync(outDir, { recursive: true });

const entries = ["demo-trial", "license-bind", "cctv-register"];

for (const name of entries) {
  const entryTs = path.join(root, "netlify/functions", `${name}.ts`);
  if (!fs.existsSync(entryTs)) {
    console.warn(`skip (missing): ${entryTs}`);
    continue;
  }

  const outfile = path.join(outDir, `${name}.js`);
  await esbuild.build({
    entryPoints: [entryTs],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile,
    logLevel: "info",
  });

  const leftoverTs = path.join(outDir, `${name}.ts`);
  if (fs.existsSync(leftoverTs)) {
    fs.unlinkSync(leftoverTs);
  }
  console.log(`bundled: ${outfile}`);
}
