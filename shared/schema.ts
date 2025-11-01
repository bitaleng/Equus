import { pgTable, text, varchar, integer, timestamp, date, boolean, pgEnum, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const optionTypeEnum = pgEnum('option_type', ['none', 'discount', 'custom', 'foreigner']);
export const timeTypeEnum = pgEnum('time_type', ['주간', '야간']);
export const statusEnum = pgEnum('status', ['in_use', 'checked_out', 'cancelled']);
export const paymentMethodEnum = pgEnum('payment_method', ['card', 'cash']);

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
  paymentMethod: paymentMethodEnum("payment_method"),
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

// Locker Groups Table - 락커 그룹 관리 (번호대별 그룹)
export const lockerGroups = pgTable("locker_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // 그룹명 (예: "1층", "2층")
  startNumber: integer("start_number").notNull(),
  endNumber: integer("end_number").notNull(),
  sortOrder: integer("sort_order").notNull().default(0), // 표시 순서
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Insert Schemas
export const insertLockerLogSchema = createInsertSchema(lockerLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  notes: z.string().optional(),
  paymentMethod: z.enum(['card', 'cash']).optional(),
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
  paymentMethod: z.enum(['card', 'cash']).nullish(),
  notes: z.string().nullish(),
});

export const insertDailySummarySchema = createInsertSchema(lockerDailySummaries).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertLockerGroupSchema = createInsertSchema(lockerGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => data.startNumber <= data.endNumber,
  {
    message: "시작 번호는 종료 번호보다 작거나 같아야 합니다",
    path: ["endNumber"],
  }
).refine(
  (data) => data.startNumber > 0 && data.endNumber > 0,
  {
    message: "락커 번호는 1 이상이어야 합니다",
    path: ["startNumber"],
  }
);

export const updateLockerGroupSchema = z.object({
  name: z.string().optional(),
  startNumber: z.number().optional(),
  endNumber: z.number().optional(),
  sortOrder: z.number().optional(),
}).refine(
  (data) => {
    // Only validate if both startNumber and endNumber are provided
    if (data.startNumber !== undefined && data.endNumber !== undefined) {
      return data.startNumber <= data.endNumber;
    }
    return true;
  },
  {
    message: "시작 번호는 종료 번호보다 작거나 같아야 합니다",
    path: ["endNumber"],
  }
).refine(
  (data) => {
    // Validate individual numbers if provided
    if (data.startNumber !== undefined && data.startNumber <= 0) return false;
    if (data.endNumber !== undefined && data.endNumber <= 0) return false;
    return true;
  },
  {
    message: "락커 번호는 1 이상이어야 합니다",
    path: ["startNumber"],
  }
);

// Types
export type InsertLockerLog = z.infer<typeof insertLockerLogSchema>;
export type LockerLog = typeof lockerLogs.$inferSelect;
export type UpdateLockerLog = z.infer<typeof updateLockerLogSchema>;
export type DailySummary = typeof lockerDailySummaries.$inferSelect;
export type InsertDailySummary = z.infer<typeof insertDailySummarySchema>;
export type LockerGroup = typeof lockerGroups.$inferSelect;
export type InsertLockerGroup = z.infer<typeof insertLockerGroupSchema>;
export type UpdateLockerGroup = z.infer<typeof updateLockerGroupSchema>;
