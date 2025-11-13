import { pgTable, text, varchar, integer, timestamp, date, boolean, pgEnum, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const optionTypeEnum = pgEnum('option_type', ['none', 'discount', 'custom', 'foreigner', 'direct_price']);
export const timeTypeEnum = pgEnum('time_type', ['주간', '야간']);
export const statusEnum = pgEnum('status', ['in_use', 'checked_out', 'cancelled']);
export const paymentMethodEnum = pgEnum('payment_method', ['card', 'cash', 'transfer']);
export const depositStatusEnum = pgEnum('deposit_status', ['received', 'refunded', 'forfeited']);

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
  parentLocker: integer("parent_locker"), // 부모 락카 번호 (자식 락카인 경우)
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

// Additional Revenue Items Table - 추가매출 항목 (롱타올, 담요 등)
export const additionalRevenueItems = pgTable("additional_revenue_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // 항목명 (예: "롱타올대여", "담요대여")
  rentalFee: integer("rental_fee").notNull().default(0), // 대여비
  depositAmount: integer("deposit_amount").notNull().default(0), // 보증금
  sortOrder: integer("sort_order").notNull().default(0), // 표시 순서
  isDefault: boolean("is_default").notNull().default(false), // 기본 항목 여부
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Rental Transactions Table - 대여 거래 기록
export const rentalTransactions = pgTable("rental_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockerLogId: varchar("locker_log_id").notNull(), // 락커 로그 ID (외래키)
  itemId: varchar("item_id").notNull(), // 추가매출 항목 ID
  itemName: varchar("item_name").notNull(), // 항목명 (예: "롱타올대여")
  lockerNumber: integer("locker_number").notNull(), // 락커 번호
  rentalTime: timestamp("rental_time", { withTimezone: true }).notNull(), // 대여 시간 (입실 시간)
  returnTime: timestamp("return_time", { withTimezone: true }).notNull(), // 반납 시간 (퇴실 시간)
  businessDay: date("business_day").notNull(), // 영업일 (매출 집계 기준일)
  rentalFee: integer("rental_fee").notNull(), // 대여비
  depositAmount: integer("deposit_amount").notNull(), // 보증금
  paymentMethod: paymentMethodEnum("payment_method").notNull(), // 지급방식
  depositStatus: depositStatusEnum("deposit_status").notNull().default('received'), // 보증금 상태
  revenue: integer("revenue").notNull().default(0), // 총 매출 (대여비 + 보증금 상태에 따른 매출)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Additional Fee Events Table - 추가요금 이벤트 (퇴실 시 추가요금)
export const additionalFeeEvents = pgTable("additional_fee_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockerLogId: varchar("locker_log_id").notNull(), // 원래 락커 로그 ID
  lockerNumber: integer("locker_number").notNull(), // 락커 번호
  checkoutTime: timestamp("checkout_time", { withTimezone: true }).notNull(), // 퇴실 시간
  feeAmount: integer("fee_amount").notNull(), // 추가요금
  businessDay: date("business_day").notNull(), // 매출 집계일 (퇴실일 기준)
  paymentMethod: paymentMethodEnum("payment_method").notNull(), // 지급방식
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Expenses Table - 지출 기록
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(), // 지출 날짜
  time: varchar("time").notNull(), // 지출 시간 (HH:mm)
  category: varchar("category").notNull(), // 지출 항목 (예: "간식", "비품" 등)
  amount: integer("amount").notNull(), // 금액
  quantity: integer("quantity").default(1), // 수량
  paymentMethod: paymentMethodEnum("payment_method").notNull(), // 결제 방식
  businessDay: date("business_day").notNull(), // 영업일 (정산 기준일)
  notes: text("notes"), // 비고
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Closing Days Table - 정산 기록
export const closingDays = pgTable("closing_days", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  businessDay: date("business_day").notNull().unique(), // 정산 영업일 (정산 기간 시작일)
  startTime: timestamp("start_time", { withTimezone: true }).notNull(), // 정산 시작 시간 (전일 10:00)
  endTime: timestamp("end_time", { withTimezone: true }).notNull(), // 정산 종료 시간 (당일 10:00)
  openingFloat: integer("opening_float").notNull(), // 시작 시재금
  targetFloat: integer("target_float").notNull(), // 목표 시재금
  actualCash: integer("actual_cash"), // 금전함 실잔액 (직원 입력)
  expectedCash: integer("expected_cash"), // 기대 잔액 (계산값)
  discrepancy: integer("discrepancy").default(0), // 과부족 (실잔액 - 기대잔액)
  bankDeposit: integer("bank_deposit"), // 은행 입금액
  notes: text("notes"), // 비고 (과부족 사유 등)
  isConfirmed: boolean("is_confirmed").notNull().default(false), // 정산 확정 여부
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }), // 확정 시간
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
  paymentMethod: z.enum(['card', 'cash', 'transfer']).optional(),
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
  paymentMethod: z.enum(['card', 'cash', 'transfer']).nullish(),
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

export const insertAdditionalRevenueItemSchema = createInsertSchema(additionalRevenueItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAdditionalRevenueItemSchema = z.object({
  name: z.string().optional(),
  rentalFee: z.number().optional(),
  depositAmount: z.number().optional(),
  sortOrder: z.number().optional(),
  isDefault: z.boolean().optional(),
});

export const insertRentalTransactionSchema = createInsertSchema(rentalTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateRentalTransactionSchema = z.object({
  depositStatus: z.enum(['received', 'refunded', 'forfeited']).optional(),
  depositRevenue: z.number().optional(),
});

export const insertAdditionalFeeEventSchema = createInsertSchema(additionalFeeEvents).omit({
  id: true,
  createdAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
});

export const updateExpenseSchema = z.object({
  date: z.string().optional(),
  time: z.string().optional(),
  category: z.string().optional(),
  amount: z.number().optional(),
  quantity: z.number().optional(),
  paymentMethod: z.enum(['card', 'cash', 'transfer']).optional(),
  businessDay: z.string().optional(),
  notes: z.string().nullish(),
});

export const insertClosingDaySchema = createInsertSchema(closingDays).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateClosingDaySchema = z.object({
  openingFloat: z.number().optional(),
  targetFloat: z.number().optional(),
  actualCash: z.number().optional(),
  expectedCash: z.number().optional(),
  discrepancy: z.number().optional(),
  bankDeposit: z.number().optional(),
  notes: z.string().nullish(),
  isConfirmed: z.boolean().optional(),
  confirmedAt: z.union([z.string(), z.date()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});

// Types
export type InsertLockerLog = z.infer<typeof insertLockerLogSchema>;
export type LockerLog = typeof lockerLogs.$inferSelect;
export type UpdateLockerLog = z.infer<typeof updateLockerLogSchema>;
export type DailySummary = typeof lockerDailySummaries.$inferSelect;
export type InsertDailySummary = z.infer<typeof insertDailySummarySchema>;
export type LockerGroup = typeof lockerGroups.$inferSelect;
export type InsertLockerGroup = z.infer<typeof insertLockerGroupSchema>;
export type UpdateLockerGroup = z.infer<typeof updateLockerGroupSchema>;

export type AdditionalRevenueItem = typeof additionalRevenueItems.$inferSelect;
export type InsertAdditionalRevenueItem = z.infer<typeof insertAdditionalRevenueItemSchema>;
export type UpdateAdditionalRevenueItem = z.infer<typeof updateAdditionalRevenueItemSchema>;

export type RentalTransaction = typeof rentalTransactions.$inferSelect;
export type InsertRentalTransaction = z.infer<typeof insertRentalTransactionSchema>;
export type UpdateRentalTransaction = z.infer<typeof updateRentalTransactionSchema>;

export type AdditionalFeeEvent = typeof additionalFeeEvents.$inferSelect;
export type InsertAdditionalFeeEvent = z.infer<typeof insertAdditionalFeeEventSchema>;

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type UpdateExpense = z.infer<typeof updateExpenseSchema>;

export type ClosingDay = typeof closingDays.$inferSelect;
export type InsertClosingDay = z.infer<typeof insertClosingDaySchema>;
export type UpdateClosingDay = z.infer<typeof updateClosingDaySchema>;
