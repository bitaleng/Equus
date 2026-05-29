import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const skin = process.env.VITE_SKIN || 'v1';

const skinMeta: Record<string, { title: string; description: string; themeColor: string; iconVersion: string }> = {
  v1: {
    title: '휴게텔 입실관리매니저',
    description: '락카 입실 현황을 실시간으로 관리합니다.',
    themeColor: '#0F172A',
    iconVersion: 'equus1',
  },
  v2: {
    title: "He's 입실관리매니저",
    description: '태블릿 최적화 입실 관리 시스템',
    themeColor: '#cc44aa',
    iconVersion: 'hes1',
  },
};

const meta = skinMeta[skin] || skinMeta.v1;

function skinAssetsPlugin() {
  return {
    name: 'skin-assets-plugin',
    transformIndexHtml(html: string) {
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
        .replace(
          /<meta name="description" content="[^"]*"/,
          `<meta name="description" content="${meta.description}"`
        )
        .replace(
          /<meta name="theme-color" content="[^"]*"/,
          `<meta name="theme-color" content="${meta.themeColor}"`
        )
        .replace(/\?v=\w+(?=")/g, `?v=${meta.iconVersion}`);
    },
    closeBundle() {
      const skinDir = path.resolve(import.meta.dirname, 'client', 'skins', skin);
      const outDir = path.resolve(import.meta.dirname, 'dist/public');
      if (!fs.existsSync(skinDir)) return;
      const filesToCopy = ['favicon.png', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'manifest.json'];
      for (const file of filesToCopy) {
        const src = path.join(skinDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(outDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    skinAssetsPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
