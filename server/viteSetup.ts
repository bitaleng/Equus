import express, { type Express } from "express";
import path from "path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === "production";
const clientPath = path.resolve(__dirname, "..", "client");
const distPath = path.resolve(__dirname, "..", "dist", "public");

export async function setupVite(app: Express): Promise<ViteDevServer | null> {
  if (isProduction) {
    app.use(express.static(distPath));
    app.get("*", (_req, res, next) => {
      if (_req.path.startsWith("/api") || _req.path.startsWith("/ws")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
    return null;
  }

  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "..", "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
    root: clientPath,
  });

  app.use(vite.middlewares);
  return vite;
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
