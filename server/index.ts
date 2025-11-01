import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// 1년 이상 오래된 데이터 자동 삭제 스케줄러 (매일 새벽 2시)
let cleanupIntervalId: NodeJS.Timeout | null = null;
let lastCleanupDate: string | null = null;

async function scheduleOldDataDeletion() {
  // 이미 스케줄러가 실행 중이면 무시 (중복 방지)
  if (cleanupIntervalId !== null) {
    return;
  }

  const checkAndDelete = async () => {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toISOString().split('T')[0];
    
    // 매일 새벽 2시에 실행 (하루에 한 번만)
    if (hour === 2 && lastCleanupDate !== today) {
      try {
        log('Starting old data cleanup...');
        const result = await storage.deleteOldData();
        log(`Old data cleanup completed: deleted ${result.deletedLogs} logs and ${result.deletedSummaries} summaries`);
        lastCleanupDate = today;
      } catch (error) {
        console.error('Failed to delete old data:', error);
      }
    }
  };
  
  // 매시간마다 체크 (새벽 2시인지 확인)
  cleanupIntervalId = setInterval(checkAndDelete, 60 * 60 * 1000);
  
  // 서버 시작 시 현재 시각이 새벽 2시면 실행
  const now = new Date();
  if (now.getHours() === 2) {
    checkAndDelete();
  }
}

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    // 오래된 데이터 자동 삭제 스케줄러 시작
    scheduleOldDataDeletion();
  });
})();
