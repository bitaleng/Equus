import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const skin = process.env.VITE_SKIN || "v1";

const skinMeta: Record<
  string,
  { title: string; description: string; themeColor: string; iconVersion: string }
> = {
  v1: {
    title: "EQUUS LOCKER MANAGER",
    description: "에쿠스 휴게텔 입실 현황을 실시간으로 관리합니다.",
    themeColor: "#0F172A",
    iconVersion: "equus1",
  },
  v2: {
    title: "He's 입실관리매니저",
    description: "태블릿 최적화 입실 관리 시스템",
    themeColor: "#cc44aa",
    iconVersion: "hes3",
  },
  v3: {
    title: "home24시 입실관리매니저",
    description: "홈 버전 입실 관리 시스템",
    themeColor: "#00D4D4",
    iconVersion: "home1",
  },
  demo: {
    title: "입실관리 체험판",
    description: "10일 체험판 — 홈 화면 설치 미지원",
    themeColor: "#2d2d2d",
    iconVersion: "demo1",
  },
};

const meta = skinMeta[skin] || skinMeta.v1;

const SKIN_ASSET_FILES = [
  "favicon.png",
  "favicon-light.png",
  "icon-192.png",
  "icon-192-light.png",
  "icon-512.png",
  "icon-512-light.png",
  "icon-1024.png",
  "icon-1024-light.png",
  "manifest.json",
] as const;

function skinAssetsPlugin() {
  const skinDir = path.resolve(import.meta.dirname, "client", "skins", skin);

  return {
    name: "skin-assets-plugin",
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
    /** 로컬 개발: public/ 기본 아이콘 대신 현재 스킨 폴더 자산 우선 제공 */
    configureServer(server: {
      middlewares: {
        use: (fn: (req: any, res: any, next: () => void) => void) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || "").split("?")[0];
        const name = urlPath.replace(/^\//, "");
        if (!(SKIN_ASSET_FILES as readonly string[]).includes(name)) return next();
        const filePath = path.join(skinDir, name);
        if (!fs.existsSync(filePath)) return next();
        res.setHeader(
          "Content-Type",
          name.endsWith(".json") ? "application/json; charset=utf-8" : "image/png"
        );
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      if (!fs.existsSync(skinDir)) {
        throw new Error(`[skin-assets] missing skin dir: ${skinDir}`);
      }
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      for (const file of SKIN_ASSET_FILES) {
        const src = path.join(skinDir, file);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(outDir, file);
        let lastErr: unknown;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            fs.copyFileSync(src, dest);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (lastErr) {
          throw new Error(`[skin-assets] copy failed: ${file} (${String(lastErr)})`);
        }
      }
      const expectedId =
        skin === "demo"
          ? "/demo"
          : skin === "v3"
            ? "/home24"
            : skin === "v2"
              ? "/hizz"
              : "/equus";
      const manifestPath = path.join(outDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        id?: string;
        short_name?: string;
      };
      if (manifest.id !== expectedId) {
        throw new Error(
          `[skin-assets] manifest id mismatch: got ${manifest.id}, expected ${expectedId} (skin=${skin})`
        );
      }
    },
  };
}

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
    skinAssetsPlugin(),
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
