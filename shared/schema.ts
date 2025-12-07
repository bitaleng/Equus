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

// Smart Locker System Enums
export const lockerTypeEnum = pgEnum('locker_type', ['shoe', 'wardrobe']); // 신발장/옷장
export const lockerHardwareStateEnum = pgEnum('locker_hardware_state', [
  'idle',           // 대기 (사용 가능)
  'reserved',       // 예약됨 (입실처리 완료, 신발장 잠금해제 대기)
  'shoe_unlocked',  // 신발장 잠금해제 (키 뽑기 가능)
  'key_removed',    // 키 뽑힘 (옷장 사용 가능)
  'wardrobe_in_use', // 옷장 사용 중
  'checkout_pending', // 퇴실 처리 중
  'locked'          // 잠금 상태 (퇴실 완료, 키 뽑기 불가)
]);
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline', 'error']);
export const commandTypeEnum = pgEnum('command_type', [
  'unlock_shoe',    // 신발장 잠금 해제
  'lock_shoe',      // 신발장 잠금
  'unlock_wardrobe', // 옷장 잠금 해제
  'lock_wardrobe',  // 옷장 잠금
  'lock_all',       // 전체 잠금
  'sync_state',     // 상태 동기화
  'heartbeat'       // 연결 확인
]);
export const commandStatusEnum = pgEnum('command_status', ['pending', 'sent', 'acknowledged', 'completed', 'failed', 'timeout']);
export const eventTypeEnum = pgEnum('event_type', [
  'door_opened',    // 문 열림
  'door_closed',    // 문 닫힘
  'key_inserted',   // 키 삽입
  'key_removed',    // 키 뽑힘
  'lock_engaged',   // 잠금 활성화
  'lock_released',  // 잠금 해제
  'device_online',  // 디바이스 온라인
  'device_offline', // 디바이스 오프라인
  'error'           // 오류
]);
export const eventSourceEnum = pgEnum('event_source', ['app', 'device', 'system']);

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

// Barcode Mappings Table - 바코드 매핑 (락카키 바코드 ↔ 락카번호)
export const barcodeMappings = pgTable("barcode_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barcode: varchar("barcode").notNull().unique(), // 바코드 값 (락카키에 인쇄된 바코드)
  lockerNumber: integer("locker_number").notNull(), // 락카 번호
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// RFID Mappings Table - RFID 매핑 (락카키 RFID ↔ 락카번호)
export const rfidMappings = pgTable("rfid_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rfidUid: varchar("rfid_uid").notNull().unique(), // RFID UID (13.56MHz NFC 태그 고유 ID)
  lockerNumber: integer("locker_number").notNull(), // 락카 번호
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ==================== Smart Locker System Tables ====================

// Hardware Devices Table - 하드웨어 컨트롤러 (ESP32 등)
export const hardwareDevices = pgTable("hardware_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deviceId: varchar("device_id").notNull().unique(), // 디바이스 고유 ID (MAC 주소 등)
  name: varchar("name").notNull(), // 디바이스 이름 (예: "1층 컨트롤러")
  controllerType: varchar("controller_type").notNull().default('esp32'), // 컨트롤러 종류
  firmwareVersion: varchar("firmware_version"), // 펌웨어 버전
  sharedSecret: varchar("shared_secret"), // HMAC 인증용 공유 비밀키
  ipAddress: varchar("ip_address"), // IP 주소
  status: deviceStatusEnum("status").notNull().default('offline'),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lockerRangeStart: integer("locker_range_start"), // 관리하는 락커 시작 번호
  lockerRangeEnd: integer("locker_range_end"), // 관리하는 락커 종료 번호
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Locker Hardware Table - 락커별 하드웨어 상태
export const lockerHardware = pgTable("locker_hardware", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockerNumber: integer("locker_number").notNull().unique(), // 락커 번호
  lockerType: lockerTypeEnum("locker_type").notNull().default('wardrobe'), // shoe/wardrobe
  pairNumber: integer("pair_number"), // 페어 번호 (신발장+옷장 = 같은 번호)
  hardwareState: lockerHardwareStateEnum("hardware_state").notNull().default('idle'),
  deviceId: varchar("device_id"), // 연결된 디바이스 ID
  lastCommandId: varchar("last_command_id"), // 마지막 명령 ID
  currentLockerLogId: varchar("current_locker_log_id"), // 현재 연결된 locker_log ID
  doorOpen: boolean("door_open").notNull().default(false), // 문 열림 상태
  keyInserted: boolean("key_inserted").notNull().default(true), // 키 삽입 상태
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Locker Commands Table - 락커 명령 기록 (앱 → 하드웨어)
export const lockerCommands = pgTable("locker_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockerNumber: integer("locker_number").notNull(),
  commandType: commandTypeEnum("command_type").notNull(),
  payload: text("payload"), // JSON 추가 데이터
  status: commandStatusEnum("status").notNull().default('pending'),
  deviceId: varchar("device_id"), // 대상 디바이스 ID
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // 만료 시간
  errorCode: varchar("error_code"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
});

// Locker Events Table - 락커 이벤트 기록 (하드웨어 → 앱)
export const lockerEvents = pgTable("locker_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lockerNumber: integer("locker_number").notNull(),
  eventType: eventTypeEnum("event_type").notNull(),
  source: eventSourceEnum("source").notNull().default('device'),
  deviceId: varchar("device_id"), // 발생한 디바이스 ID
  commandId: varchar("command_id"), // 관련 명령 ID
  payload: text("payload"), // JSON 추가 데이터
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
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

export const insertBarcodeMappingSchema = createInsertSchema(barcodeMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateBarcodeMappingSchema = z.object({
  barcode: z.string().optional(),
  lockerNumber: z.number().optional(),
});

export const insertRfidMappingSchema = createInsertSchema(rfidMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateRfidMappingSchema = z.object({
  rfidUid: z.string().optional(),
  lockerNumber: z.number().optional(),
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

export type BarcodeMapping = typeof barcodeMappings.$inferSelect;
export type InsertBarcodeMapping = z.infer<typeof insertBarcodeMappingSchema>;
export type UpdateBarcodeMapping = z.infer<typeof updateBarcodeMappingSchema>;

export type RfidMapping = typeof rfidMappings.$inferSelect;
export type InsertRfidMapping = z.infer<typeof insertRfidMappingSchema>;
export type UpdateRfidMapping = z.infer<typeof updateRfidMappingSchema>;

// ==================== Smart Locker System Schemas & Types ====================

// Hardware Device Schemas
export const insertHardwareDeviceSchema = createInsertSchema(hardwareDevices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateHardwareDeviceSchema = z.object({
  name: z.string().optional(),
  controllerType: z.string().optional(),
  firmwareVersion: z.string().optional(),
  sharedSecret: z.string().optional(),
  ipAddress: z.string().optional(),
  status: z.enum(['online', 'offline', 'error']).optional(),
  lastSeenAt: z.union([z.string(), z.date()]).optional(),
  lockerRangeStart: z.number().optional(),
  lockerRangeEnd: z.number().optional(),
});

// Locker Hardware Schemas
export const insertLockerHardwareSchema = createInsertSchema(lockerHardware).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLockerHardwareSchema = z.object({
  lockerType: z.enum(['shoe', 'wardrobe']).optional(),
  pairNumber: z.number().optional(),
  hardwareState: z.enum(['idle', 'reserved', 'shoe_unlocked', 'key_removed', 'wardrobe_in_use', 'checkout_pending', 'locked']).optional(),
  deviceId: z.string().optional(),
  lastCommandId: z.string().optional(),
  currentLockerLogId: z.string().optional(),
  doorOpen: z.boolean().optional(),
  keyInserted: z.boolean().optional(),
  lastEventAt: z.union([z.string(), z.date()]).optional(),
});

// Locker Command Schemas
export const insertLockerCommandSchema = createInsertSchema(lockerCommands).omit({
  id: true,
});

export const updateLockerCommandSchema = z.object({
  status: z.enum(['pending', 'sent', 'acknowledged', 'completed', 'failed', 'timeout']).optional(),
  sentAt: z.union([z.string(), z.date()]).optional(),
  acknowledgedAt: z.union([z.string(), z.date()]).optional(),
  completedAt: z.union([z.string(), z.date()]).optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  retryCount: z.number().optional(),
});

// Locker Event Schemas
export const insertLockerEventSchema = createInsertSchema(lockerEvents).omit({
  id: true,
});

// Smart Locker Types
export type HardwareDevice = typeof hardwareDevices.$inferSelect;
export type InsertHardwareDevice = z.infer<typeof insertHardwareDeviceSchema>;
export type UpdateHardwareDevice = z.infer<typeof updateHardwareDeviceSchema>;

export type LockerHardware = typeof lockerHardware.$inferSelect;
export type InsertLockerHardware = z.infer<typeof insertLockerHardwareSchema>;
export type UpdateLockerHardware = z.infer<typeof updateLockerHardwareSchema>;

export type LockerCommand = typeof lockerCommands.$inferSelect;
export type InsertLockerCommand = z.infer<typeof insertLockerCommandSchema>;
export type UpdateLockerCommand = z.infer<typeof updateLockerCommandSchema>;

export type LockerEvent = typeof lockerEvents.$inferSelect;
export type InsertLockerEvent = z.infer<typeof insertLockerEventSchema>;

// Locker Hardware State Type (for convenience)
export type LockerHardwareState = 'idle' | 'reserved' | 'shoe_unlocked' | 'key_removed' | 'wardrobe_in_use' | 'checkout_pending' | 'locked';
export type CommandType = 'unlock_shoe' | 'lock_shoe' | 'unlock_wardrobe' | 'lock_wardrobe' | 'lock_all' | 'sync_state' | 'heartbeat';
export type EventType = 'door_opened' | 'door_closed' | 'key_inserted' | 'key_removed' | 'lock_engaged' | 'lock_released' | 'device_online' | 'device_offline' | 'error';
