import { db, generateId, saveDatabaseDebounced } from './core';
import { getBusinessDayRange } from '@shared/businessDay';


// ===== Stage 1: Additional Fee Events =====

export function createAdditionalFeeEvent(event: {
  lockerLogId: string;
  lockerNumber: number;
  checkoutTime: Date;
  feeAmount: number;
  originalFeeAmount?: number;
  discountAmount?: number;
  businessDay: string;
  paymentMethod: string;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const checkoutTimeStr = event.checkoutTime.toISOString();
  const createdAt = new Date().toISOString();
  
  db.run(
    `INSERT INTO additional_fee_events 
    (id, locker_log_id, locker_number, checkout_time, fee_amount, original_fee_amount, discount_amount, 
     business_day, payment_method, payment_cash, payment_card, payment_transfer, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, event.lockerLogId, event.lockerNumber, checkoutTimeStr, event.feeAmount, 
     event.originalFeeAmount || null, event.discountAmount || 0, event.businessDay, event.paymentMethod, 
     event.paymentCash || null, event.paymentCard || null, event.paymentTransfer || null, createdAt]
  );
  
  saveDatabaseDebounced();
  return id;
}

export function getAdditionalFeeEventsByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events WHERE business_day = ? ORDER BY checkout_time DESC`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

export function getAdditionalFeeEventsByLockerLog(lockerLogId: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events WHERE locker_log_id = ? ORDER BY created_at DESC`,
    [lockerLogId]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

/** 여러 락커 로그의 추가요금 이벤트를 일괄 조회 (N+1 방지) */
export function getAdditionalFeeEventsForLockerLogs(lockerLogIds: string[]) {
  if (!db) throw new Error('Database not initialized');
  if (!lockerLogIds.length) return [] as ReturnType<typeof getAdditionalFeeEventsByLockerLog>;

  const mapRow = (row: any) => ({
    id: row[0],
    lockerLogId: row[1] as string,
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  });

  const all: ReturnType<typeof getAdditionalFeeEventsByLockerLog> = [];
  const CHUNK = 200;
  for (let i = 0; i < lockerLogIds.length; i += CHUNK) {
    const chunk = lockerLogIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const result = db.exec(
      `SELECT * FROM additional_fee_events WHERE locker_log_id IN (${placeholders}) ORDER BY created_at DESC`,
      chunk
    );
    if (result.length > 0 && result[0].values.length > 0) {
      all.push(...result[0].values.map(mapRow));
    }
  }
  return all;
}

export function getTotalAdditionalFeesByBusinessDay(businessDay: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT COALESCE(SUM(fee_amount), 0) as total FROM additional_fee_events WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  
  return result[0].values[0][0] as number;
}

export function getAdditionalFeeEventsByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Convert dates to datetime range in local timezone, then to ISO for storage comparison
  const startDateTime = new Date(startDate + 'T00:00:00').toISOString();
  const endDateTime = new Date(endDate + 'T23:59:59.999').toISOString();
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events 
     WHERE checkout_time >= ? AND checkout_time <= ?
     ORDER BY checkout_time DESC`,
    [startDateTime, endDateTime]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

export function getAdditionalFeeEventsByDateTimeRange(startDateTime: string, endDateTime: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events 
     WHERE checkout_time >= ? AND checkout_time <= ?
     ORDER BY checkout_time DESC`,
    [startDateTime, endDateTime]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

/**
 * 특정 비즈니스 데이의 모든 추가요금 이벤트 조회
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
/**
 * 모든 추가요금 이벤트 조회 (전체)
 */
export function getAllAdditionalFeeEvents() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM additional_fee_events ORDER BY checkout_time DESC');
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    originalFeeAmount: row[5],
    discountAmount: row[6],
    businessDay: row[7],
    paymentMethod: row[8],
    paymentCash: row[9],
    paymentCard: row[10],
    paymentTransfer: row[11],
    createdAt: row[12],
  }));
}

export function getAdditionalFeeEventsByBusinessDayRange(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - 영업일 시작 시각을 기준 시간으로 사용 (T12:00:00 고정값은 영업일이 12시 이후 시작인 경우 오동작)
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  const result = db.exec(
    `SELECT afe.*, ll.business_day as entry_business_day 
     FROM additional_fee_events afe
     LEFT JOIN locker_logs ll ON afe.locker_log_id = ll.id
     WHERE strftime('%s', afe.checkout_time) >= ? AND strftime('%s', afe.checkout_time) <= ?
     ORDER BY afe.checkout_time DESC`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    originalFeeAmount: row[5],
    discountAmount: row[6],
    businessDay: row[7],
    paymentMethod: row[8],
    paymentCash: row[9],
    paymentCard: row[10],
    paymentTransfer: row[11],
    createdAt: row[12],
    entryBusinessDay: row[13], // 입실 영업일 추가
  }));
}
