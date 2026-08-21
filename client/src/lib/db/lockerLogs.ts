import { db, generateId, rowsToObjects, saveDatabaseDebounced } from './core';
import { updateDailySummary } from './dailySummaries';
import { getSettings, getTimeTypeWithSettings } from './settings';
import {
  getBusinessDayRange,
  getBusinessDay,
  getBasePrice,
} from '@shared/businessDay';


// Entry operations
// entryTime: 옵션창이 열린 시간 (스캔 시간). 지정하지 않으면 현재 시간 사용
export function createEntry(entry: {
  lockerNumber: number;
  timeType: string;
  basePrice: number;
  finalPrice: number;
  businessDay: string;
  optionType: string;
  optionAmount?: number;
  notes?: string;
  paymentMethod?: string;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  rentalItems?: string[];
  entryTime?: Date;  // 입실시간 (옵션창 열린 시간으로 기록, 미지정 시 현재시간)
  deferredPayment?: boolean;  // 후불결제 여부
  customerMemo?: string;  // 손님 메모
  noAdditionalFee?: boolean;  // 추가요금없음 (VIP 등)
  prepaidAdditionalFee?: number;  // 추가요금 선지급 금액
  isCashReceipt?: boolean;  // 현금영수증 발행 여부
  additionalFeePaymentMethod?: string;  // 추가요금 결제방식
  isStaff?: boolean;  // 직원 입실 여부
  isLongTerm?: boolean;  // 장기투숙 여부
  plannedCheckoutAt?: string | null;  // 장기투숙 예정 퇴실 시각 (ISO)
  longTermDailyFee?: number;  // 1일 입장료
  longTermDiscount?: number;  // 장기투숙 할인
  longTermDays?: number;  // 투숙 일수
}): string {
  if (!db) throw new Error('Database not initialized');

  const id = generateId();
  // 입실시간: 지정된 시간(옵션창 열린 시간) 또는 현재 시간
  const entryTimeISO = entry.entryTime ? entry.entryTime.toISOString() : new Date().toISOString();
  const rentalItemsJson = entry.rentalItems && entry.rentalItems.length > 0 
    ? JSON.stringify(entry.rentalItems) 
    : null;

  db.run(
    `INSERT INTO locker_logs 
    (id, locker_number, entry_time, business_day, time_type, base_price, 
     option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
     payment_cash, payment_card, payment_transfer, rental_items, deferred_payment, customer_memo, no_additional_fee, prepaid_additional_fee, is_cash_receipt, additional_fee_payment_method, is_staff,
     is_long_term, planned_checkout_at, long_term_daily_fee, long_term_discount, long_term_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.lockerNumber,
      entryTimeISO,
      entry.businessDay,
      entry.timeType,
      entry.basePrice,
      entry.optionType,
      entry.optionAmount || null,
      entry.finalPrice,
      entry.notes || null,
      entry.paymentMethod || null,
      entry.paymentCash || null,
      entry.paymentCard || null,
      entry.paymentTransfer || null,
      rentalItemsJson,
      entry.deferredPayment ? 1 : 0,
      entry.customerMemo || null,
      entry.noAdditionalFee ? 1 : 0,
      entry.prepaidAdditionalFee || 0,
      entry.isCashReceipt ? 1 : 0,
      entry.additionalFeePaymentMethod || null,
      entry.isStaff ? 1 : 0,
      entry.isLongTerm ? 1 : 0,
      entry.plannedCheckoutAt || null,
      entry.longTermDailyFee || 0,
      entry.longTermDiscount || 0,
      entry.longTermDays || 0,
    ]
  );

  // Update daily summary
  updateDailySummary(entry.businessDay);
  saveDatabaseDebounced();
  
  return id;
}

export function updateEntry(id: string, updates: any) {
  if (!db) throw new Error('Database not initialized');

  const sets: string[] = [];
  const values: any[] = [];

  if (updates.optionType !== undefined) {
    sets.push('option_type = ?');
    values.push(updates.optionType);
  }
  if (updates.optionAmount !== undefined) {
    sets.push('option_amount = ?');
    values.push(updates.optionAmount);
  }
  if (updates.finalPrice !== undefined) {
    sets.push('final_price = ?');
    values.push(updates.finalPrice);
  }
  if (updates.notes !== undefined) {
    sets.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.paymentMethod !== undefined) {
    sets.push('payment_method = ?');
    values.push(updates.paymentMethod);
  }
  if (updates.paymentCash !== undefined) {
    sets.push('payment_cash = ?');
    values.push(updates.paymentCash);
  }
  if (updates.paymentCard !== undefined) {
    sets.push('payment_card = ?');
    values.push(updates.paymentCard);
  }
  if (updates.paymentTransfer !== undefined) {
    sets.push('payment_transfer = ?');
    values.push(updates.paymentTransfer);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.exitTime !== undefined) {
    sets.push('exit_time = ?');
    values.push(new Date(updates.exitTime).toISOString());
  }
  if (updates.cancelled !== undefined) {
    sets.push('cancelled = ?');
    values.push(updates.cancelled ? 1 : 0);
  }
  if (updates.rentalItems !== undefined) {
    sets.push('rental_items = ?');
    const rentalItemsJson = updates.rentalItems && updates.rentalItems.length > 0
      ? JSON.stringify(updates.rentalItems)
      : null;
    values.push(rentalItemsJson);
  }
  if (updates.additionalFees !== undefined) {
    sets.push('additional_fees = ?');
    values.push(updates.additionalFees);
  }
  if (updates.deferredPayment !== undefined) {
    sets.push('deferred_payment = ?');
    values.push(updates.deferredPayment ? 1 : 0);
  }
  if (updates.customerMemo !== undefined) {
    sets.push('customer_memo = ?');
    values.push(updates.customerMemo || null);
  }
  if (updates.noAdditionalFee !== undefined) {
    sets.push('no_additional_fee = ?');
    values.push(updates.noAdditionalFee ? 1 : 0);
  }
  if (updates.prepaidAdditionalFee !== undefined) {
    sets.push('prepaid_additional_fee = ?');
    values.push(updates.prepaidAdditionalFee || 0);
  }
  if (updates.isCashReceipt !== undefined) {
    sets.push('is_cash_receipt = ?');
    values.push(updates.isCashReceipt ? 1 : 0);
  }
  if (updates.additionalFeePaymentMethod !== undefined) {
    sets.push('additional_fee_payment_method = ?');
    values.push(updates.additionalFeePaymentMethod || null);
  }
  if (updates.isStaff !== undefined) {
    sets.push('is_staff = ?');
    values.push(updates.isStaff ? 1 : 0);
  }
  if (updates.isLongTerm !== undefined) {
    sets.push('is_long_term = ?');
    values.push(updates.isLongTerm ? 1 : 0);
  }
  if (updates.plannedCheckoutAt !== undefined) {
    sets.push('planned_checkout_at = ?');
    values.push(updates.plannedCheckoutAt || null);
  }
  if (updates.longTermDailyFee !== undefined) {
    sets.push('long_term_daily_fee = ?');
    values.push(updates.longTermDailyFee || 0);
  }
  if (updates.longTermDiscount !== undefined) {
    sets.push('long_term_discount = ?');
    values.push(updates.longTermDiscount || 0);
  }
  if (updates.longTermDays !== undefined) {
    sets.push('long_term_days = ?');
    values.push(updates.longTermDays || 0);
  }
  if (updates.refundAmount !== undefined) {
    sets.push('refund_amount = ?');
    values.push(updates.refundAmount || 0);
  }
  if (updates.refundNote !== undefined) {
    sets.push('refund_note = ?');
    values.push(updates.refundNote || null);
  }
  if (updates.refundTime !== undefined) {
    sets.push('refund_time = ?');
    values.push(updates.refundTime || null);
  }
  if (updates.refundMethod !== undefined) {
    sets.push('refund_method = ?');
    values.push(updates.refundMethod || 'cash');
  }
  if (updates.isOuting !== undefined) {
    sets.push('is_outing = ?');
    values.push(updates.isOuting ? 1 : 0);
  }

  if (sets.length > 0) {
    values.push(id);
    db.run(
      `UPDATE locker_logs SET ${sets.join(', ')} WHERE id = ?`,
      values
    );

    // Get business day for this entry and update summary
    const result = db.exec('SELECT business_day FROM locker_logs WHERE id = ?', [id]);
    if (result.length > 0 && result[0].values.length > 0) {
      const businessDay = result[0].values[0][0] as string;
      updateDailySummary(businessDay);
    }

    saveDatabaseDebounced();
  }
}

/** 사용 중 락커의 입실시각 수정 (영업일·시간대·기본요금 재계산) */
export function updateEntryTime(
  id: string,
  newEntryTime: Date
): {
  success: boolean;
  message: string;
  newEntryTime?: string;
  newBusinessDay?: string;
  newTimeType?: '주간' | '야간';
  newBasePrice?: number;
  oldEntryTime?: string;
} {
  if (!db) throw new Error('Database not initialized');
  const now = new Date();
  if (Number.isNaN(newEntryTime.getTime())) {
    return { success: false, message: '유효하지 않은 입실시간입니다.' };
  }
  if (newEntryTime.getTime() > now.getTime() + 30_000) {
    return { success: false, message: '입실시간을 미래로 설정할 수 없습니다.' };
  }
  const result = db.exec(`SELECT * FROM locker_logs WHERE id = ?`, [id]);
  if (result.length === 0 || result[0].values.length === 0) {
    return { success: false, message: '입실 기록을 찾을 수 없습니다.' };
  }
  const entry = rowsToObjects(result[0])[0];
  if (entry.status !== 'in_use') {
    return { success: false, message: '사용 중인 락커만 입실시간을 수정할 수 있습니다.' };
  }
  if (entry.parentLocker) {
    return { success: false, message: '묶인 자식 락커는 부모 락커에서 입실시간을 수정하세요.' };
  }
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour ?? 10;
  const dayPrice = settings.dayPrice ?? 10000;
  const nightPrice = settings.nightPrice ?? 15000;
  const oldEntryTime = entry.entryTime as string;
  const oldBusinessDay = entry.businessDay as string;
  const newEntryTimeISO = newEntryTime.toISOString();
  const newBusinessDay = getBusinessDay(newEntryTime, businessDayStartHour);
  const newTimeType = getTimeTypeWithSettings(newEntryTime);
  const newBasePrice = getBasePrice(newTimeType, dayPrice, nightPrice);
  const oldDate = new Date(oldEntryTime);
  if (
    !Number.isNaN(oldDate.getTime()) &&
    oldDate.getFullYear() === newEntryTime.getFullYear() &&
    oldDate.getMonth() === newEntryTime.getMonth() &&
    oldDate.getDate() === newEntryTime.getDate() &&
    oldDate.getHours() === newEntryTime.getHours() &&
    oldDate.getMinutes() === newEntryTime.getMinutes()
  ) {
    return {
      success: true,
      message: '입실시간이 동일합니다.',
      newEntryTime: oldEntryTime,
      newBusinessDay: oldBusinessDay,
      newTimeType: entry.timeType,
      newBasePrice: entry.basePrice,
      oldEntryTime,
    };
  }
  db.run(
    `UPDATE locker_logs
     SET entry_time = ?,
         business_day = ?,
         time_type = ?,
         base_price = ?,
         additional_fee_paid = 0,
         additional_fee_paid_amount = 0
     WHERE id = ? AND status = 'in_use'`,
    [newEntryTimeISO, newBusinessDay, newTimeType, newBasePrice, id]
  );
  db.run(
    `UPDATE locker_logs
     SET entry_time = ?,
         business_day = ?,
         time_type = ?
     WHERE parent_locker = ? AND status = 'in_use'`,
    [newEntryTimeISO, newBusinessDay, newTimeType, entry.lockerNumber]
  );
  updateDailySummary(oldBusinessDay);
  if (newBusinessDay !== oldBusinessDay) {
    updateDailySummary(newBusinessDay);
  }
  saveDatabaseDebounced();
  return {
    success: true,
    message: '입실시간이 수정되었습니다.',
    newEntryTime: newEntryTimeISO,
    newBusinessDay,
    newTimeType,
    newBasePrice,
    oldEntryTime,
  };
}

// 퇴실 취소 (퇴실 처리된 락카를 다시 사용 중 상태로 복구)
export function reverseCheckout(logId: string): { success: boolean; message: string; deletedAdditionalFee?: number } {
  if (!db) throw new Error('Database not initialized');
  
  try {
    // 1. 해당 로그 조회
    const result = db.exec(
      `SELECT * FROM locker_logs WHERE id = ?`,
      [logId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { success: false, message: '해당 기록을 찾을 수 없습니다.' };
    }
    
    const columns = result[0].columns;
    const row = result[0].values[0];
    const logData: any = {};
    columns.forEach((col, idx) => {
      logData[col] = row[idx];
    });
    
    // 2. 이미 체크아웃된 상태인지 확인
    if (logData.status !== 'checked_out') {
      return { success: false, message: '이미 사용 중인 락카입니다.' };
    }
    
    const lockerNumber = logData.locker_number;
    const businessDay = logData.business_day;
    
    // 3. 해당 락카에 이미 다른 손님이 입실했는지 확인
    const newEntryResult = db.exec(
      `SELECT id FROM locker_logs 
       WHERE locker_number = ? AND status = 'in_use'`,
      [lockerNumber]
    );
    
    if (newEntryResult.length > 0 && newEntryResult[0].values.length > 0) {
      return { success: false, message: '해당 락카에 새로운 손님이 이미 입실했습니다.' };
    }
    
    // 4. 추가요금 이벤트 조회 및 삭제 (퇴실 시 기록된 추가요금)
    // 추가요금은 퇴실 시점의 영업일에 기록되므로 해당 영업일도 업데이트 필요
    let deletedAdditionalFee = 0;
    let additionalFeeBusinessDay: string | null = null;
    
    const additionalFeeResult = db.exec(
      `SELECT fee_amount, business_day FROM additional_fee_events WHERE locker_log_id = ?`,
      [logId]
    );
    
    if (additionalFeeResult.length > 0 && additionalFeeResult[0].values.length > 0) {
      deletedAdditionalFee = additionalFeeResult[0].values[0][0] as number;
      additionalFeeBusinessDay = additionalFeeResult[0].values[0][1] as string;
      db.run(`DELETE FROM additional_fee_events WHERE locker_log_id = ?`, [logId]);
    }
    
    // 4-1. 퇴실 취소 시 자동입력된 추가요금 할인 메모 삭제
    // (락카 교체/묶기 메모는 보존)
    let updatedCustomerMemo = logData.customer_memo || '';
    if (updatedCustomerMemo) {
      const lines = updatedCustomerMemo.split('\n');
      updatedCustomerMemo = lines
        .filter((line: string) => {
          const hasAdditionalFee = line.includes('추가요금');
          const hasFullDiscount = line.includes('전액할인');
          const hasPartialDiscount = line.includes('할인 받음');
          
          // 추가요금 할인 메모면 제거 (전액할인 또는 일부할인)
          if (hasAdditionalFee && (hasFullDiscount || hasPartialDiscount)) {
            return false;
          }
          return true;
        })
        .join('\n')
        .replace(/\n\n+/g, '\n')
        .trim();
    }
    
    // 5. 상태를 in_use로 변경하고 exit_time을 null로 설정
    // CRITICAL FIX: 같은 영업일 추가요금의 경우, finalPrice에서 추가요금을 차감해야 함
    // (같은 영업일 퇴실 시 finalPrice에 추가요금이 포함되어 있음)
    const isSameDayAdditionalFee = deletedAdditionalFee > 0 && additionalFeeBusinessDay === businessDay;
    
    if (isSameDayAdditionalFee) {
      // 같은 영업일: finalPrice에서 추가요금 차감
      const currentFinalPrice = logData.final_price as number;
      const revertedFinalPrice = currentFinalPrice - deletedAdditionalFee;
      db.run(
        `UPDATE locker_logs 
         SET status = 'in_use', exit_time = NULL, final_price = ?, customer_memo = ?
         WHERE id = ?`,
        [revertedFinalPrice, updatedCustomerMemo || null, logId]
      );
    } else {
      // 다른 영업일 또는 추가요금 없음: finalPrice 유지
      db.run(
        `UPDATE locker_logs 
         SET status = 'in_use', exit_time = NULL, customer_memo = ?
         WHERE id = ?`,
        [updatedCustomerMemo || null, logId]
      );
    }
    
    // 6. 일일 요약 업데이트 (입실 영업일)
    updateDailySummary(businessDay);
    
    // 7. 추가요금이 있었다면 퇴실 영업일 요약도 업데이트 (입실/퇴실 영업일이 다른 경우)
    if (additionalFeeBusinessDay && additionalFeeBusinessDay !== businessDay) {
      updateDailySummary(additionalFeeBusinessDay);
    }
    
    saveDatabaseDebounced();
    
    return { 
      success: true, 
      message: `${lockerNumber}번 락카의 퇴실이 취소되었습니다.`,
      deletedAdditionalFee
    };
    
  } catch (error) {
    console.error('퇴실 취소 오류:', error);
    return { success: false, message: '퇴실 취소 중 오류가 발생했습니다.' };
  }
}

// 후불결제 완료 처리 (deferredPayment를 false로 변경)
export function completeDeferredPayment(logId: string, paymentInfo?: {
  paymentMethod?: string;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
}): { success: boolean; message: string } {
  if (!db) throw new Error('Database not initialized');
  
  try {
    // 1. 해당 로그 조회
    const result = db.exec(
      `SELECT * FROM locker_logs WHERE id = ?`,
      [logId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { success: false, message: '해당 기록을 찾을 수 없습니다.' };
    }
    
    const columns = result[0].columns;
    const row = result[0].values[0];
    const logData: any = {};
    columns.forEach((col, idx) => {
      logData[col] = row[idx];
    });
    
    // 2. 후불결제 상태인지 확인
    if (!logData.deferred_payment) {
      return { success: false, message: '후불결제 상태가 아닙니다.' };
    }
    
    // 3. 후불결제 해제 및 결제 정보 업데이트
    let updateQuery = `UPDATE locker_logs SET deferred_payment = 0`;
    const params: any[] = [];
    
    if (paymentInfo?.paymentMethod) {
      updateQuery += `, payment_method = ?`;
      params.push(paymentInfo.paymentMethod);
    }
    if (paymentInfo?.paymentCash !== undefined) {
      updateQuery += `, payment_cash = ?`;
      params.push(paymentInfo.paymentCash);
    }
    if (paymentInfo?.paymentCard !== undefined) {
      updateQuery += `, payment_card = ?`;
      params.push(paymentInfo.paymentCard);
    }
    if (paymentInfo?.paymentTransfer !== undefined) {
      updateQuery += `, payment_transfer = ?`;
      params.push(paymentInfo.paymentTransfer);
    }
    
    updateQuery += ` WHERE id = ?`;
    params.push(logId);
    
    db.run(updateQuery, params);
    
    // 4. 일일 요약 업데이트
    const businessDay = logData.business_day;
    updateDailySummary(businessDay);
    saveDatabaseDebounced();
    
    return { 
      success: true, 
      message: `${logData.locker_number}번 락카의 결제가 완료되었습니다.`
    };
    
  } catch (error) {
    console.error('결제 완료 처리 오류:', error);
    return { success: false, message: '결제 완료 처리 중 오류가 발생했습니다.' };
  }
}

export function swapLockers(fromLockerNumber: number, toLockerNumber: number): { success: boolean; message: string; type: 'move' | 'swap' | 'error' } {
  if (!db) throw new Error('Database not initialized');

  // 유효성 검사
  if (fromLockerNumber === toLockerNumber) {
    return { success: false, message: '같은 락카 번호입니다.', type: 'error' };
  }

  // 설정된 락카 그룹 번호만 허용
  const groupResult = db.exec('SELECT start_number, end_number FROM locker_groups');
  const configuredNumbers = new Set<number>();
  if (groupResult.length > 0) {
    groupResult[0].values.forEach((row: any) => {
      const start = row[0] as number;
      const end = row[1] as number;
      for (let i = start; i <= end; i++) configuredNumbers.add(i);
    });
  }
  if (!configuredNumbers.has(fromLockerNumber) || !configuredNumbers.has(toLockerNumber)) {
    return { success: false, message: '유효하지 않은 락카 번호입니다.', type: 'error' };
  }

  try {
    // Begin transaction
    db.run('BEGIN TRANSACTION');
    // 두 락카의 현재 상태 확인
    const fromResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [fromLockerNumber]
    );
    
    const toResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [toLockerNumber]
    );

    const fromInUse = fromResult.length > 0 && fromResult[0].values.length > 0;
    const toInUse = toResult.length > 0 && toResult[0].values.length > 0;

    if (!fromInUse) {
      db.run('ROLLBACK');
      return { success: false, message: `${fromLockerNumber}번 락카가 사용 중이 아닙니다.`, type: 'error' };
    }

    // 안전한 임시 번호 계산 (현재 사용 중인 최대 락카 번호 + 10000)
    const tempNumber = 10000 + fromLockerNumber;

    if (!toInUse) {
      // 시나리오 1: 이동 (from만 사용중, to는 비어있음)
      
      // 1. locker_logs 업데이트
      db.run(
        `UPDATE locker_logs SET locker_number = ? WHERE locker_number = ? AND status = 'in_use'`,
        [toLockerNumber, fromLockerNumber]
      );
      const changes1 = db.exec('SELECT changes() as count')[0]?.values[0]?.[0];
      if (changes1 !== 1) {
        db.run('ROLLBACK');
        return { success: false, message: 'locker_logs 업데이트 실패', type: 'error' };
      }

      // 2. 자식 락카들의 parentLocker 업데이트 (부모 락카가 이동하면 자식들도 따라감)
      db.run(
        `UPDATE locker_logs SET parent_locker = ? 
         WHERE parent_locker = ? AND status = 'in_use'`,
        [toLockerNumber, fromLockerNumber]
      );

      // 3. rental_transactions 업데이트
      db.run(
        `UPDATE rental_transactions SET locker_number = ? 
         WHERE locker_number = ? AND return_time IS NULL`,
        [toLockerNumber, fromLockerNumber]
      );
      // rental_transactions는 0개 이상일 수 있으므로 검증 안함

      // 4. additional_fee_events 업데이트 (해당 locker_log_id에 연결된 것만)
      const fromData = rowsToObjects(fromResult[0])[0];
      if (fromData && fromData.id) {
        db.run(
          `UPDATE additional_fee_events SET locker_number = ? 
           WHERE locker_log_id = ?`,
          [toLockerNumber, fromData.id]
        );
        // additional_fee_events도 0개 이상일 수 있으므로 검증 안함
      }

      // Add note about the move to the customer's customer_memo (메모 아이콘으로만 표시됨)
      const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const moveNote = `[${timestamp}] 락카이동: ${fromLockerNumber}번 → ${toLockerNumber}번`;
      const existingMemo = fromData?.customerMemo || '';
      const updatedMemo = existingMemo ? `${existingMemo}\n${moveNote}` : moveNote;
      
      db.run(
        `UPDATE locker_logs SET customer_memo = ? WHERE locker_number = ? AND status = 'in_use'`,
        [updatedMemo, toLockerNumber]
      );

      // Commit transaction
      db.run('COMMIT');
      
      // 영업일 요약 업데이트
      if (fromData && fromData.business_day) {
        updateDailySummary(fromData.business_day);
      }

      saveDatabaseDebounced();
      return { 
        success: true, 
        message: `${fromLockerNumber}번 락카의 내용이 ${toLockerNumber}번 락카로 이동되었습니다.`, 
        type: 'move' 
      };
    } else {
      // 시나리오 2: 교환 (둘 다 사용중)
      
      const fromData = rowsToObjects(fromResult[0])[0];
      const toData = rowsToObjects(toResult[0])[0];

      // 1. locker_logs 교환
      db.run(
        `UPDATE locker_logs SET locker_number = ? WHERE locker_number = ? AND status = 'in_use'`,
        [tempNumber, fromLockerNumber]
      );
      const swap1 = db.exec('SELECT changes() as count')[0]?.values[0]?.[0];
      if (swap1 !== 1) {
        db.run('ROLLBACK');
        return { success: false, message: 'locker_logs 교환 실패 (step 1)', type: 'error' };
      }
      
      db.run(
        `UPDATE locker_logs SET locker_number = ? WHERE locker_number = ? AND status = 'in_use'`,
        [fromLockerNumber, toLockerNumber]
      );
      const swap2 = db.exec('SELECT changes() as count')[0]?.values[0]?.[0];
      if (swap2 !== 1) {
        db.run('ROLLBACK');
        return { success: false, message: 'locker_logs 교환 실패 (step 2)', type: 'error' };
      }
      
      db.run(
        `UPDATE locker_logs SET locker_number = ? WHERE locker_number = ? AND status = 'in_use'`,
        [toLockerNumber, tempNumber]
      );
      const swap3 = db.exec('SELECT changes() as count')[0]?.values[0]?.[0];
      if (swap3 !== 1) {
        db.run('ROLLBACK');
        return { success: false, message: 'locker_logs 교환 실패 (step 3)', type: 'error' };
      }

      // 2. 자식 락카들의 parentLocker 교환 (부모 락카가 교환되면 자식들도 따라감)
      // 임시 번호를 사용하여 3-way swap
      db.run(
        `UPDATE locker_logs SET parent_locker = ? 
         WHERE parent_locker = ? AND status = 'in_use'`,
        [tempNumber, fromLockerNumber]
      );
      db.run(
        `UPDATE locker_logs SET parent_locker = ? 
         WHERE parent_locker = ? AND status = 'in_use'`,
        [fromLockerNumber, toLockerNumber]
      );
      db.run(
        `UPDATE locker_logs SET parent_locker = ? 
         WHERE parent_locker = ? AND status = 'in_use'`,
        [toLockerNumber, tempNumber]
      );

      // 3. rental_transactions 교환
      db.run(
        `UPDATE rental_transactions SET locker_number = ? 
         WHERE locker_number = ? AND return_time IS NULL`,
        [tempNumber, fromLockerNumber]
      );
      db.run(
        `UPDATE rental_transactions SET locker_number = ? 
         WHERE locker_number = ? AND return_time IS NULL`,
        [fromLockerNumber, toLockerNumber]
      );
      db.run(
        `UPDATE rental_transactions SET locker_number = ? 
         WHERE locker_number = ? AND return_time IS NULL`,
        [toLockerNumber, tempNumber]
      );

      // 3. additional_fee_events 교환
      if (fromData && fromData.id) {
        db.run(
          `UPDATE additional_fee_events SET locker_number = ? 
           WHERE locker_log_id = ?`,
          [tempNumber, fromData.id]
        );
      }
      if (toData && toData.id) {
        db.run(
          `UPDATE additional_fee_events SET locker_number = ? 
           WHERE locker_log_id = ?`,
          [fromLockerNumber, toData.id]
        );
      }
      if (fromData && fromData.id) {
        db.run(
          `UPDATE additional_fee_events SET locker_number = ? 
           WHERE locker_log_id = ?`,
          [toLockerNumber, fromData.id]
        );
      }

      // Add notes about the swap to both customers' customer_memo (메모 아이콘으로만 표시됨)
      const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      
      // Update customer_memo for the locker that was originally at fromLockerNumber (now at toLockerNumber)
      const fromSwapNote = `[${timestamp}] 락카교환: ${fromLockerNumber}번 ↔ ${toLockerNumber}번`;
      const fromExistingMemo = fromData?.customerMemo || '';
      const fromUpdatedMemo = fromExistingMemo ? `${fromExistingMemo}\n${fromSwapNote}` : fromSwapNote;
      db.run(
        `UPDATE locker_logs SET customer_memo = ? WHERE locker_number = ? AND status = 'in_use'`,
        [fromUpdatedMemo, toLockerNumber]
      );
      
      // Update customer_memo for the locker that was originally at toLockerNumber (now at fromLockerNumber)
      const toSwapNote = `[${timestamp}] 락카교환: ${toLockerNumber}번 ↔ ${fromLockerNumber}번`;
      const toExistingMemo = toData?.customerMemo || '';
      const toUpdatedMemo = toExistingMemo ? `${toExistingMemo}\n${toSwapNote}` : toSwapNote;
      db.run(
        `UPDATE locker_logs SET customer_memo = ? WHERE locker_number = ? AND status = 'in_use'`,
        [toUpdatedMemo, fromLockerNumber]
      );

      // Commit transaction
      db.run('COMMIT');
      
      // 두 영업일 요약 업데이트
      if (fromData && fromData.business_day) {
        updateDailySummary(fromData.business_day);
      }
      if (toData && toData.business_day && toData.business_day !== fromData?.business_day) {
        updateDailySummary(toData.business_day);
      }

      saveDatabaseDebounced();
      return { 
        success: true, 
        message: `${fromLockerNumber}번과 ${toLockerNumber}번 락카의 내용이 서로 교환되었습니다.`, 
        type: 'swap' 
      };
    }
  } catch (error) {
    console.error('Locker swap error:', error);
    // Rollback on any error
    try {
      db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    return { 
      success: false, 
      message: '락카 교체 중 오류가 발생했습니다.', 
      type: 'error' 
    };
  }
}

// Link child lockers to a parent locker
export function linkLockers(parentLockerNumber: number, childLockerNumbers: number[]): { success: boolean; message: string } {
  if (!db) throw new Error('Database not initialized');

  let transactionStarted = false;
  try {
    db.run('BEGIN TRANSACTION');
    transactionStarted = true;

    // Check if parent locker is in use (all queries inside transaction)
    const parentResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [parentLockerNumber]
    );

    if (parentResult.length === 0 || parentResult[0].values.length === 0) {
      db.run('ROLLBACK');
      transactionStarted = false;
      return { success: false, message: '부모 락카가 사용중이 아닙니다.' };
    }

    const parentData = rowsToObjects(parentResult[0])[0];

    // Check if all child lockers are truly vacant
    // Get the latest log for each child locker and ensure it's checked_out or doesn't exist
    for (const childNumber of childLockerNumbers) {
      const latestLogResult = db.exec(
        `SELECT * FROM locker_logs 
         WHERE locker_number = ? 
         ORDER BY entry_time DESC 
         LIMIT 1`,
        [childNumber]
      );
      
      if (latestLogResult.length > 0 && latestLogResult[0].values.length > 0) {
        const latestLog = rowsToObjects(latestLogResult[0])[0];
        // Locker is occupied if latest log is in_use OR cancelled without checkout
        if (latestLog.status === 'in_use' || (latestLog.status === 'cancelled' && !latestLog.exitTime)) {
          db.run('ROLLBACK');
          transactionStarted = false;
          return { success: false, message: `${childNumber}번 락카는 이미 사용중입니다.` };
        }
      }
    }

    // Create child locker entries using parent's metadata
    for (const childNumber of childLockerNumbers) {
      db.run(
        `INSERT INTO locker_logs (
          id, locker_number, entry_time, business_day, time_type,
          base_price, option_type, final_price, status, cancelled, parent_locker
        ) VALUES (?, ?, ?, ?, ?, 0, 'none', 0, 'in_use', 0, ?)`,
        [
          `${childNumber}-${Date.now()}-${Math.random()}`,
          childNumber,
          parentData.entryTime,  // Use parent's entry_time
          parentData.businessDay,
          parentData.timeType,
          parentLockerNumber
        ]
      );
    }

    db.run('COMMIT');
    transactionStarted = false;
    saveDatabaseDebounced();

    return { 
      success: true, 
      message: `${parentLockerNumber}번 락카에 ${childLockerNumbers.join(', ')}번 락카가 묶였습니다.` 
    };
  } catch (error) {
    console.error('Locker linking error:', error);
    if (transactionStarted) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }
    return { success: false, message: '락카묶기 중 오류가 발생했습니다.' };
  }
}

// Unlink a single child locker (manual unlink)
export function unlinkChildLocker(childLockerNumber: number): { success: boolean; message: string } {
  if (!db) throw new Error('Database not initialized');

  try {
    db.run('BEGIN TRANSACTION');

    // Check if child locker exists and is in use
    const childResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [childLockerNumber]
    );

    if (childResult.length === 0 || childResult[0].values.length === 0) {
      db.run('ROLLBACK');
      return { success: false, message: '해당 락카가 사용중이 아닙니다.' };
    }

    const childData = rowsToObjects(childResult[0])[0];

    // Check if this locker is actually a child locker
    if (!childData.parentLocker) {
      db.run('ROLLBACK');
      return { success: false, message: '부모 락카에 연결되지 않은 락카입니다.' };
    }

    const parentNumber = childData.parentLocker;
    const checkoutTime = new Date().toISOString();

    // Unlink and check out the child locker so it becomes vacant
    db.run(
      `UPDATE locker_logs SET parent_locker = NULL, status = 'checked_out', exit_time = ? WHERE locker_number = ? AND status = 'in_use'`,
      [checkoutTime, childLockerNumber]
    );

    const changes = db.exec('SELECT changes() as count')[0]?.values[0]?.[0];
    if (changes !== 1) {
      db.run('ROLLBACK');
      return { success: false, message: '락카 해제 실패' };
    }

    db.run('COMMIT');
    saveDatabaseDebounced();

    return { 
      success: true, 
      message: `${childLockerNumber}번 락카가 ${parentNumber}번 부모 락카에서 해제되었습니다.` 
    };
  } catch (error) {
    console.error('Child locker unlink error:', error);
    try {
      db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    return { success: false, message: '락카 해제 중 오류가 발생했습니다.' };
  }
}

// Change parent of a child locker
export function changeChildParent(childLockerNumber: number, newParentLockerNumber: number): { success: boolean; message: string } {
  if (!db) throw new Error('Database not initialized');

  try {
    db.run('BEGIN TRANSACTION');

    // Check if child locker exists and is in use
    const childResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [childLockerNumber]
    );

    if (childResult.length === 0 || childResult[0].values.length === 0) {
      db.run('ROLLBACK');
      return { success: false, message: '해당 락카가 사용중이 아닙니다.' };
    }

    const childData = rowsToObjects(childResult[0])[0];

    // Check if this locker is actually a child locker
    if (!childData.parentLocker) {
      db.run('ROLLBACK');
      return { success: false, message: '부모 락카에 연결되지 않은 락카입니다.' };
    }

    // Check if new parent locker exists and is in use
    const newParentResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [newParentLockerNumber]
    );

    if (newParentResult.length === 0 || newParentResult[0].values.length === 0) {
      db.run('ROLLBACK');
      return { success: false, message: '새 부모 락카가 사용중이 아닙니다.' };
    }

    const newParentData = rowsToObjects(newParentResult[0])[0];

    // Prevent linking to itself
    if (childLockerNumber === newParentLockerNumber) {
      db.run('ROLLBACK');
      return { success: false, message: '자기 자신을 부모 락카로 설정할 수 없습니다.' };
    }

    // Prevent linking to another child locker
    if (newParentData.parentLocker) {
      db.run('ROLLBACK');
      return { success: false, message: '이미 다른 락카에 연결된 락카는 부모 락카로 설정할 수 없습니다.' };
    }

    const oldParentNumber = childData.parentLocker;

    // Update parent_locker to new parent
    db.run(
      `UPDATE locker_logs SET parent_locker = ? WHERE locker_number = ? AND status = 'in_use'`,
      [newParentLockerNumber, childLockerNumber]
    );

    const changes = db.exec('SELECT changes() as count')[0]?.values[0]?.[0];
    if (changes !== 1) {
      db.run('ROLLBACK');
      return { success: false, message: '부모 락카 변경 실패' };
    }

    db.run('COMMIT');
    saveDatabaseDebounced();

    return { 
      success: true, 
      message: `${childLockerNumber}번 락카의 부모가 ${oldParentNumber}번에서 ${newParentLockerNumber}번으로 변경되었습니다.` 
    };
  } catch (error) {
    console.error('Parent change error:', error);
    try {
      db.run('ROLLBACK');
    } catch (rollbackError) {
      console.error('Rollback error:', rollbackError);
    }
    return { success: false, message: '부모 락카 변경 중 오류가 발생했습니다.' };
  }
}

// Get child lockers for a parent locker
export function getChildLockers(parentLockerNumber: number) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs WHERE parent_locker = ? AND status = 'in_use'`,
    [parentLockerNumber]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

// Unlink (checkout) child lockers when parent is checked out
// Only affects active child lockers to avoid corrupting history
export function unlinkChildLockers(parentLockerNumber: number, exitTime?: string) {
  if (!db) throw new Error('Database not initialized');

  const checkoutTime = exitTime || new Date().toISOString();

  // Only update child lockers that are currently in_use
  db.run(
    `UPDATE locker_logs 
     SET status = 'checked_out', exit_time = ? 
     WHERE parent_locker = ? AND status = 'in_use'`,
    [checkoutTime, parentLockerNumber]
  );

  saveDatabaseDebounced();
}

// Cancel child lockers when parent is cancelled
// Mirrors parent cancellation: sets cancelled=1, status='cancelled', exit_time=NULL
export function cancelChildLockers(parentLockerNumber: number) {
  if (!db) throw new Error('Database not initialized');

  // Only cancel child lockers that are currently in_use
  // Match parent cancellation behavior: set cancelled=1, don't set exit_time
  db.run(
    `UPDATE locker_logs 
     SET status = 'cancelled', cancelled = 1, exit_time = NULL
     WHERE parent_locker = ? AND status = 'in_use'`,
    [parentLockerNumber]
  );

  saveDatabaseDebounced();
}

// Atomically update parent-child locker relationships
// Used when user selects/deselects child lockers in the link dialog
export function setParentChildLinks(
  parentLockerNumber: number, 
  newChildLockerNumbers: number[]
): { success: boolean; message: string } {
  if (!db) throw new Error('Database not initialized');

  let transactionStarted = false;
  try {
    db.run('BEGIN TRANSACTION');
    transactionStarted = true;

    // Validate parent locker exists and is in use
    const parentResult = db.exec(
      `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
      [parentLockerNumber]
    );

    if (parentResult.length === 0 || parentResult[0].values.length === 0) {
      db.run('ROLLBACK');
      transactionStarted = false;
      return { success: false, message: '부모 락카가 사용중이 아닙니다.' };
    }

    const parentData = rowsToObjects(parentResult[0])[0];

    // Get current child lockers
    const currentChildren = getChildLockers(parentLockerNumber);
    const currentChildNumbers = currentChildren.map(c => c.lockerNumber);

    // Calculate changes
    const toAdd = newChildLockerNumbers.filter(num => !currentChildNumbers.includes(num));
    const toRemove = currentChildNumbers.filter(num => !newChildLockerNumbers.includes(num));

    // ========== PHASE 1: VALIDATE ALL CHANGES (no mutations yet) ==========
    
    // Validate all removals first
    for (const childNumber of toRemove) {
      const childResult = db.exec(
        `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
        [childNumber]
      );
      
      if (childResult.length > 0 && childResult[0].values.length > 0) {
        const allChildData = rowsToObjects(childResult[0]);
        
        // Find any row with conflicting parent ownership
        const conflictingRow = allChildData.find(
          (row: any) => row.parentLocker && row.parentLocker !== parentLockerNumber
        );
        
        if (conflictingRow) {
          db.run('ROLLBACK');
          transactionStarted = false;
          return {
            success: false,
            message: `${childNumber}번 락카는 ${conflictingRow.parentLocker}번에 묶여있습니다. 작업을 중단했습니다.`
          };
        }
      }
    }
    
    // Validate all additions
    for (const childNumber of toAdd) {
      const childResult = db.exec(
        `SELECT * FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`,
        [childNumber]
      );

      if (childResult.length > 0 && childResult[0].values.length > 0) {
        const allChildData = rowsToObjects(childResult[0]);
        
        // Check each row for conflicts
        for (const childData of allChildData) {
          if (childData.basePrice > 0) {
            db.run('ROLLBACK');
            transactionStarted = false;
            return { 
              success: false, 
              message: `${childNumber}번 락카는 이미 사용 중입니다.` 
            };
          }
          
          if (childData.basePrice === 0 && childData.parentLocker && childData.parentLocker !== parentLockerNumber) {
            db.run('ROLLBACK');
            transactionStarted = false;
            return { 
              success: false, 
              message: `${childNumber}번 락카는 이미 ${childData.parentLocker}번에 묶여있습니다.` 
            };
          }
        }
      }
    }
    
    // ========== PHASE 2: APPLY ALL CHANGES (validation passed) ==========
    
    // Remove children (safe: all validated)
    for (const childNumber of toRemove) {
      db.run(
        `DELETE FROM locker_logs 
         WHERE locker_number = ? 
         AND status = 'in_use' 
         AND base_price = 0 
         AND parent_locker = ?`,
        [childNumber, parentLockerNumber]
      );
      
      db.run(
        `UPDATE locker_logs 
         SET parent_locker = NULL 
         WHERE locker_number = ? 
         AND status = 'in_use' 
         AND base_price > 0 
         AND parent_locker = ?`,
        [childNumber, parentLockerNumber]
      );
    }

    // Add children (safe: all validated)
    for (const childNumber of toAdd) {
      db.run(
        `DELETE FROM locker_logs 
         WHERE locker_number = ? 
         AND status = 'in_use' 
         AND base_price = 0 
         AND (parent_locker IS NULL OR parent_locker = ?)`,
        [childNumber, parentLockerNumber]
      );
      
      const id = generateId();
      
      db.run(
        `INSERT INTO locker_logs 
        (id, locker_number, entry_time, business_day, time_type, base_price, final_price, 
         option_type, status, cancelled, parent_locker)
        VALUES (?, ?, ?, ?, ?, 0, 0, 'none', 'in_use', 0, ?)`,
        [
          id,
          childNumber,
          parentData.entryTime,
          parentData.businessDay,
          parentData.timeType,
          parentLockerNumber
        ]
      );
    }

    // Add note about linking/unlinking to parent locker's customer_memo (메모 아이콘으로만 표시됨)
    if (toAdd.length > 0 || toRemove.length > 0) {
      const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      const linkNotes: string[] = [];
      
      if (toAdd.length > 0) {
        linkNotes.push(`[${timestamp}] 락카묶기: ${toAdd.join(', ')}번 추가`);
      }
      if (toRemove.length > 0) {
        linkNotes.push(`[${timestamp}] 락카묶기해제: ${toRemove.join(', ')}번 해제`);
      }
      
      const existingMemo = parentData?.customerMemo || '';
      const newNoteText = linkNotes.join('\n');
      const updatedMemo = existingMemo ? `${existingMemo}\n${newNoteText}` : newNoteText;
      
      db.run(
        `UPDATE locker_logs SET customer_memo = ? WHERE locker_number = ? AND status = 'in_use'`,
        [updatedMemo, parentLockerNumber]
      );
    }

    db.run('COMMIT');
    transactionStarted = false;
    saveDatabaseDebounced();

    if (toAdd.length > 0 && toRemove.length > 0) {
      return { 
        success: true, 
        message: `${toAdd.join(', ')}번 락카가 추가되고, ${toRemove.join(', ')}번 락카가 해제되었습니다.` 
      };
    } else if (toAdd.length > 0) {
      return { 
        success: true, 
        message: `${toAdd.join(', ')}번 락카가 추가되었습니다.` 
      };
    } else if (toRemove.length > 0) {
      return { 
        success: true, 
        message: `${toRemove.join(', ')}번 락카가 해제되었습니다.` 
      };
    } else {
      return { success: true, message: '변경사항이 없습니다.' };
    }
  } catch (error) {
    console.error('Parent-child link update error:', error);
    if (transactionStarted) {
      try {
        db.run('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback error:', rollbackError);
      }
    }
    return { success: false, message: '락카 링크 업데이트 중 오류가 발생했습니다.' };
  }
}

export function getActiveLockers() {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs WHERE status = 'in_use' ORDER BY COALESCE(exit_time, entry_time) DESC`
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

export function getTodayEntries(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE business_day = ? 
     ORDER BY COALESCE(exit_time, entry_time) DESC`,
    [businessDay]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 날짜 범위로 입실 기록 조회 (entry_time 기준)
 * 입출기록 페이지의 날짜 필터링용 - 해당 기간에 입실한 기록만 반환
 */
export function getEntriesByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');

  // Parse dates and convert to ISO
  // Input format: YYYY-MM-DD
  // Append time component for local timezone parsing
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  
  // Validate dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('Invalid date format:', { startDate, endDate });
    return [];
  }
  
  const startDateTime = start.toISOString();
  const endDateTime = end.toISOString();

  // Entry time based filtering: Include only records that entered within the period
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE entry_time >= ? AND entry_time <= ?
     ORDER BY entry_time DESC`,
    [startDateTime, endDateTime]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 시간 범위로 입실 기록 조회 (entry_time 기준)
 * 입출기록 페이지의 시간 필터링용 - 해당 시간대에 입실한 기록만 반환
 */
export function getEntriesByDateTimeRange(startDateTime: string, endDateTime: string) {
  if (!db) throw new Error('Database not initialized');

  // Entry time based filtering: Include only records that entered within the period
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE entry_time >= ? AND entry_time <= ?
     ORDER BY entry_time DESC`,
    [startDateTime, endDateTime]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 특정 비즈니스 데이의 모든 입실 기록 조회 (interval overlap 로직)
 * 영업일 범위와 겹치는 모든 기록 반환 - 사용 중인 락커 조회용
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
export function getEntriesByBusinessDayRange(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - 영업일 시작 시각을 기준 시간으로 사용 (T12:00:00 고정값은 영업일이 12시 이후 시작인 경우 오동작)
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Interval overlap logic: includes entries that overlap with the business day range
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE (strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?)
        OR (strftime('%s', exit_time) >= ? AND strftime('%s', exit_time) <= ?)
        OR (strftime('%s', entry_time) < ? AND (exit_time IS NULL OR strftime('%s', exit_time) > ?))
     ORDER BY COALESCE(exit_time, entry_time) DESC`,
    [startUnix.toString(), endUnix.toString(), startUnix.toString(), endUnix.toString(), startUnix.toString(), endUnix.toString()]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 특정 비즈니스 데이에 입실한 기록만 조회 (entry_time 기준)
 * 방문자 수 및 입실 매출 계산용
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
export function getEntriesByEntryTime(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - 영업일 시작 시각을 기준 시간으로 사용 (T12:00:00 고정값은 영업일이 12시 이후 시작인 경우 오동작)
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Filter by entry_time only
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?
     ORDER BY entry_time DESC`,
    [startUnix.toString(), endUnix.toString()]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 영업일 기준 환불 합계 조회 (entry_time 기준, 취소 제외)
 * 결제수단별 환불 금액 반환 (현금/카드/이체)
 */
export function getRefundSummaryByBusinessDay(businessDay: string, businessDayStartHour: number): { total: number; count: number; cash: number; card: number; transfer: number } {
  if (!db) throw new Error('Database not initialized');
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour);
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  const result = db.exec(
    `SELECT 
       COALESCE(SUM(refund_amount), 0) as total,
       COUNT(*) as count,
       COALESCE(SUM(CASE WHEN COALESCE(refund_method, 'cash') = 'cash' THEN refund_amount ELSE 0 END), 0) as cash,
       COALESCE(SUM(CASE WHEN refund_method = 'card' THEN refund_amount ELSE 0 END), 0) as card,
       COALESCE(SUM(CASE WHEN refund_method = 'transfer' THEN refund_amount ELSE 0 END), 0) as transfer
     FROM locker_logs
     WHERE cancelled = 0
       AND refund_amount > 0
       AND strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  if (result.length === 0 || result[0].values.length === 0) return { total: 0, count: 0, cash: 0, card: 0, transfer: 0 };
  const row = result[0].values[0];
  return {
    total: (row[0] as number) || 0,
    count: (row[1] as number) || 0,
    cash: (row[2] as number) || 0,
    card: (row[3] as number) || 0,
    transfer: (row[4] as number) || 0,
  };
}

/**
 * 모든 입실 기록 조회 (전체)
 */
export function getAllEntries() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM locker_logs ORDER BY entry_time DESC');
  
  if (result.length === 0) return [];
  
  return rowsToObjects(result[0]);
}

export function updateLockerLogMemo(logId: string, memo: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  db.run(
    `UPDATE locker_logs SET customer_memo = ? WHERE id = ?`,
    [memo || null, logId]
  );
  
  saveDatabaseDebounced();
  return true;
}

export function updateLockerOuting(logId: string, isOuting: boolean): boolean {
  if (!db) throw new Error('Database not initialized');
  
  // is_outing 컬럼이 없으면 자동으로 추가 (마이그레이션 누락 대비)
  try {
    db.run(`ALTER TABLE locker_logs ADD COLUMN is_outing INTEGER DEFAULT 0`);
    console.log('[updateLockerOuting] is_outing 컬럼 자동 추가 완료');
  } catch (_e) {
    // 이미 존재하면 무시
  }
  
  // outing_started_at 컬럼이 없으면 자동으로 추가
  try {
    db.run(`ALTER TABLE locker_logs ADD COLUMN outing_started_at TEXT`);
    console.log('[updateLockerOuting] outing_started_at 컬럼 자동 추가 완료');
  } catch (_e) {
    // 이미 존재하면 무시
  }
  
  const val = isOuting ? 1 : 0;
  if (isOuting) {
    // 외출 ON: 이미 외출 중이면 outing_started_at을 보존 (수정저장으로 인한 리셋 방지)
    // COALESCE(outing_started_at, ?) → 기존 값이 있으면 유지, NULL이면 현재 시각으로 설정
    const now = new Date().toISOString();
    db.run(
      `UPDATE locker_logs SET is_outing = 1, outing_started_at = COALESCE(outing_started_at, ?) WHERE id = ?`,
      [now, logId]
    );
  } else {
    // 외출 OFF: outing_started_at 초기화
    db.run(`UPDATE locker_logs SET is_outing = 0, outing_started_at = NULL WHERE id = ?`, [logId]);
  }
  saveDatabaseDebounced();
  return true;
}

// Update additional_fee_paid status and paid amount for a locker log
export function updateLockerLogAdditionalFeePaid(
  logId: string,
  paid: boolean,
  paidAmount?: number,
  discountAmount?: number
): boolean {
  if (!db) throw new Error('Database not initialized');
  
  if (paidAmount !== undefined && discountAmount !== undefined) {
    db.run(
      `UPDATE locker_logs SET additional_fee_paid = ?, additional_fee_paid_amount = ?, additional_fee_discount = ? WHERE id = ?`,
      [paid ? 1 : 0, paidAmount, Math.max(0, discountAmount), logId]
    );
  } else if (paidAmount !== undefined) {
    db.run(
      `UPDATE locker_logs SET additional_fee_paid = ?, additional_fee_paid_amount = ? WHERE id = ?`,
      [paid ? 1 : 0, paidAmount, logId]
    );
  } else if (discountAmount !== undefined) {
    db.run(
      `UPDATE locker_logs SET additional_fee_paid = ?, additional_fee_discount = ? WHERE id = ?`,
      [paid ? 1 : 0, Math.max(0, discountAmount), logId]
    );
  } else {
    db.run(
      `UPDATE locker_logs SET additional_fee_paid = ? WHERE id = ?`,
      [paid ? 1 : 0, logId]
    );
  }
  
  saveDatabaseDebounced();
  return true;
}

/** 추가요금 할인액만 저장 (수정저장 시 할인 UI 복원용) */
export function updateLockerLogAdditionalFeeDiscount(logId: string, discountAmount: number): boolean {
  if (!db) throw new Error('Database not initialized');
  db.run(
    `UPDATE locker_logs SET additional_fee_discount = ? WHERE id = ?`,
    [Math.max(0, discountAmount || 0), logId]
  );
  saveDatabaseDebounced();
  return true;
}

export function getLockerLogAdditionalFeeDiscount(logId: string): number {
  if (!db) throw new Error('Database not initialized');
  try {
    const result = db.exec(
      `SELECT additional_fee_discount FROM locker_logs WHERE id = ?`,
      [logId]
    );
    if (result.length === 0 || result[0].values.length === 0) return 0;
    return (result[0].values[0][0] as number) || 0;
  } catch {
    return 0;
  }
}

// Get additional_fee_paid status for a locker log (returns paid amount for comparison)
export function getLockerLogAdditionalFeePaid(logId: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT additional_fee_paid FROM locker_logs WHERE id = ?`,
    [logId]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return false;
  }
  
  return result[0].values[0][0] === 1;
}

// Get additional_fee_paid_amount for a locker log
export function getLockerLogAdditionalFeePaidAmount(logId: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT additional_fee_paid_amount FROM locker_logs WHERE id = ?`,
    [logId]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  
  return (result[0].values[0][0] as number) || 0;
}

// Get prepaid_additional_fee for a locker log (선지급 추가요금)
export function getLockerLogPrepaidAdditionalFee(logId: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT prepaid_additional_fee FROM locker_logs WHERE id = ?`,
    [logId]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  
  return (result[0].values[0][0] as number) || 0;
}

// Update prepaid_additional_fee for a locker log (선지급 추가요금 업데이트)
export function updateLockerLogPrepaidAdditionalFee(logId: string, amount: number): boolean {
  if (!db) throw new Error('Database not initialized');
  
  db.run(
    `UPDATE locker_logs SET prepaid_additional_fee = ? WHERE id = ?`,
    [amount, logId]
  );
  
  saveDatabaseDebounced();
  return true;
}

