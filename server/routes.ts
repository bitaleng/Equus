import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertLockerLogSchema, 
  updateLockerLogSchema 
} from "@shared/schema";
import { 
  getBusinessDay, 
  getTimeType, 
  getBasePrice, 
  calculateFinalPrice,
  getBusinessDayStart,
  getBusinessDayEnd
} from "./utils/businessDay";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create new locker entry (입실)
  app.post("/api/entries", async (req, res) => {
    try {
      const now = new Date();
      const timeType = getTimeType(now);
      const basePrice = getBasePrice(timeType);
      const businessDay = getBusinessDay(now);
      
      const data = insertLockerLogSchema.parse({
        ...req.body,
        entryTime: now,
        businessDay,
        timeType,
        basePrice,
        finalPrice: req.body.finalPrice || basePrice,
        status: 'in_use',
        cancelled: false,
      });
      
      const entry = await storage.createEntry(data);
      res.json(entry);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update locker entry (옵션 적용, 퇴실, 취소)
  app.patch("/api/entries/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = updateLockerLogSchema.parse(req.body);
      
      // 퇴실 시 매출 집계 업데이트
      if (data.status === 'checked_out' && !data.exitTime) {
        data.exitTime = new Date();
      }
      
      const entry = await storage.updateEntry(id, data);
      
      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      
      // 퇴실 또는 취소 시 매출 집계 재계산
      if (data.status === 'checked_out' || data.cancelled) {
        await storage.recalculateDailySummary(entry.businessDay);
      }
      
      res.json(entry);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get locker entry by ID
  app.get("/api/entries/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const entry = await storage.getEntry(id);
      
      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get active lockers (현재 사용중인 락커)
  app.get("/api/lockers/active", async (req, res) => {
    try {
      const activeLockers = await storage.getActiveLockers();
      res.json(activeLockers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List logs with pagination and filtering
  app.get("/api/logs", async (req, res) => {
    try {
      const { date, cursor, limit } = req.query;
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      let businessDay: string | undefined;
      
      if (date && typeof date === 'string') {
        businessDay = date;
        startDate = getBusinessDayStart(date);
        endDate = getBusinessDayEnd(date);
      }
      
      const result = await storage.listLogs({
        businessDay,
        startDate,
        endDate,
        cursor: cursor as string | undefined,
        limit: limit ? parseInt(limit as string) : 100,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get daily summary (일별 매출 집계)
  app.get("/api/daily-summary/:businessDay", async (req, res) => {
    try {
      const { businessDay } = req.params;
      let summary = await storage.getDailySummary(businessDay);
      
      // 집계 데이터가 없으면 재계산
      if (!summary) {
        summary = await storage.recalculateDailySummary(businessDay);
      }
      
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get today's summary (오늘 매출 집계)
  app.get("/api/daily-summary/today", async (req, res) => {
    try {
      const businessDay = getBusinessDay();
      let summary = await storage.getDailySummary(businessDay);
      
      // 집계 데이터가 없으면 재계산
      if (!summary) {
        summary = await storage.recalculateDailySummary(businessDay);
      }
      
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
