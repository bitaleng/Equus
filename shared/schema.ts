import { pgTable, text, varchar, integer, timestamp, date, boolean, pgEnum, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const optionTypeEnum = pgEnum('option_type', ['none', 'discount', 'custom', 'foreigner']);
export const timeTypeEnum = pgEnum('time_type', ['주간', '야간']);
export const statusEnum = pgEnum('status', ['in_use', 'checked_out', 'cancelled']);

// Locker Logs Table - 입출 기록
export const lockerLogs = pgTable("locker_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockerNumber: integer("locker_number").notNull(),
  entryTime: timestamp("entry_time", { withTimezone: true }).notNull().defaultNow(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
  businessDay: date("business_day").notNull(), // 매출 집계 기준일 (오전 10시 기준)
  timeType: timeTypeEnum("time_type").notNull(), // 주간/야간
  basePrice: integer("base_price").notNull(),
  optionType: optionTypeEnum("option_type").notNull().default('none'),
  optionAmount: integer("option_amount"), // 할인 금액
  finalPrice: integer("final_price").notNull(),
  status: statusEnum("status").notNull().default('in_use'),
  cancelled: boolean("cancelled").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily Summaries Table - 일별 매출 집계
export const lockerDailySummaries = pgTable("locker_daily_summaries", {
  businessDay: date("business_day").primaryKey(),
  totalVisitors: integer("total_visitors").notNull().default(0),
  totalSales: integer("total_sales").notNull().default(0),
  cancellations: integer("cancellations").notNull().default(0),
  totalDiscount: integer("total_discount").notNull().default(0),
  foreignerCount: integer("foreigner_count").notNull().default(0),
  foreignerSales: integer("foreigner_sales").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// System Metadata Table - 시스템 메타데이터 (cleanup 상태 추적)
export const systemMetadata = pgTable("system_metadata", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Insert Schemas
export const insertLockerLogSchema = createInsertSchema(lockerLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLockerLogSchema = z.object({
  exitTime: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  optionType: z.enum(['none', 'discount', 'custom', 'foreigner']).optional(),
  optionAmount: z.number().optional(),
  finalPrice: z.number().optional(),
  status: z.enum(['in_use', 'checked_out', 'cancelled']).optional(),
  cancelled: z.boolean().optional(),
  notes: z.string().optional(),
});

export const insertDailySummarySchema = createInsertSchema(lockerDailySummaries).omit({
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertLockerLog = z.infer<typeof insertLockerLogSchema>;
export type LockerLog = typeof lockerLogs.$inferSelect;
export type UpdateLockerLog = z.infer<typeof updateLockerLogSchema>;
export type DailySummary = typeof lockerDailySummaries.$inferSelect;
export type InsertDailySummary = z.infer<typeof insertDailySummarySchema>;
