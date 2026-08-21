import { db, saveDatabaseDebounced } from './core';
import { updateDailySummary } from './dailySummaries';
import { getSettings } from './settings';
import { getAdditionalRevenueItems } from './additionalRevenue';
import { getBusinessDayRange, getBusinessDay } from '@shared/businessDay';


// ============================================
// Closing Days (정산) Functions
// ============================================

export function createClosingDay(data: {
  businessDay: string;
  startTime: string;
  endTime: string;
  openingFloat: number;
  targetFloat: number;
  actualCash?: number;
  expectedCash?: number;
  discrepancy?: number;
  bankDeposit?: number;
  notes?: string;
  memo?: string;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO closing_days 
     (id, business_day, start_time, end_time, opening_float, target_float, 
      actual_cash, expected_cash, discrepancy, bank_deposit, notes, memo, is_confirmed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      data.businessDay,
      data.startTime,
      data.endTime,
      data.openingFloat,
      data.targetFloat,
      data.actualCash || null,
      data.expectedCash || null,
      data.discrepancy || 0,
      data.bankDeposit || null,
      data.notes || null,
      data.memo || null,
      now,
      now
    ]
  );
  
  saveDatabaseDebounced();
  return id;
}

export function getClosingDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM closing_days WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const row = result[0].values[0];
  return {
    id: row[0],
    businessDay: row[1],
    startTime: row[2],
    endTime: row[3],
    openingFloat: row[4],
    targetFloat: row[5],
    actualCash: row[6],
    expectedCash: row[7],
    discrepancy: row[8],
    bankDeposit: row[9],
    notes: row[10],
    memo: row[11],
    isConfirmed: row[12] === 1,
    confirmedAt: row[13],
    createdAt: row[14],
    updatedAt: row[15],
  };
}

export function getClosingDays() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(`SELECT * FROM closing_days ORDER BY business_day DESC`);
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    businessDay: row[1],
    startTime: row[2],
    endTime: row[3],
    openingFloat: row[4],
    targetFloat: row[5],
    actualCash: row[6],
    expectedCash: row[7],
    discrepancy: row[8],
    bankDeposit: row[9],
    notes: row[10],
    isConfirmed: row[11] === 1,
    confirmedAt: row[12],
    createdAt: row[13],
    updatedAt: row[14],
  }));
}

export function getLatestClosingDay() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM closing_days ORDER BY business_day DESC LIMIT 1`
  );
  
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const row = result[0].values[0];
  return {
    id: row[0],
    businessDay: row[1],
    startTime: row[2],
    endTime: row[3],
    openingFloat: row[4],
    targetFloat: row[5],
    actualCash: row[6],
    expectedCash: row[7],
    discrepancy: row[8],
    bankDeposit: row[9],
    notes: row[10],
    memo: row[11],
    isConfirmed: row[12] === 1,
    confirmedAt: row[13],
    createdAt: row[14],
    updatedAt: row[15],
  };
}

export function updateClosingDay(businessDay: string, updates: {
  startTime?: string;
  endTime?: string;
  openingFloat?: number;
  targetFloat?: number;
  actualCash?: number;
  expectedCash?: number;
  discrepancy?: number;
  bankDeposit?: number;
  notes?: string;
  memo?: string;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.startTime !== undefined) {
    fields.push('start_time = ?');
    values.push(updates.startTime);
  }
  if (updates.endTime !== undefined) {
    fields.push('end_time = ?');
    values.push(updates.endTime);
  }
  if (updates.openingFloat !== undefined) {
    fields.push('opening_float = ?');
    values.push(updates.openingFloat);
  }
  if (updates.targetFloat !== undefined) {
    fields.push('target_float = ?');
    values.push(updates.targetFloat);
  }
  if (updates.actualCash !== undefined) {
    fields.push('actual_cash = ?');
    values.push(updates.actualCash);
  }
  if (updates.expectedCash !== undefined) {
    fields.push('expected_cash = ?');
    values.push(updates.expectedCash);
  }
  if (updates.discrepancy !== undefined) {
    fields.push('discrepancy = ?');
    values.push(updates.discrepancy);
  }
  if (updates.bankDeposit !== undefined) {
    fields.push('bank_deposit = ?');
    values.push(updates.bankDeposit);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.memo !== undefined) {
    fields.push('memo = ?');
    values.push(updates.memo);
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  
  values.push(businessDay);
  
  db.run(
    `UPDATE closing_days SET ${fields.join(', ')} WHERE business_day = ?`,
    values
  );
  
  saveDatabaseDebounced();
}

export function confirmClosingDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const now = new Date().toISOString();
  
  db.run(
    `UPDATE closing_days 
     SET is_confirmed = 1, confirmed_at = ?, updated_at = ?
     WHERE business_day = ?`,
    [now, now, businessDay]
  );
  
  saveDatabaseDebounced();
}

// Get detailed sales breakdown by business day (using business day RANGE for accurate aggregation)
export function getDetailedSalesByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Get UTC start/end timestamps for the business day range
  const settings = getSettings();
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(settings.businessDayStartHour).padStart(2, '0') + ':00:00'), settings.businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Get base entry sales (입실 기본요금) - filter by entry_time within business day range
  const entryResult = db.exec(
    `SELECT 
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer_total
     FROM locker_logs
     WHERE strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const entrySales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (entryResult.length > 0 && entryResult[0].values.length > 0) {
    const row = entryResult[0].values[0];
    entrySales.cash = row[0] as number || 0;
    entrySales.card = row[1] as number || 0;
    entrySales.transfer = row[2] as number || 0;
    entrySales.total = entrySales.cash + entrySales.card + entrySales.transfer;
  }
  
  // Get additional fee sales (추가요금) - filter by checkout_time within business day range
  const additionalResult = db.exec(
    `SELECT 
      COALESCE(SUM(COALESCE(payment_cash, 0)), 0) as cash_total,
      COALESCE(SUM(COALESCE(payment_card, 0)), 0) as card_total,
      COALESCE(SUM(COALESCE(payment_transfer, 0)), 0) as transfer_total
     FROM additional_fee_events
     WHERE strftime('%s', checkout_time) >= ? AND strftime('%s', checkout_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const additionalSales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (additionalResult.length > 0 && additionalResult[0].values.length > 0) {
    const row = additionalResult[0].values[0];
    additionalSales.cash = row[0] as number || 0;
    additionalSales.card = row[1] as number || 0;
    additionalSales.transfer = row[2] as number || 0;
    additionalSales.total = additionalSales.cash + additionalSales.card + additionalSales.transfer;
  }
  
  return {
    entrySales,
    additionalSales,
    totalEntrySales: {
      cash: entrySales.cash + additionalSales.cash,
      card: entrySales.card + additionalSales.card,
      transfer: entrySales.transfer + additionalSales.transfer,
      total: entrySales.total + additionalSales.total
    }
  };
}

// Get rental revenue breakdown by business day
export function getRentalRevenueBreakdownByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Get all rental items
  const items = getAdditionalRevenueItems();
  
  const breakdown: {
    [itemName: string]: {
      rentalFee: { cash: number; card: number; transfer: number; total: number };
      depositForfeited: { cash: number; card: number; transfer: number; total: number };
      depositAmount: number;
    }
  } = {};
  
  items.forEach(item => {
    breakdown[item.name] = {
      rentalFee: { cash: 0, card: 0, transfer: 0, total: 0 },
      depositForfeited: { cash: 0, card: 0, transfer: 0, total: 0 },
      depositAmount: 0  // Will be set to the max deposit amount found in transactions
    };
  });
  
  // Get UTC start/end timestamps for the business day range
  const settings = getSettings();
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(settings.businessDayStartHour).padStart(2, '0') + ':00:00'), settings.businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Get rental transactions for this business day - filter by rental_time within business day range
  const result = db.exec(
    `SELECT 
      item_name,
      rental_fee,
      deposit_amount,
      deposit_status,
      COALESCE(payment_cash, 0) as payment_cash,
      COALESCE(payment_card, 0) as payment_card,
      COALESCE(payment_transfer, 0) as payment_transfer,
      payment_method,
      rental_time,
      return_time,
      business_day
     FROM rental_transactions
     WHERE strftime('%s', rental_time) >= ? AND strftime('%s', rental_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  if (result.length > 0 && result[0].values.length > 0) {
    result[0].values.forEach((row: any) => {
      const itemName = row[0] as string;
      const rentalFee = row[1] as number;
      const depositAmount = row[2] as number;
      const depositStatus = row[3] as string;
      const paymentCash = row[4] as number;
      const paymentCard = row[5] as number;
      const paymentTransfer = row[6] as number;
      const paymentMethod = row[7] as string | null;
      const rentalTime = row[8] as string;
      const returnTime = row[9] as string | null;
      const rentalBusinessDay = row[10] as string;
      
      if (!breakdown[itemName]) {
        breakdown[itemName] = {
          rentalFee: { cash: 0, card: 0, transfer: 0, total: 0 },
          depositForfeited: { cash: 0, card: 0, transfer: 0, total: 0 },
          depositAmount: depositAmount
        };
      } else {
        // Update depositAmount to the maximum found (for display purposes)
        if (depositAmount > breakdown[itemName].depositAmount) {
          breakdown[itemName].depositAmount = depositAmount;
        }
      }
      
      // Calculate total revenue for this transaction
      let totalRevenue = rentalFee;
      if (depositStatus === 'received') {
        // 대여 시: 렌탈비 + 보증금
        totalRevenue += depositAmount;
      } else if (depositStatus === 'forfeited' && returnTime) {
        // 몰수 시: 영업일 비교
        const returnBusinessDay = getBusinessDay(new Date(returnTime), settings.businessDayStartHour);
        if (rentalBusinessDay === returnBusinessDay) {
          // 같은 영업일: 렌탈비 + 보증금
          totalRevenue += depositAmount;
        }
        // 다른 영업일: 렌탈비만 (보증금은 이미 대여일 매출)
      }
      
      // For refunded deposits, exclude deposit from payment calculation
      // payment_cash/card/transfer may include deposit that was refunded, so we need to subtract it
      let effectivePaymentCash = paymentCash;
      let effectivePaymentCard = paymentCard;
      let effectivePaymentTransfer = paymentTransfer;
      
      if (depositStatus === 'refunded') {
        // Original payment included deposit, but it was refunded
        // So we need to subtract deposit from the total payment to get only rental fee payment
        const totalPayment = paymentCash + paymentCard + paymentTransfer;
        if (totalPayment > 0 && depositAmount > 0) {
          // Proportionally reduce each payment method by deposit amount
          const depositRatio = depositAmount / totalPayment;
          effectivePaymentCash = Math.round(paymentCash * (1 - depositRatio));
          effectivePaymentCard = Math.round(paymentCard * (1 - depositRatio));
          effectivePaymentTransfer = Math.round(paymentTransfer * (1 - depositRatio));
        }
      }
      
      const totalPayment = effectivePaymentCash + effectivePaymentCard + effectivePaymentTransfer;
      
      if (totalRevenue > 0 && totalPayment > 0) {
        // Calculate rental fee portion
        const rentalFeeRatio = rentalFee / totalRevenue;
        breakdown[itemName].rentalFee.cash += Math.round(effectivePaymentCash * rentalFeeRatio);
        breakdown[itemName].rentalFee.card += Math.round(effectivePaymentCard * rentalFeeRatio);
        breakdown[itemName].rentalFee.transfer += Math.round(effectivePaymentTransfer * rentalFeeRatio);
        breakdown[itemName].rentalFee.total += rentalFee;
        
        // Calculate deposit portion (only when included in totalRevenue)
        const depositIncluded = (depositStatus === 'received') || 
          (depositStatus === 'forfeited' && returnTime && rentalBusinessDay === getBusinessDay(new Date(returnTime), settings.businessDayStartHour));
        
        if (depositIncluded && totalRevenue > rentalFee) {
          const depositRatio = depositAmount / totalRevenue;
          breakdown[itemName].depositForfeited.cash += Math.round(effectivePaymentCash * depositRatio);
          breakdown[itemName].depositForfeited.card += Math.round(effectivePaymentCard * depositRatio);
          breakdown[itemName].depositForfeited.transfer += Math.round(effectivePaymentTransfer * depositRatio);
          breakdown[itemName].depositForfeited.total += depositAmount;
        }
      } else if (totalRevenue > 0 && paymentMethod) {
        // Legacy data fallback: Use payment_method to allocate revenue
        // This handles old data where payment_cash/card/transfer weren't populated
        const depositIncluded = (depositStatus === 'received') || 
          (depositStatus === 'forfeited' && returnTime && rentalBusinessDay === getBusinessDay(new Date(returnTime), settings.businessDayStartHour));
        
        if (paymentMethod === 'cash') {
          breakdown[itemName].rentalFee.cash += rentalFee;
          if (depositIncluded) {
            breakdown[itemName].depositForfeited.cash += depositAmount;
          }
        } else if (paymentMethod === 'card') {
          breakdown[itemName].rentalFee.card += rentalFee;
          if (depositIncluded) {
            breakdown[itemName].depositForfeited.card += depositAmount;
          }
        } else if (paymentMethod === 'transfer') {
          breakdown[itemName].rentalFee.transfer += rentalFee;
          if (depositIncluded) {
            breakdown[itemName].depositForfeited.transfer += depositAmount;
          }
        }
        breakdown[itemName].rentalFee.total += rentalFee;
        if (depositIncluded) {
          breakdown[itemName].depositForfeited.total += depositAmount;
        }
      } else {
        // Last resort fallback: just add totals without payment method breakdown
        const depositIncluded = (depositStatus === 'received') || 
          (depositStatus === 'forfeited' && returnTime && rentalBusinessDay === getBusinessDay(new Date(returnTime), settings.businessDayStartHour));
        
        breakdown[itemName].rentalFee.total += rentalFee;
        if (depositIncluded) {
          breakdown[itemName].depositForfeited.total += depositAmount;
        }
      }
    });
  }
  
  // Calculate totals
  const totals = {
    rentalFee: { cash: 0, card: 0, transfer: 0, total: 0 },
    depositForfeited: { cash: 0, card: 0, transfer: 0, total: 0 },
    grandTotal: { cash: 0, card: 0, transfer: 0, total: 0 }
  };
  
  Object.values(breakdown).forEach(item => {
    totals.rentalFee.cash += item.rentalFee.cash;
    totals.rentalFee.card += item.rentalFee.card;
    totals.rentalFee.transfer += item.rentalFee.transfer;
    totals.rentalFee.total += item.rentalFee.total;
    
    totals.depositForfeited.cash += item.depositForfeited.cash;
    totals.depositForfeited.card += item.depositForfeited.card;
    totals.depositForfeited.transfer += item.depositForfeited.transfer;
    totals.depositForfeited.total += item.depositForfeited.total;
  });
  
  totals.grandTotal.cash = totals.rentalFee.cash + totals.depositForfeited.cash;
  totals.grandTotal.card = totals.rentalFee.card + totals.depositForfeited.card;
  totals.grandTotal.transfer = totals.rentalFee.transfer + totals.depositForfeited.transfer;
  totals.grandTotal.total = totals.rentalFee.total + totals.depositForfeited.total;
  
  return {
    breakdown,
    totals
  };
}

// Get detailed sales summary for a range of business days
export function getDetailedSalesByBusinessDayRange(startBusinessDay: string, endBusinessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Get UTC start/end timestamps for the business day range
  const settings = getSettings();
  const refHour = String(settings.businessDayStartHour).padStart(2, '0');
  const startDate = new Date(startBusinessDay + 'T' + refHour + ':00:00');
  const endDate = new Date(endBusinessDay + 'T' + refHour + ':00:00');
  
  const { start: rangeStart } = getBusinessDayRange(startDate, settings.businessDayStartHour);
  const { end: rangeEnd } = getBusinessDayRange(endDate, settings.businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(rangeStart.getTime() / 1000);
  const endUnix = Math.floor(rangeEnd.getTime() / 1000);
  
  // Get base entry sales (입실 기본요금) - filter by entry_time within range
  const entryResult = db.exec(
    `SELECT 
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer_total
     FROM locker_logs
     WHERE strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const entrySales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (entryResult.length > 0 && entryResult[0].values.length > 0) {
    const row = entryResult[0].values[0];
    entrySales.cash = row[0] as number;
    entrySales.card = row[1] as number;
    entrySales.transfer = row[2] as number;
    entrySales.total = entrySales.cash + entrySales.card + entrySales.transfer;
  }
  
  // Get additional fee sales (추가요금) - filter by checkout_time within range
  const additionalResult = db.exec(
    `SELECT 
      COALESCE(SUM(COALESCE(payment_cash, 0)), 0) as cash_total,
      COALESCE(SUM(COALESCE(payment_card, 0)), 0) as card_total,
      COALESCE(SUM(COALESCE(payment_transfer, 0)), 0) as transfer_total
     FROM additional_fee_events
     WHERE strftime('%s', checkout_time) >= ? AND strftime('%s', checkout_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const additionalSales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (additionalResult.length > 0 && additionalResult[0].values.length > 0) {
    const row = additionalResult[0].values[0];
    additionalSales.cash = row[0] as number;
    additionalSales.card = row[1] as number;
    additionalSales.transfer = row[2] as number;
    additionalSales.total = additionalSales.cash + additionalSales.card + additionalSales.transfer;
  }
  
  // Get rental sales (대여물품 매출) - filter by rental_time within range
  const rentalResult = db.exec(
    `SELECT 
      COALESCE(SUM(CASE WHEN deposit_status = 'received' OR deposit_status = 'refunded' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN deposit_status = 'received' OR deposit_status = 'refunded' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card_total,
      COALESCE(SUM(CASE WHEN deposit_status = 'received' OR deposit_status = 'refunded' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer_total
     FROM rental_transactions
     WHERE strftime('%s', rental_time) >= ? AND strftime('%s', rental_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const rentalSales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (rentalResult.length > 0 && rentalResult[0].values.length > 0) {
    const row = rentalResult[0].values[0];
    rentalSales.cash = row[0] as number;
    rentalSales.card = row[1] as number;
    rentalSales.transfer = row[2] as number;
    rentalSales.total = rentalSales.cash + rentalSales.card + rentalSales.transfer;
  }
  
  return {
    entrySales,
    additionalSales,
    rentalSales,
    totalEntrySales: {
      cash: entrySales.cash + additionalSales.cash,
      card: entrySales.card + additionalSales.card,
      transfer: entrySales.transfer + additionalSales.transfer,
      total: entrySales.total + additionalSales.total
    }
  };
}
// Recalculate business_day for all existing records
export function recalculateAllBusinessDays() {
  if (!db) throw new Error('Database not initialized');
  
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  
  // Import getBusinessDay from shared module
  const { getBusinessDay } = require('@shared/businessDay');
  
  let updatedCount = 0;
  
  // 1. Update locker_logs based on entry_time
  const lockerLogs = db.exec('SELECT id, entry_time FROM locker_logs');
  if (lockerLogs.length > 0 && lockerLogs[0].values.length > 0) {
    lockerLogs[0].values.forEach((row: any) => {
      const id = row[0];
      const entryTime = new Date(row[1]);
      const correctBusinessDay = getBusinessDay(entryTime, businessDayStartHour);
      
      db!.run(
        'UPDATE locker_logs SET business_day = ? WHERE id = ?',
        [correctBusinessDay, id]
      );
      updatedCount++;
    });
  }
  
  // 2. Update rental_transactions based on rental_time
  const rentalTransactions = db.exec('SELECT id, rental_time FROM rental_transactions');
  if (rentalTransactions.length > 0 && rentalTransactions[0].values.length > 0) {
    rentalTransactions[0].values.forEach((row: any) => {
      const id = row[0];
      const rentalTime = new Date(row[1]);
      const correctBusinessDay = getBusinessDay(rentalTime, businessDayStartHour);
      
      db!.run(
        'UPDATE rental_transactions SET business_day = ? WHERE id = ?',
        [correctBusinessDay, id]
      );
      updatedCount++;
    });
  }
  
  // 3. Update additional_fee_events based on checkout_time
  const additionalFeeEvents = db.exec('SELECT id, checkout_time FROM additional_fee_events');
  if (additionalFeeEvents.length > 0 && additionalFeeEvents[0].values.length > 0) {
    additionalFeeEvents[0].values.forEach((row: any) => {
      const id = row[0];
      const checkoutTime = new Date(row[1]);
      const correctBusinessDay = getBusinessDay(checkoutTime, businessDayStartHour);
      
      db!.run(
        'UPDATE additional_fee_events SET business_day = ? WHERE id = ?',
        [correctBusinessDay, id]
      );
      updatedCount++;
    });
  }
  
  // 4. Recalculate all daily summaries
  const allBusinessDays = new Set<string>();
  
  // Get all unique business days from locker_logs
  const businessDaysResult = db.exec('SELECT DISTINCT business_day FROM locker_logs');
  if (businessDaysResult.length > 0 && businessDaysResult[0].values.length > 0) {
    businessDaysResult[0].values.forEach((row: any) => {
      allBusinessDays.add(row[0]);
    });
  }
  
  // Recalculate summary for each business day
  allBusinessDays.forEach(businessDay => {
    updateDailySummary(businessDay);
  });
  
  saveDatabaseDebounced();
  
  return updatedCount;
}

