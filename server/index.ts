import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

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

// 1년 이상 오래된 데이터 자동 삭제 스케줄러 (매일 새벽 2시 KST)
let cleanupTimeoutId: NodeJS.Timeout | null = null;
let isCleanupRunning = false;

async function scheduleOldDataDeletion() {
  // 이미 스케줄러가 실행 중이면 무시 (중복 방지)
  if (cleanupTimeoutId !== null) {
    return;
  }

  const executeCleanup = async () => {
    // 이미 cleanup이 실행 중이면 무시
    if (isCleanupRunning) {
      return;
    }

    const now = new Date();
    const kstToday = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
    const lastCleanupDate = await storage.getLastCleanupDate();
    
    // 이미 오늘 실행했으면 무시하고 재스케줄
    if (lastCleanupDate === kstToday) {
      cleanupTimeoutId = null;
      scheduleNext();
      return;
    }

    isCleanupRunning = true;
    try {
      log('Starting old data cleanup...');
      const result = await storage.deleteOldData();
      await storage.setLastCleanupDate(kstToday);
      log(`Old data cleanup completed: deleted ${result.deletedLogs} logs and ${result.deletedSummaries} summaries`);
    } catch (error) {
      console.error('Failed to delete old data:', error);
    } finally {
      isCleanupRunning = false;
      cleanupTimeoutId = null;
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    const now = new Date();
    
    // 현재 KST 시간을 문자열로 얻기
    const kstDateStr = formatInTimeZone(now, 'Asia/Seoul', 'yyyy-MM-dd');
    const kstHour = parseInt(formatInTimeZone(now, 'Asia/Seoul', 'HH'));
    
    // 다음 02:00 KST의 날짜 계산 (문자열 기반, Date 객체 변경 안 함)
    let targetDate = kstDateStr;
    if (kstHour >= 2) {
      // 이미 02:00을 지났으면 다음 날 (문자열 파싱 및 계산)
      const [year, month, day] = kstDateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day + 1); // 로컬 Date 객체 (날짜 계산만 사용)
      const nextYear = dateObj.getFullYear();
      const nextMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
      const nextDay = String(dateObj.getDate()).padStart(2, '0');
      targetDate = `${nextYear}-${nextMonth}-${nextDay}`;
    }
    
    // 다음 02:00 KST를 UTC로 변환 (명시적으로 KST 날짜/시간 문자열 생성)
    const next2AMKST = `${targetDate} 02:00:00`;
    const next2AMUTC = fromZonedTime(next2AMKST, 'Asia/Seoul');
    
    // 밀리초 차이 계산
    const msUntilNext = next2AMUTC.getTime() - now.getTime();
    
    // 다음 02:00 KST에 실행되도록 스케줄
    cleanupTimeoutId = setTimeout(executeCleanup, Math.max(1000, msUntilNext));
  };
  
  // 첫 스케줄 시작
  scheduleNext();
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
