import { 
  lockerLogs, 
  lockerDailySummaries,
  type LockerLog, 
  type InsertLockerLog,
  type UpdateLockerLog,
  type DailySummary,
  type InsertDailySummary
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

export interface IStorage {
  // Locker Log operations
  createEntry(entry: InsertLockerLog): Promise<LockerLog>;
  updateEntry(id: string, update: UpdateLockerLog): Promise<LockerLog | undefined>;
  getEntry(id: string): Promise<LockerLog | undefined>;
  getActiveLockers(): Promise<LockerLog[]>;
  listLogs(params: {
    businessDay?: string;
    startDate?: Date;
    endDate?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<{ data: LockerLog[]; nextCursor: string | null }>;
  
  // Daily Summary operations
  getDailySummary(businessDay: string): Promise<DailySummary | undefined>;
  upsertDailySummary(summary: InsertDailySummary): Promise<DailySummary>;
  recalculateDailySummary(businessDay: string): Promise<DailySummary>;
}

export class DatabaseStorage implements IStorage {
  async createEntry(entry: InsertLockerLog): Promise<LockerLog> {
    const [log] = await db
      .insert(lockerLogs)
      .values(entry)
      .returning();
    return log;
  }

  async updateEntry(id: string, update: UpdateLockerLog): Promise<LockerLog | undefined> {
    const [log] = await db
      .update(lockerLogs)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(lockerLogs.id, id))
      .returning();
    return log || undefined;
  }

  async getEntry(id: string): Promise<LockerLog | undefined> {
    const [log] = await db
      .select()
      .from(lockerLogs)
      .where(eq(lockerLogs.id, id));
    return log || undefined;
  }

  async getActiveLockers(): Promise<LockerLog[]> {
    return await db
      .select()
      .from(lockerLogs)
      .where(eq(lockerLogs.status, 'in_use'))
      .orderBy(asc(lockerLogs.entryTime));
  }

  async listLogs(params: {
    businessDay?: string;
    startDate?: Date;
    endDate?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<{ data: LockerLog[]; nextCursor: string | null }> {
    const { businessDay, startDate, endDate, cursor, limit = 100 } = params;
    
    let query = db.select().from(lockerLogs);
    
    const conditions = [];
    
    if (businessDay) {
      conditions.push(eq(lockerLogs.businessDay, businessDay));
    } else if (startDate && endDate) {
      conditions.push(
        and(
          gte(lockerLogs.entryTime, startDate),
          lte(lockerLogs.entryTime, endDate)
        )!
      );
    }
    
    if (cursor) {
      // Cursor is entryTime in ISO format - filter for older entries
      conditions.push(lt(lockerLogs.entryTime, new Date(cursor)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)!) as any;
    }
    
    const data = await query
      .orderBy(desc(lockerLogs.entryTime), desc(lockerLogs.id))
      .limit(limit + 1);
    
    const hasMore = data.length > limit;
    const logs = hasMore ? data.slice(0, limit) : data;
    const nextCursor = hasMore ? logs[logs.length - 1].entryTime.toISOString() : null;
    
    return { data: logs, nextCursor };
  }

  async getDailySummary(businessDay: string): Promise<DailySummary | undefined> {
    const [summary] = await db
      .select()
      .from(lockerDailySummaries)
      .where(eq(lockerDailySummaries.businessDay, businessDay));
    return summary || undefined;
  }

  async upsertDailySummary(summary: InsertDailySummary): Promise<DailySummary> {
    const [result] = await db
      .insert(lockerDailySummaries)
      .values(summary)
      .onConflictDoUpdate({
        target: lockerDailySummaries.businessDay,
        set: { 
          ...summary, 
          updatedAt: new Date() 
        },
      })
      .returning();
    return result;
  }

  async recalculateDailySummary(businessDay: string): Promise<DailySummary> {
    const logs = await db
      .select()
      .from(lockerLogs)
      .where(eq(lockerLogs.businessDay, businessDay));
    
    const completedLogs = logs.filter(log => log.status === 'checked_out' && !log.cancelled);
    
    const summary: InsertDailySummary = {
      businessDay,
      totalVisitors: completedLogs.length,
      totalSales: completedLogs.reduce((sum, log) => sum + log.finalPrice, 0),
      cancellations: logs.filter(log => log.cancelled).length,
      totalDiscount: completedLogs.reduce((sum, log) => {
        if (log.optionType === 'discount' || log.optionType === 'custom') {
          return sum + (log.optionAmount || 2000);
        }
        return sum;
      }, 0),
      foreignerCount: completedLogs.filter(log => log.optionType === 'foreigner').length,
      foreignerSales: completedLogs
        .filter(log => log.optionType === 'foreigner')
        .reduce((sum, log) => sum + log.finalPrice, 0),
    };
    
    return await this.upsertDailySummary(summary);
  }
}

export const storage = new DatabaseStorage();
