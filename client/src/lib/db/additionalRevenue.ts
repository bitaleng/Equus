import { db, generateId, rowsToObjects, saveDatabaseDebounced } from './core';
import { createExpense, getExpenseCategories } from './expenses';
import { getSettings } from './settings';
import { getBusinessDayRange, getBusinessDay } from '@shared/businessDay';


export function getTotalRentalRevenueByBusinessDay(businessDay: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT COALESCE(SUM(revenue), 0) as total FROM rental_transactions WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  
  return result[0].values[0][0] as number;
}

// Additional Revenue Items (rental items: 롱타올, 담요 등) operations
export function getAdditionalRevenueItems() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM additional_revenue_items ORDER BY sort_order ASC');
  
  if (result.length === 0) return [];
  
  return rowsToObjects(result[0]);
}

export function createAdditionalRevenueItem(item: {
  name: string;
  rentalFee: number;
  depositAmount: number;
  billingType?: 'rental' | 'simple';
  sortOrder?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  const sortOrder = item.sortOrder ?? 999;
  const billingType = item.billingType ?? 'rental';
  
  db.run(
    `INSERT INTO additional_revenue_items (id, name, rental_fee, deposit_amount, billing_type, sort_order, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, item.name, item.rentalFee, item.depositAmount, billingType, sortOrder, now, now]
  );
  
  saveDatabaseDebounced();
  return id;
}

export function updateAdditionalRevenueItem(id: string, updates: {
  name?: string;
  rentalFee?: number;
  depositAmount?: number;
  billingType?: 'rental' | 'simple';
  sortOrder?: number;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.rentalFee !== undefined) {
    sets.push('rental_fee = ?');
    values.push(updates.rentalFee);
  }
  if (updates.depositAmount !== undefined) {
    sets.push('deposit_amount = ?');
    values.push(updates.depositAmount);
  }
  if (updates.billingType !== undefined) {
    sets.push('billing_type = ?');
    values.push(updates.billingType);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }
  
  if (sets.length === 0) return;
  
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  db.run(
    `UPDATE additional_revenue_items SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  
  saveDatabaseDebounced();
}

export function deleteAdditionalRevenueItem(id: string) {
  if (!db) throw new Error('Database not initialized');
  
  db.run('DELETE FROM additional_revenue_items WHERE id = ? AND is_default = 0', [id]);
  saveDatabaseDebounced();
}

// Rental Transactions operations
export function createRentalTransaction(rental: {
  lockerLogId: string;
  itemId: string;
  itemName: string;
  lockerNumber: number;
  rentalTime: string | Date;
  returnTime: string | Date | null;
  businessDay: string;
  rentalFee: number;
  depositAmount: number;
  paymentMethod: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
  revenue: number;
  quantity?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  const quantity = Math.max(1, Math.floor(rental.quantity ?? 1));
  
  const rentalTimeStr = rental.rentalTime instanceof Date ? rental.rentalTime.toISOString() : rental.rentalTime;
  const returnTimeStr = rental.returnTime ? (rental.returnTime instanceof Date ? rental.returnTime.toISOString() : rental.returnTime) : null;
  
  db.run(
    `INSERT INTO rental_transactions 
     (id, locker_log_id, item_id, item_name, locker_number, rental_time, return_time, business_day,
      rental_fee, deposit_amount, payment_method, payment_cash, payment_card, payment_transfer, 
      deposit_status, revenue, quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      rental.lockerLogId,
      rental.itemId,
      rental.itemName,
      rental.lockerNumber,
      rentalTimeStr,
      returnTimeStr,
      rental.businessDay,
      rental.rentalFee,
      rental.depositAmount,
      rental.paymentMethod,
      rental.paymentCash || null,
      rental.paymentCard || null,
      rental.paymentTransfer || null,
      rental.depositStatus,
      rental.revenue,
      quantity,
      now,
      now
    ]
  );
  
  saveDatabaseDebounced();
  return id;
}

export function updateRentalTransaction(id: string, updates: {
  depositStatus?: 'received' | 'refunded' | 'forfeited' | 'none';
  returnTime?: Date;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  businessDay?: string;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  revenue?: number;
  returnCompleted?: boolean;
  rentalFee?: number;
  quantity?: number;
}) {
  if (!db) throw new Error('Database not initialized');
  
  // Get settings for business day calculation
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour || 10;
  
  // Get current transaction to calculate new revenue and prepare updates
  const result = db.exec('SELECT rental_fee, deposit_amount, deposit_status, return_time, payment_method, business_day, payment_cash, payment_card, payment_transfer, rental_time, item_name, locker_number FROM rental_transactions WHERE id = ?', [id]);
  
  if (result.length === 0 || result[0].values.length === 0) return;
  
  const currentRentalFee = result[0].values[0][0] as number;
  const depositAmount = result[0].values[0][1] as number;
  const currentDepositStatus = result[0].values[0][2] as string;
  const currentReturnTime = result[0].values[0][3];
  const currentPaymentMethod = result[0].values[0][4];
  const currentBusinessDay = result[0].values[0][5];
  const currentPaymentCash = result[0].values[0][6];
  const currentPaymentCard = result[0].values[0][7];
  const currentPaymentTransfer = result[0].values[0][8];
  const rentalTime = result[0].values[0][9] as string;
  const itemName = result[0].values[0][10] as string;
  const lockerNumber = result[0].values[0][11] as number;
  const rentalFee = updates.rentalFee !== undefined ? updates.rentalFee : currentRentalFee;
  
  // Determine final values
  const finalDepositStatus = updates.depositStatus || currentDepositStatus;
  const finalReturnTime = updates.returnTime ? updates.returnTime.toISOString() : currentReturnTime;
  const finalPaymentMethod = updates.paymentMethod || currentPaymentMethod;
  const finalBusinessDay = updates.businessDay || currentBusinessDay;
  const finalPaymentCash = updates.paymentCash !== undefined ? updates.paymentCash : currentPaymentCash;
  const finalPaymentCard = updates.paymentCard !== undefined ? updates.paymentCard : currentPaymentCard;
  const finalPaymentTransfer = updates.paymentTransfer !== undefined ? updates.paymentTransfer : currentPaymentTransfer;
  
  // Calculate business days for rental and return times
  const rentalBusinessDay = getBusinessDay(new Date(rentalTime as string), businessDayStartHour);
  const returnBusinessDay = finalReturnTime ? getBusinessDay(new Date(finalReturnTime as string), businessDayStartHour) : rentalBusinessDay;
  
  // Calculate revenue based on deposit status
  let revenue = updates.revenue !== undefined ? updates.revenue : rentalFee;
  let adjustedPaymentCash = finalPaymentCash;
  let adjustedPaymentCard = finalPaymentCard;
  let adjustedPaymentTransfer = finalPaymentTransfer;
  
  // Calculate target revenue if not provided
  if (updates.revenue === undefined) {
    if (finalDepositStatus === 'received') {
      revenue += depositAmount; // 대여 시: 렌탈비 + 보증금
    } else if (finalDepositStatus === 'forfeited') {
      // 몰수 시 영업일 비교 (rental_time과 return_time의 영업일 비교)
      if (rentalBusinessDay === returnBusinessDay) {
        revenue += depositAmount; // 같은 영업일: 렌탈비 + 보증금
      }
      // 다른 영업일: 렌탈비만 (보증금은 이미 대여일 매출)
    }
    // refunded: 렌탈비만
  }
  
  // Always adjust payment amounts proportionally to match revenue exactly
  // (revenue가 명시적으로 전달되어도 payment* 필드 조정)
  const cashNum = Number(currentPaymentCash) || 0;
  const cardNum = Number(currentPaymentCard) || 0;
  const transferNum = Number(currentPaymentTransfer) || 0;
  const originalTotal = cashNum + cardNum + transferNum;
  
  if (originalTotal > 0 && revenue !== originalTotal) {
    const ratio = revenue / originalTotal;
    // Floor all channels first
    adjustedPaymentCash = Math.floor(cashNum * ratio);
    adjustedPaymentCard = Math.floor(cardNum * ratio);
    adjustedPaymentTransfer = Math.floor(transferNum * ratio);
    
    // Calculate remainder and assign to channel with largest original amount
    const remainder = revenue - adjustedPaymentCash - adjustedPaymentCard - adjustedPaymentTransfer;
    if (remainder !== 0) {
      const amounts = [
        { value: cashNum, index: 'cash' as const },
        { value: cardNum, index: 'card' as const },
        { value: transferNum, index: 'transfer' as const }
      ];
      const largest = amounts.reduce((max, curr) => curr.value > max.value ? curr : max);
      
      if (largest.index === 'cash') adjustedPaymentCash += remainder;
      else if (largest.index === 'card') adjustedPaymentCard += remainder;
      else adjustedPaymentTransfer += remainder;
    }
  }
  
  // Create expense for cross-day refunds (다른 영업일 환급 시 지출 생성)
  const isRefunding = currentDepositStatus !== 'refunded' && finalDepositStatus === 'refunded';
  const isCrossDay = rentalBusinessDay !== returnBusinessDay;
  
  if (isRefunding && isCrossDay && depositAmount > 0 && finalReturnTime) {
    // 보증금환급 카테고리 찾기
    const categories = getExpenseCategories();
    const refundCategory = categories.find(c => c.name === '보증금환급');
    
    if (refundCategory) {
      const refundTime = new Date(finalReturnTime as string);
      const timeStr = refundTime.toTimeString().slice(0, 5); // HH:MM
      const paymentMethodForExpense = (finalPaymentMethod as 'cash' | 'card' | 'transfer') || 'cash';
      
      // 지출 자동 생성
      createExpense({
        date: returnBusinessDay,
        time: timeStr,
        category: refundCategory.name,
        amount: depositAmount,
        quantity: 1,
        paymentMethod: paymentMethodForExpense,
        paymentCash: paymentMethodForExpense === 'cash' ? depositAmount : undefined,
        paymentCard: paymentMethodForExpense === 'card' ? depositAmount : undefined,
        paymentTransfer: paymentMethodForExpense === 'transfer' ? depositAmount : undefined,
        businessDay: returnBusinessDay,
        notes: `${itemName} 보증금 환급 (락커 ${lockerNumber})`,
      });
    }
  }
  
  // Handle return_completed update
  const returnCompletedValue = updates.returnCompleted !== undefined ? (updates.returnCompleted ? 1 : 0) : null;
  const quantityValue = updates.quantity !== undefined ? Math.max(1, Math.floor(updates.quantity)) : null;
  
  if (returnCompletedValue !== null) {
    db.run(
      `UPDATE rental_transactions 
       SET deposit_status = ?, revenue = ?, return_time = ?, payment_method = ?, business_day = ?, 
           payment_cash = ?, payment_card = ?, payment_transfer = ?, return_completed = ?,
           rental_fee = ?, quantity = COALESCE(?, quantity, 1), updated_at = ?
       WHERE id = ?`,
      [finalDepositStatus, revenue, finalReturnTime, finalPaymentMethod, finalBusinessDay, 
       adjustedPaymentCash, adjustedPaymentCard, adjustedPaymentTransfer, returnCompletedValue,
       rentalFee, quantityValue, new Date().toISOString(), id]
    );
  } else {
    db.run(
      `UPDATE rental_transactions 
       SET deposit_status = ?, revenue = ?, return_time = ?, payment_method = ?, business_day = ?, 
           payment_cash = ?, payment_card = ?, payment_transfer = ?,
           rental_fee = ?, quantity = COALESCE(?, quantity, 1), updated_at = ?
       WHERE id = ?`,
      [finalDepositStatus, revenue, finalReturnTime, finalPaymentMethod, finalBusinessDay, 
       adjustedPaymentCash, adjustedPaymentCard, adjustedPaymentTransfer,
       rentalFee, quantityValue, new Date().toISOString(), id]
    );
  }
  
  saveDatabaseDebounced();
}

export function deleteRentalTransaction(id: string): void {
  if (!db) throw new Error('Database not initialized');
  db.run('DELETE FROM rental_transactions WHERE id = ?', [id]);
  saveDatabaseDebounced();
}

export function getRentalTransactionsByLockerLog(lockerLogId: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM rental_transactions WHERE locker_log_id = ? ORDER BY created_at DESC`,
    [lockerLogId]
  );
  
  if (result.length === 0) return [];
  
  return rowsToObjects(result[0]);
}

/**
 * 날짜 범위로 렌탈 거래 조회 (rental_time 기준)
 * 입출기록 페이지의 날짜 필터링용 - 해당 기간에 대여한 거래만 반환
 */
export function getRentalTransactionsByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Convert dates to datetime range in local timezone, then to ISO for storage comparison
  const startDateTime = new Date(startDate + 'T00:00:00').toISOString();
  const endDateTime = new Date(endDate + 'T23:59:59.999').toISOString();
  
  const result = db.exec(
    `SELECT * FROM rental_transactions 
     WHERE rental_time >= ? AND rental_time <= ?
     ORDER BY rental_time DESC`,
    [startDateTime, endDateTime]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

/**
 * 시간 범위로 렌탈 거래 조회 (rental_time 기준)
 * 입출기록 페이지의 시간 필터링용 - 해당 시간대에 대여한 거래만 반환
 */
export function getRentalTransactionsByDateTimeRange(startDateTime: string, endDateTime: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM rental_transactions 
     WHERE rental_time >= ? AND rental_time <= ?
     ORDER BY rental_time DESC`,
    [startDateTime, endDateTime]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

/**
 * 특정 비즈니스 데이의 모든 렌탈 거래 조회
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
/**
 * 모든 렌탈 거래 조회 (전체)
 */
export function getAllRentalTransactions() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM rental_transactions ORDER BY rental_time DESC');
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

export function getRentalTransactionsByBusinessDayRange(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - 영업일 시작 시각을 기준 시간으로 사용 (T12:00:00 고정값은 영업일이 12시 이후 시작인 경우 오동작)
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  const result = db.exec(
    `SELECT * FROM rental_transactions 
     WHERE strftime('%s', rental_time) >= ? AND strftime('%s', rental_time) <= ?
     ORDER BY rental_time DESC`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}
