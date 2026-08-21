import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/** peerjs 등 동적 import 청크까지 Service Worker가 설치 시 캐시하도록 목록 생성 */
function swPrecachePlugin() {
  return {
    name: "sw-precache-plugin",
    writeBundle(
      options: { dir?: string },
      bundle: Record<string, { type: string; fileName: string }>
    ) {
      const outDir = options.dir || path.resolve(import.meta.dirname, "dist/public");
      const assets = Object.values(bundle)
        .filter((item) => item.type === "chunk" || item.type === "asset")
        .map((item) => `/${item.fileName.replace(/^\/+/, "")}`)
        .filter((url) => url.startsWith("/assets/") || url.endsWith(".wasm"))
        .sort();
      fs.writeFileSync(
        path.join(outDir, "sw-precache.json"),
        JSON.stringify(assets)
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    swPrecachePlugin(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
