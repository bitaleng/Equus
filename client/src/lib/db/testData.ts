import { db, generateId, saveDatabaseDebounced } from './core';
import { updateDailySummary } from './dailySummaries';
import { getSettings, getTimeTypeWithSettings, updateSettings } from './settings';
import {
  getBusinessDayRange,
  getBusinessDay,
  calculateAdditionalFee,
  getSettlementCycleOptions,
  getStagedHourlyOptions,
  getNightstartOptions,
} from '@shared/businessDay';

// Test data generation for time-based features
export function createTestData() {
  if (!db) throw new Error('Database not initialized');
  
  const settings = getSettings();
  const {
    dayPrice, nightPrice, businessDayStartHour, discountAmount, foreignerPrice,
    foreignerSeparateDayNight = false, foreignerDayPrice = foreignerPrice, foreignerNightPrice = foreignerPrice,
    domesticCheckpointHour, foreignerAdditionalFeePeriod,
    enableDiscountOption = true, enableForeignerOption = true,
  } = settings;
  const resolveForeignerFor = (timeType: string) =>
    foreignerSeparateDayNight
      ? (timeType === '주간' ? foreignerDayPrice : foreignerNightPrice)
      : foreignerPrice;
  
  // Helper function to format date for business day
  const getBusinessDay = (date: Date): string => {
    const hour = date.getHours();
    if (hour < businessDayStartHour) {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  };
  
  // Random helpers
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randomBoolean = (probability = 0.5) => Math.random() < probability;
  
  // Delete existing test data (locker numbers 1-80)
  db.run('DELETE FROM locker_logs WHERE locker_number BETWEEN 1 AND 80');
  
  const now = new Date();
  const currentHour = now.getHours();
  const isCurrentlyDaytime = getTimeTypeWithSettings(now) === '주간';
  
  console.log('=== 테스트 데이터 생성 시작 ===');
  console.log('현재 시각:', now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
  console.log('현재 시간대:', getTimeTypeWithSettings(now));
  
  // 중복 방지: 각 락커당 하나의 entry만 생성
  const usedLockers = new Set<number>();
  
  const paymentMethods: Array<'card' | 'cash' | 'transfer'> = ['card', 'cash', 'transfer'];
  const optionTypes: Array<'none' | 'discount' | 'foreigner'> = ['none'];
  if (enableDiscountOption) optionTypes.push('discount');
  if (enableForeignerOption) optionTypes.push('foreigner');
  
  // Helper: Get unused random locker number
  const getUnusedLocker = (): number | null => {
    if (usedLockers.size >= 80) return null;
    let lockerNumber: number;
    do {
      lockerNumber = randomInt(1, 80);
    } while (usedLockers.has(lockerNumber));
    usedLockers.add(lockerNumber);
    return lockerNumber;
  };
  
  let totalGenerated = 0;
  let additionalFee1Count = 0; // 추가요금 1회 카운터
  let additionalFee2PlusCount = 0; // 추가요금 2회 이상 카운터
  const database = db;
  
  // 먼저 추가요금 발생 데이터를 제한된 개수만큼 생성
  console.log('\n추가요금 1회 데이터 2개 생성 중...');
  // 1. 추가요금 1회 데이터 (1일 전 입실, 최대 2개)
  for (let i = 0; i < 2; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    const daysAgo = 1;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    
    const hour = randomInt(0, 23);
    const minute = randomInt(0, 59);
    
    const entryDate = new Date(targetDate);
    entryDate.setHours(hour, minute, 0, 0);
    
    const timeType = getTimeTypeWithSettings(entryDate);
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} (1일 전) → timeType: ${timeType}, basePrice: ${basePrice}`);
    
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = resolveForeignerFor(timeType) - basePrice;
      finalPrice = resolveForeignerFor(timeType);
    }
    
    const paymentMethod = randomElement(paymentMethods);
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?)`,
      [id, lockerNumber, entryTime, null, businessDay, timeType, basePrice, optionType, optionAmount, finalPrice, '테스트: 추가요금 1회', paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
    );
    
    totalGenerated++;
    additionalFee1Count++;
    updateDailySummary(businessDay);
  }
  
  // 2. 추가요금 2회 이상 데이터 (2~3일 전 입실, 최대 2개)
  console.log('\n추가요금 2회+ 데이터 2개 생성 중...');
  for (let i = 0; i < 2; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    const daysAgo = randomInt(2, 3);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    
    const hour = randomInt(0, 23);
    const minute = randomInt(0, 59);
    
    const entryDate = new Date(targetDate);
    entryDate.setHours(hour, minute, 0, 0);
    
    const timeType = getTimeTypeWithSettings(entryDate);
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} (${daysAgo}일 전) → timeType: ${timeType}, basePrice: ${basePrice}`);
    
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = resolveForeignerFor(timeType) - basePrice;
      finalPrice = resolveForeignerFor(timeType);
    }
    
    const paymentMethod = randomElement(paymentMethods);
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?)`,
      [id, lockerNumber, entryTime, null, businessDay, timeType, basePrice, optionType, optionAmount, finalPrice, '테스트: 추가요금 2회+', paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
    );
    
    totalGenerated++;
    additionalFee2PlusCount++;
    updateDailySummary(businessDay);
  }
  
  // 3. 나머지는 오늘 데이터만 생성 (추가요금 발생하지 않도록)
  // 현재 시각 기준으로 과거 시간만 생성
  const remainingLockers = 80 - usedLockers.size;
  
  // 주간과 야간을 반반씩 생성하도록
  const dayEntries = Math.floor(remainingLockers / 2);
  const nightEntries = remainingLockers - dayEntries;
  
  // 주간 데이터 생성 (오전 7시부터 현재 시각까지만)
  console.log(`\n주간 데이터 ${dayEntries}개 생성 중...`);
  for (let i = 0; i < dayEntries; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    // 현재 시각보다 이전 시간으로만 생성
    const minHour = 7;
    const maxHour = Math.min(currentHour, 18); // 현재 시각과 18시 중 작은 값
    
    // 만약 현재가 오전 7시 이전이면 주간 데이터 생성 불가
    if (maxHour < minHour) continue;
    
    const hour = randomInt(minHour, maxHour);
    const maxMinute = (hour === currentHour) ? now.getMinutes() : 59; // 현재 시각이면 현재 분까지만
    const minute = randomInt(0, maxMinute);
    
    const entryDate = new Date();
    entryDate.setHours(hour, minute, 0, 0);
    
    const timeType = getTimeTypeWithSettings(entryDate); // 실제 입실 시각으로 판단
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    if (i < 3) { // 처음 3개만 로그 출력
      console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} → timeType: ${timeType}, basePrice: ${basePrice}`);
    }
    
    // Random option type
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = resolveForeignerFor(timeType) - basePrice;
      finalPrice = resolveForeignerFor(timeType);
    }
    
    // Random payment method
    const paymentMethod = randomElement(paymentMethods);
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    // Most are in_use (today's data)
    const status = 'in_use';
    const exitTime = null;
    
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        lockerNumber,
        entryTime,
        exitTime,
        businessDay,
        timeType,
        basePrice,
        optionType,
        optionAmount,
        finalPrice,
        status,
        '테스트 데이터',
        paymentMethod,
        paymentCash,
        paymentCard,
        paymentTransfer,
        null
      ]
    );
    
    totalGenerated++;
    
    // Update daily summary for this business day
    updateDailySummary(businessDay);
  }
  
  // 야간 데이터 생성 (어제 저녁 19시 ~ 오늘 오전 7시)
  console.log(`\n야간 데이터 ${nightEntries}개 생성 중...`);
  for (let i = 0; i < nightEntries; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    let entryDate: Date;
    let hour: number;
    let minute: number;
    
    // 50% 확률로 오늘 새벽 또는 어제 저녁
    if (randomBoolean()) {
      // 오늘 새벽 (0-6시, 현재가 7시 이전이면 현재 시각까지)
      const maxNightHour = currentHour < 7 ? currentHour : 6;
      if (maxNightHour < 0) continue; // 현재가 자정 이전이면 스킵
      
      hour = randomInt(0, maxNightHour);
      const maxMinute = (hour === currentHour && currentHour < 7) ? now.getMinutes() : 59;
      minute = randomInt(0, maxMinute);
      
      entryDate = new Date();
      entryDate.setHours(hour, minute, 0, 0);
    } else {
      // 어제 저녁 (19-23시)
      hour = randomInt(19, 23);
      minute = randomInt(0, 59);
      
      entryDate = new Date();
      entryDate.setDate(entryDate.getDate() - 1); // 어제
      entryDate.setHours(hour, minute, 0, 0);
    }
    
    const timeType = getTimeTypeWithSettings(entryDate); // 실제 입실 시각으로 판단
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    if (i < 3) { // 처음 3개만 로그 출력
      console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} → timeType: ${timeType}, basePrice: ${basePrice}`);
    }
    
    // Random option type
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = resolveForeignerFor(timeType) - basePrice;
      finalPrice = resolveForeignerFor(timeType);
    }
    
    // Random payment method
    const paymentMethod = randomElement(paymentMethods);
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    // Most are in_use (today's data)
    const status = 'in_use';
    const exitTime = null;
    
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        lockerNumber,
        entryTime,
        exitTime,
        businessDay,
        timeType,
        basePrice,
        optionType,
        optionAmount,
        finalPrice,
        status,
        '테스트 데이터',
        paymentMethod,
        paymentCash,
        paymentCard,
        paymentTransfer,
        null
      ]
    );
    
    totalGenerated++;
    
    // Update daily summary for this business day
    updateDailySummary(businessDay);
  }
  
  // 4. 과거 데이터는 퇴실 완료된 데이터로만 생성 (추가요금 방지)
  // 영업일 기준(10:00~익일10:00)으로 24시간 전체에 데이터 생성
  for (let pastDays = 1; pastDays <= 7; pastDays++) {
    // 영업일 기준 날짜 계산 (정오 기준)
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - pastDays);
    baseDate.setHours(12, 0, 0, 0); // 정오로 설정하여 영업일 확정
    
    const pastEntries = randomInt(10, 30);
    
    for (let i = 0; i < pastEntries; i++) {
      const lockerNumber = randomInt(1, 80);
      
      // 영업일 기준 24시간 범위에서 랜덤 시간 생성
      // 당일 10:00~23:59 (14시간) 또는 익일 00:00~09:59 (10시간)
      const isNextDayHour = randomBoolean(0.4); // 40% 확률로 익일 새벽 시간
      
      let entryDate: Date;
      if (isNextDayHour) {
        // 익일 00:00~09:59
        entryDate = new Date(baseDate);
        entryDate.setDate(entryDate.getDate() + 1);
        const hour = randomInt(0, 9);
        const minute = randomInt(0, 59);
        entryDate.setHours(hour, minute, 0, 0);
      } else {
        // 당일 10:00~23:59
        entryDate = new Date(baseDate);
        const hour = randomInt(10, 23);
        const minute = randomInt(0, 59);
        entryDate.setHours(hour, minute, 0, 0);
      }
      
      const timeType = getTimeTypeWithSettings(entryDate);
      const basePrice = timeType === '주간' ? dayPrice : nightPrice;
      
      const optionType = randomElement(optionTypes);
      let optionAmount = null;
      let finalPrice = basePrice;
      
      if (optionType === 'discount') {
        optionAmount = -discountAmount;
        finalPrice = basePrice - discountAmount;
      } else if (optionType === 'foreigner') {
        optionAmount = foreignerPrice - basePrice;
        finalPrice = foreignerPrice;
      }
      
      const paymentMethod = randomElement(paymentMethods);
      
      // 과거 데이터는 모두 퇴실 완료 상태
      const status = 'checked_out';
      const exitTime = new Date(entryDate.getTime() + randomInt(30, 180) * 60000).toISOString();
      
      const id = generateId();
      const entryTime = entryDate.toISOString();
      const businessDay = getBusinessDay(entryDate); // 영업일 기준으로 자동 계산
      
      database.run(
        `INSERT INTO locker_logs 
        (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
         option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          id,
          lockerNumber,
          entryTime,
          exitTime,
          businessDay,
          timeType,
          basePrice,
          optionType,
          optionAmount,
          finalPrice,
          status,
          '테스트 데이터 (퇴실완료)',
          paymentMethod,
          null
        ]
      );
      
      totalGenerated++;
      updateDailySummary(businessDay);
    }
  }
  
  // 5. 렌탈 아이템 추가 (기존 additional_revenue_items 테이블 사용)
  // 6. 랜덤하게 사용중인 락커에 렌탈 아이템 추가 (약 30%)
  console.log('\n렌탈 아이템 추가 중...');
  const inUseLogs = db.exec(`SELECT * FROM locker_logs WHERE status = 'in_use' AND locker_number BETWEEN 1 AND 80`);
  
  if (inUseLogs.length > 0 && inUseLogs[0].values.length > 0) {
    const rentalItems = db.exec(`SELECT * FROM additional_revenue_items`);
    const items = rentalItems.length > 0 && rentalItems[0].values.length > 0 
      ? rentalItems[0].values.map((row: any) => ({
          id: row[0],
          name: row[1],
          rentalFee: row[2],
          depositAmount: row[3],
        }))
      : [];
    
    let rentalCount = 0;
    inUseLogs[0].values.forEach((row: any) => {
      // 30% 확률로 렌탈 아이템 추가
      if (randomBoolean(0.3)) {
        const logId = row[0];
        const lockerNumber = row[1];
        const entryTime = row[2];
        const businessDay = row[4];
        const paymentCash = row[14];
        const paymentCard = row[15];
        const paymentTransfer = row[16];
        
        // 랜덤하게 아이템 선택 (1-2개)
        const numItems = randomBoolean(0.5) ? 1 : 2;
        const selectedItems = [];
        const usedItemIds = new Set();
        
        for (let i = 0; i < numItems && i < items.length; i++) {
          let item;
          do {
            item = randomElement(items);
          } while (usedItemIds.has(item.id) && usedItemIds.size < items.length);
          
          usedItemIds.add(item.id);
          selectedItems.push(item);
        }
        
        // 각 아이템마다 렌탈 트랜잭션 생성
        selectedItems.forEach(item => {
          const rentalId = generateId();
          const itemRevenue = item.rentalFee + item.depositAmount; // 대여시: 렌탈비 + 보증금
          
          // 결제 방식은 현금으로 고정
          database.run(
            `INSERT INTO rental_transactions 
            (id, locker_log_id, item_id, item_name, locker_number, rental_time, return_time, business_day, 
             rental_fee, deposit_amount, payment_method, payment_cash, payment_card, payment_transfer, 
             deposit_status, revenue, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?, 'received', ?, ?, ?)`,
            [
              rentalId, logId, item.id, item.name, lockerNumber, entryTime, null, businessDay,
              item.rentalFee, item.depositAmount, itemRevenue, 0, 0, 'received', itemRevenue,
              new Date().toISOString(), new Date().toISOString()
            ]
          );
        });
        
        rentalCount++;
      }
    });
    
    console.log(`  ${rentalCount}개 락커에 렌탈 아이템 추가`);
  }
  
  saveDatabaseDebounced();
  
  console.log(`\n테스트 데이터 생성 완료: 총 ${totalGenerated}건 (과거 7일치, 락커 #1~80)`);
  console.log(`- 추가요금 1회: ${additionalFee1Count}건 (오렌지)`);
  console.log(`- 추가요금 2회+: ${additionalFee2PlusCount}건 (레드)`);
}

// Create comprehensive test data with guaranteed same-business-day additional fee
export async function createAdditionalFeeTestData(settingsOverride?: any) {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise<boolean>((resolve, reject) => {
    try {
      if (settingsOverride) {
        updateSettings(settingsOverride);
      }
      const settings = getSettings();
      const {
        dayPrice,
        nightPrice,
        businessDayStartHour,
        discountAmount,
        foreignerPrice,
        foreignerSeparateDayNight = false,
        foreignerDayPrice = foreignerPrice,
        foreignerNightPrice = foreignerPrice,
        domesticCheckpointHour = 1,
        foreignerAdditionalFeePeriod = 24,
        enableDiscountOption = true,
        enableForeignerOption = true,
        dayStartTime = '07:00',
        nightStartTime = '19:00',
        domesticAdditionalFeeMode = 'nextday',
      } = settings;

      const feeMode =
        domesticAdditionalFeeMode === 'pending4' ? 'stagedHourly' : domesticAdditionalFeeMode;
      const nightStartHour = parseInt(String(nightStartTime).split(':')[0], 10) || 19;
      const settlementCycleOpts = getSettlementCycleOptions(settings as any);
      const stagedHourlyOpts = getStagedHourlyOptions(settings as any);
      const nightstartOpts = getNightstartOptions(settings as any);
      const resolveForeignerFor = (timeType: string) => {
        if (foreignerSeparateDayNight) {
          return timeType === '주간' ? foreignerDayPrice : foreignerNightPrice;
        }
        return foreignerPrice;
      };
      // Random helpers
      const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      const randomBoolean = (probability = 0.5) => Math.random() < probability;
      
      // Delete existing test data (locker numbers 1-80)
      db!.run('DELETE FROM additional_fee_events WHERE locker_number BETWEEN 1 AND 80');
      db!.run('DELETE FROM locker_logs WHERE locker_number BETWEEN 1 AND 80');
      
      const paymentMethods: Array<'card' | 'cash' | 'transfer'> = ['card', 'cash', 'transfer'];
      const optionTypes: Array<'none' | 'discount' | 'foreigner'> = ['none'];
      if (enableDiscountOption) optionTypes.push('discount');
      if (enableForeignerOption) optionTypes.push('foreigner');
      
      let totalGenerated = 0;
      console.log('=== 3일치 랜덤 테스트 데이터 생성 시작 ===');
      console.log(`📍 추가요금 모드: ${feeMode}, 외국인분리: ${foreignerSeparateDayNight}`);
      
      // Get current business day range
      const now = new Date();
      const calcFee = (
        entryTime: Date,
        timeType: '주간' | '야간',
        isForeigner: boolean
      ) =>
        calculateAdditionalFee(
          entryTime.toISOString(),
          timeType,
          dayPrice,
          nightPrice,
          now,
          isForeigner,
          resolveForeignerFor(timeType),
          domesticCheckpointHour,
          foreignerAdditionalFeePeriod,
          false,
          feeMode as any,
          nightStartHour,
          settlementCycleOpts,
          stagedHourlyOpts,
          nightstartOpts
        );
      const currentBusinessDay = getBusinessDay(now, businessDayStartHour);
      const { start: currentBusinessDayStart } = getBusinessDayRange(now, businessDayStartHour);
      
      console.log(`📍 현재 영업일: ${currentBusinessDay}`);
      console.log(`📍 영업일 시작: ${currentBusinessDayStart.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
      
      // ===== CURRENT IN-USE LOCKERS: Generate 5-10 random lockers with various states =====
      console.log('\n현재 사용 중인 락커 생성 (5-10개, 다양한 상태)');
      
      const numCurrentLockers = randomInt(5, 10);
      const currentUsedLockers = new Set<number>();
      
      // Pre-determine state distribution to guarantee at least one of each color
      // 30% Green, 30% Red, 20% Yellow, 20% Blue
      const states: string[] = [];
      const greenCount = Math.max(1, Math.round(numCurrentLockers * 0.3)); // At least 1
      const redCount = Math.max(1, Math.round(numCurrentLockers * 0.3)); // At least 1
      const yellowCount = Math.max(1, Math.round(numCurrentLockers * 0.2));
      const blueCount = numCurrentLockers - greenCount - redCount - yellowCount;
      
      for (let i = 0; i < greenCount; i++) states.push('green');
      for (let i = 0; i < redCount; i++) states.push('red');
      for (let i = 0; i < yellowCount; i++) states.push('yellow');
      for (let i = 0; i < blueCount; i++) states.push('blue');
      
      // Shuffle states for randomness
      for (let i = states.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [states[i], states[j]] = [states[j], states[i]];
      }
      
      for (let i = 0; i < numCurrentLockers; i++) {
        // Get unused locker number
        let lockerNumber: number;
        do {
          lockerNumber = randomInt(1, 80);
        } while (currentUsedLockers.has(lockerNumber));
        currentUsedLockers.add(lockerNumber);
        
        const state = states[i];
        
        if (state === 'green') {
          // GREEN: Previous business day entry with NO additional fee
          // - 내국인: 이전 영업일 야간(19:00~) 입실 + 아직 첫 자정 안 넘김
          // - 외국인: 이전 영업일 입실 + 아직 24시간 안 지남
          
          const previousBusinessDayStart = new Date(currentBusinessDayStart.getTime() - 24 * 60 * 60 * 1000);
          
          // 50% 외국인, 50% 내국인
          const isForeigner = enableForeignerOption && randomBoolean(0.5);
          let entryTime: Date;
          let validEntry = false;
          let attempts = 0;
          const maxAttempts = 20;
          
          while (!validEntry && attempts < maxAttempts) {
            attempts++;
            
            if (isForeigner) {
              // 외국인: 24시간 기준 → 현재 시각 - 24시간 이내 입실
              // 범위: max(previousBusinessDayStart, now - 24시간 + 1시간 버퍼) ~ currentBusinessDayStart - 1
              const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
              const minEntryTime = Math.max(previousBusinessDayStart.getTime(), twentyFourHoursAgo + 60 * 60 * 1000); // +1시간 버퍼
              const maxEntryTime = currentBusinessDayStart.getTime() - 1;
              
              if (minEntryTime >= maxEntryTime) {
                console.log(`  ⚠️ 락커 #${lockerNumber}: 외국인 그린 생성 불가 (유효 시간 범위 없음)`);
                break;
              }
              
              entryTime = new Date(minEntryTime + Math.random() * (maxEntryTime - minEntryTime));
            } else {
              // 내국인: 자정 기준 → 이전 영업일 야간(19:00~) + 아직 첫 자정 안 넘김
              // 첫 자정 = 입실일 다음날 00:00
              // 범위: previousBusinessDayStart + 9시간(19:00) ~ min(currentBusinessDayStart - 1, 다음날 00:00 - 1)
              
              const nineteenHoursAfterStart = previousBusinessDayStart.getTime() + 9 * 60 * 60 * 1000; // 19:00
              
              // 다음날 00:00 (첫 자정)
              const nextMidnight = new Date(previousBusinessDayStart);
              nextMidnight.setDate(nextMidnight.getDate() + 1);
              nextMidnight.setHours(0, 0, 0, 0);
              
              const minEntryTime = nineteenHoursAfterStart;
              const maxEntryTime = Math.min(currentBusinessDayStart.getTime() - 1, nextMidnight.getTime() - 1);
              
              if (minEntryTime >= maxEntryTime) {
                console.log(`  ⚠️ 락커 #${lockerNumber}: 내국인 그린 생성 불가 (현재 시각으로는 자정 안 넘긴 야간 입실 불가능)`);
                break;
              }
              
              entryTime = new Date(minEntryTime + Math.random() * (maxEntryTime - minEntryTime));
            }
            
            // 검증: 추가요금이 없는지 확인
            const businessDay = getBusinessDay(entryTime, businessDayStartHour);
            const timeType = getTimeTypeWithSettings(entryTime);
            
            const { additionalFeeCount, additionalFee } = calcFee(entryTime, timeType, isForeigner);
            
            if (additionalFeeCount === 0) {
              validEntry = true;
              
              const basePrice = isForeigner ? resolveForeignerFor(timeType) : (timeType === '주간' ? dayPrice : nightPrice);
              const optionType = isForeigner ? 'foreigner' : 'none';
              const paymentMethod = randomElement(paymentMethods);
              
              db!.run(
                `INSERT INTO locker_logs 
                (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
                 option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
                 payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
                [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
                 timeType, basePrice, optionType, 0, basePrice, 
                 `이전영업일+사용중+추가요금없음(${isForeigner ? '외국인' : '내국인'})`, 
                 paymentMethod, 
                 paymentMethod === 'cash' ? basePrice : 0,
                 paymentMethod === 'card' ? basePrice : 0,
                 paymentMethod === 'transfer' ? basePrice : 0,
                 null]
              );
              
              console.log(`  🟢 락커 #${lockerNumber}: 그린 (${isForeigner ? '외국인' : '내국인'}, ${timeType}, 입실: ${entryTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}) ✓`);
              totalGenerated++;
              updateDailySummary(businessDay);
            } else {
              console.log(`  ⚠️ 락커 #${lockerNumber}: 그린 재시도 (추가요금: ${additionalFee}원, ${attempts}/${maxAttempts})`);
            }
          }
          
          if (!validEntry) {
            console.log(`  ❌ 락커 #${lockerNumber}: 그린 생성 실패 (${maxAttempts}회 시도 후 포기)`);
          }
          
        } else if (state === 'red') {
          // RED: Previous business day entry, crossed midnight → additional fee MUST occur
          // Validate with calculateAdditionalFee to guarantee red status
          
          const previousBusinessDayStart = new Date(currentBusinessDayStart.getTime() - 24 * 60 * 60 * 1000);
          
          let validEntry = false;
          let attempts = 0;
          const maxAttempts = 20;
          let entryTime: Date;
          let optionType: 'none' | 'foreigner';
          let basePrice: number;
          let timeType: '주간' | '야간';
          let businessDay: string;
          
          while (!validEntry && attempts < maxAttempts) {
            attempts++;
            
            // 50% 외국인, 50% 내국인
            const isForeigner = enableForeignerOption && randomBoolean(0.5);
            optionType = isForeigner ? 'foreigner' : 'none';
            
            if (isForeigner) {
              // 외국인: 24시간 기준 → 24시간 이상 전에 입실
              // 현재 시각 - 25~35시간 전
              const hoursAgo = randomInt(25, 35);
              entryTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
              
              // Make sure entry is in previous business day range
              if (entryTime < previousBusinessDayStart) {
                entryTime = new Date(previousBusinessDayStart.getTime() + randomInt(1, 12) * 60 * 60 * 1000);
              }
            } else {
              // 내국인: 자정 기준 → 어제 주간 또는 야간 < 07:00 입실 (첫 자정에 추가요금 발생)
              // 야간 >= 19:00는 첫 자정 무료이므로 제외
              const useEarlyMorning = randomBoolean(0.5);
              
              if (useEarlyMorning) {
                // 야간 < 07:00 입실: 새벽 00:00 ~ 06:59
                const entryHour = randomInt(0, 6);
                const entryMinute = randomInt(0, 59);
                entryTime = new Date(previousBusinessDayStart);
                entryTime.setDate(entryTime.getDate() + 1); // 다음 날로 이동
                entryTime.setHours(entryHour, entryMinute, 0, 0);
              } else {
                // 주간 입실: 07:00 ~ 18:59
                const hoursAfterStart = randomInt(0, 9); // 0-9시간 (최대 19:00까지)
                entryTime = new Date(previousBusinessDayStart.getTime() + hoursAfterStart * 60 * 60 * 1000);
              }
            }
            
            businessDay = getBusinessDay(entryTime, businessDayStartHour);
            timeType = getTimeTypeWithSettings(entryTime);
            basePrice = timeType === '주간' ? dayPrice : nightPrice;
            
            // Validate: Must have additional fee
            const result = calcFee(entryTime, timeType, optionType === 'foreigner');
            
            if (result.additionalFee > 0) {
              validEntry = true;
              
              const paymentMethod = randomElement(paymentMethods);
              
              db!.run(
                `INSERT INTO locker_logs 
                (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
                 option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
                 payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
                [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
                 timeType, basePrice, optionType, 0, basePrice, 
                 `이전영업일+사용중+추가요금발생(${isForeigner ? '외국인' : '내국인'})`, 
                 paymentMethod,
                 paymentMethod === 'cash' ? basePrice : 0,
                 paymentMethod === 'card' ? basePrice : 0,
                 paymentMethod === 'transfer' ? basePrice : 0,
                 null]
              );
              
              console.log(`  🔴 락커 #${lockerNumber}: 레드 (${isForeigner ? '외국인' : '내국인'}, ${timeType}, 추가요금: ₩${result.additionalFee.toLocaleString()}, 입실: ${entryTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}) ✓`);
              totalGenerated++;
              updateDailySummary(businessDay);
            } else {
              console.log(`  ⚠️ 락커 #${lockerNumber}: 레드 재시도 (추가요금: ${result.additionalFee}원, ${attempts}/${maxAttempts})`);
            }
          }
          
          if (!validEntry) {
            console.log(`  ❌ 락커 #${lockerNumber}: 레드 생성 실패 (${maxAttempts}회 시도 후 포기)`);
          }
          
        } else if (state === 'yellow') {
          // YELLOW: Today daytime entry (must be in the past)
          // Calculate max hours from business day start to current time
          const now = new Date();
          const maxHoursFromStart = Math.floor((now.getTime() - currentBusinessDayStart.getTime()) / (60 * 60 * 1000));
          const maxHours = Math.min(8, maxHoursFromStart - 1); // Cap at 8 hours, ensure past time
          
          if (maxHours < 1) {
            // Not enough time passed since business day start, skip yellow
            continue;
          }
          
          const hoursAfterStart = randomInt(1, maxHours);
          const entryTime = new Date(currentBusinessDayStart.getTime() + hoursAfterStart * 60 * 60 * 1000);
          
          const businessDay = getBusinessDay(entryTime, businessDayStartHour);
          const timeType = getTimeTypeWithSettings(entryTime);
          const basePrice = dayPrice;
          const paymentMethod = randomElement(paymentMethods);
          
          db!.run(
            `INSERT INTO locker_logs 
            (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
             option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
             payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
            [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
             timeType, basePrice, 'none', 0, basePrice, '오늘주간입실+사용중', 
             paymentMethod,
             paymentMethod === 'cash' ? basePrice : 0,
             paymentMethod === 'card' ? basePrice : 0,
             paymentMethod === 'transfer' ? basePrice : 0,
             null]
          );
          
          console.log(`  🟡 락커 #${lockerNumber}: 옐로우 (오늘 주간 입실)`);
          totalGenerated++;
          updateDailySummary(businessDay);
          
        } else {
          // BLUE: Today nighttime entry (must be in the past)
          // Calculate max hours from business day start to current time
          const now = new Date();
          const maxHoursFromStart = Math.floor((now.getTime() - currentBusinessDayStart.getTime()) / (60 * 60 * 1000));
          const maxHours = Math.min(15, maxHoursFromStart - 1); // Cap at 15 hours, ensure past time
          
          if (maxHours < 9) {
            // Not enough time passed for nighttime entry, skip blue
            continue;
          }
          
          const hoursAfterStart = randomInt(9, maxHours);
          const entryTime = new Date(currentBusinessDayStart.getTime() + hoursAfterStart * 60 * 60 * 1000);
          
          const businessDay = getBusinessDay(entryTime, businessDayStartHour);
          const timeType = getTimeTypeWithSettings(entryTime);
          const basePrice = nightPrice;
          const paymentMethod = randomElement(paymentMethods);
          
          db!.run(
            `INSERT INTO locker_logs 
            (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
             option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
             payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
            [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
             timeType, basePrice, 'none', 0, basePrice, '오늘야간입실+사용중', 
             paymentMethod,
             paymentMethod === 'cash' ? basePrice : 0,
             paymentMethod === 'card' ? basePrice : 0,
             paymentMethod === 'transfer' ? basePrice : 0,
             null]
          );
          
          console.log(`  🔵 락커 #${lockerNumber}: 블루 (오늘 야간 입실)`);
          totalGenerated++;
          updateDailySummary(businessDay);
        }
      }
      
      console.log(`\n✅ 현재 사용 중인 락커 ${numCurrentLockers}개 생성 완료`);
      
      // ===== NO PAST DATA: Only today's data =====
      // Past data generation removed to ensure fresh state on initial installation
      console.log('\n✅ 과거 데이터 생성 생략 (깨끗한 상태 유지)');
      
      // ===== TODAY'S DATA: More in-use entries =====
      console.log('\n추가 사용중 락커 생성 중...');
      const nowForToday = new Date();
      const todayEntries = randomInt(5, 15);
      
      // Use existing currentUsedLockers Set to avoid duplicates
      const usedLockers = currentUsedLockers;
      
      const getUnusedLocker = (): number | null => {
        if (usedLockers.size >= 80) return null;
        let lockerNumber: number;
        do {
          lockerNumber = randomInt(1, 80);
        } while (usedLockers.has(lockerNumber));
        usedLockers.add(lockerNumber);
        return lockerNumber;
      };
      
      // Calculate valid entry time range for current business day
      // If current time is before business day start (e.g., 02:00, start at 10:00)
      // → Use yesterday's business day start to now
      // If current time is after business day start
      // → Use today's business day start to now
      let entryRangeStart: Date;
      if (nowForToday < currentBusinessDayStart) {
        // Early morning (before business day start)
        entryRangeStart = new Date(currentBusinessDayStart.getTime() - 24 * 60 * 60 * 1000);
        console.log(`  ⏰ 새벽 시간 (${nowForToday.getHours()}시) → 어제 영업일 시작부터 생성`);
      } else {
        entryRangeStart = currentBusinessDayStart;
        console.log(`  ⏰ 영업일 시작 이후 → 오늘 영업일 시작부터 생성`);
      }
      
      console.log(`  📅 입실 범위: ${entryRangeStart.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} ~ ${nowForToday.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
      
      for (let i = 0; i < todayEntries; i++) {
        const lockerNumber = getUnusedLocker();
        if (!lockerNumber) break;
        
        // Random entry time within valid range
        const timeRange = nowForToday.getTime() - entryRangeStart.getTime();
        const randomOffset = Math.floor(Math.random() * timeRange);
        const entryDate = new Date(entryRangeStart.getTime() + randomOffset);
        
        const timeType = getTimeTypeWithSettings(entryDate);
        const basePrice = timeType === '주간' ? dayPrice : nightPrice;
        
        const optionType = randomElement(optionTypes);
        let optionAmount = 0;
        let finalPrice = basePrice;
        
        if (optionType === 'discount') {
          optionAmount = -discountAmount;
          finalPrice = basePrice - discountAmount;
        } else if (optionType === 'foreigner') {
          optionAmount = resolveForeignerFor(timeType) - basePrice;
          finalPrice = resolveForeignerFor(timeType);
        }
        
        const paymentMethod = randomElement(paymentMethods);
        const paymentCash = paymentMethod === 'cash' ? finalPrice : 0;
        const paymentCard = paymentMethod === 'card' ? finalPrice : 0;
        const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : 0;
        
        const id = generateId();
        const businessDay = getBusinessDay(entryDate, businessDayStartHour);
        
        db!.run(
          `INSERT INTO locker_logs 
          (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
           option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
           payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
          [id, lockerNumber, entryDate.toISOString(), null, businessDay, 
           timeType, basePrice, optionType, optionAmount, finalPrice, '테스트 데이터', 
           paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
        );
        
        totalGenerated++;
        updateDailySummary(businessDay);
      }
      
      // ===== GENERATE PAST COMPLETED DATA (checked_out) for sales reports =====
      console.log('\n과거 퇴실 완료 데이터 생성 (매출 리포트용)');
      
      for (let pastDays = 0; pastDays <= 7; pastDays++) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - pastDays);
        
        // 과거 날짜의 데이터 개수 (오늘은 적게, 과거로 갈수록 많게)
        const pastEntries = pastDays === 0 ? randomInt(5, 15) : randomInt(20, 40);
        
        for (let i = 0; i < pastEntries; i++) {
          let lockerNumber: number;
          do {
            lockerNumber = randomInt(1, 80);
          } while (currentUsedLockers.has(lockerNumber));
          
          const hour = randomInt(10, 23);
          const minute = randomInt(0, 59);
          
          const entryDate = new Date(pastDate);
          entryDate.setHours(hour, minute, 0, 0);
          
          const timeType = getTimeTypeWithSettings(entryDate);
          const basePrice = timeType === '주간' ? dayPrice : nightPrice;
          
          const optionType = randomElement(optionTypes);
          let optionAmount = 0;
          let finalPrice = basePrice;
          
          if (optionType === 'discount') {
            optionAmount = -discountAmount;
            finalPrice = basePrice - discountAmount;
          } else if (optionType === 'foreigner') {
            optionAmount = resolveForeignerFor(timeType) - basePrice;
            finalPrice = resolveForeignerFor(timeType);
          }
          
          const paymentMethod = randomElement(paymentMethods);
          const paymentCash = paymentMethod === 'cash' ? finalPrice : 0;
          const paymentCard = paymentMethod === 'card' ? finalPrice : 0;
          const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : 0;
          
          const exitDate = new Date(entryDate.getTime() + randomInt(30, 180) * 60000);
          
          const id = generateId();
          const businessDay = getBusinessDay(entryDate, businessDayStartHour);
          
          db!.run(
            `INSERT INTO locker_logs 
            (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
             option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
             payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'checked_out', 0, ?, ?, ?, ?, ?, ?, 0)`,
            [id, lockerNumber, entryDate.toISOString(), exitDate.toISOString(), businessDay, 
             timeType, basePrice, optionType, optionAmount, finalPrice, '테스트 데이터 (퇴실완료)', 
             paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
          );
          
          totalGenerated++;
          updateDailySummary(businessDay);
        }
        
        console.log(`  ${pastDays === 0 ? '오늘' : pastDays + '일 전'}: ${pastEntries}건 생성`);
      }
      
      // ===== Mode 3/4: 정산 이전 입실 시나리오 (#3, #4) =====
      if (feeMode === 'settlementCycle' || feeMode === 'stagedHourly') {
        const dayStartHour = parseInt(String(dayStartTime).split(':')[0], 10) || 7;
        if (dayStartHour < businessDayStartHour) {
          const preSettlement = new Date(currentBusinessDayStart.getTime() - 60 * 60 * 1000);
          preSettlement.setMinutes(0, 0, 0);
          if (preSettlement.getTime() < now.getTime()) {
            for (const [lockerNumber, entryTime, note] of [
              [3, preSettlement, `${feeMode}검증(정산이전입실)`],
              [4, new Date(preSettlement.getTime() - 3 * 60 * 60 * 1000), `${feeMode}검증(정산이전입실·장시간)`],
            ] as Array<[number, Date, string]>) {
              db!.run(`DELETE FROM locker_logs WHERE locker_number = ? AND status = 'in_use'`, [lockerNumber]);
              const timeType = getTimeTypeWithSettings(entryTime);
              const basePrice = timeType === '주간' ? dayPrice : nightPrice;
              const paymentMethod = randomElement(paymentMethods);
              const businessDay = getBusinessDay(entryTime, businessDayStartHour);
              db!.run(
                `INSERT INTO locker_logs
                (id, locker_number, entry_time, exit_time, business_day, time_type, base_price,
                 option_type, option_amount, final_price, status, cancelled, notes, payment_method,
                 payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
                [
                  generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, timeType,
                  basePrice, 'none', 0, basePrice, note, paymentMethod,
                  paymentMethod === 'cash' ? basePrice : 0,
                  paymentMethod === 'card' ? basePrice : 0,
                  paymentMethod === 'transfer' ? basePrice : 0,
                  null,
                ]
              );
              updateDailySummary(businessDay);
              totalGenerated++;
              console.log(`  ✅ 락커 #${lockerNumber}: ${note}`);
            }
          }
        } else {
          console.log(`  ⚠️ 정산 이전 시나리오 생략 (정산 ${businessDayStartHour}시, 주간시작 ${dayStartHour}시)`);
        }
      }

      saveDatabaseDebounced();
      
      // Verify additional fee pending lockers (in_use with expected fees)
      const pendingStmt = db!.prepare(`
        SELECT COUNT(*) as count 
        FROM locker_logs 
        WHERE locker_number BETWEEN 1 AND 80 
        AND status = 'in_use'
        AND notes LIKE '%추가요금%'
      `);
      const pendingResult = pendingStmt.get([]) as any;
      const pendingAdditionalFeeCount = pendingResult?.count || 0;
      pendingStmt.free();
      
      // Verify completed additional fee events
      const verifyStmt = db!.prepare('SELECT COUNT(*) as count FROM additional_fee_events WHERE locker_number BETWEEN 1 AND 80');
      const verifyResult = verifyStmt.get([]) as any;
      const completedAdditionalFeeCount = verifyResult?.count || 0;
      verifyStmt.free();
      
      console.log('\n='.repeat(60));
      console.log('✅ 테스트 데이터 생성 완료!');
      console.log('='.repeat(60));
      console.log(`📊 총 생성 건수: ${totalGenerated}건 (락커 #1~80, 3일치)`);
      console.log(`🔴 추가요금 발생 예정: ${pendingAdditionalFeeCount}건 (사용중, 퇴실 시 기록됨)`);
      console.log(`💰 추가요금 이미 처리: ${completedAdditionalFeeCount}건 (퇴실 완료)`);
      
      if (pendingAdditionalFeeCount === 0 && completedAdditionalFeeCount === 0) {
        console.warn('⚠️ 추가요금 관련 락커가 생성되지 않았습니다.');
      } else {
        console.log('🎯 Type A 시나리오: 전일 주간 입실 + 자정 넘김 + 사용중 (₩5,000 발생 예정) ✓');
        
        // Show detailed info about completed additional fees
        if (completedAdditionalFeeCount > 0) {
          const feeDetailsStmt = db!.prepare(`
            SELECT 
              afe.locker_number,
              afe.fee_amount,
              afe.payment_method,
              afe.business_day,
              ll.business_day as entry_business_day
            FROM additional_fee_events afe
            LEFT JOIN locker_logs ll ON afe.locker_log_id = ll.id
            WHERE afe.locker_number BETWEEN 1 AND 80
            ORDER BY afe.checkout_time DESC
          `);
          
          const feeDetails: Array<{
            locker_number: number;
            fee_amount: number;
            payment_method: string;
            business_day: string;
            entry_business_day: string;
          }> = [];
          
          while (feeDetailsStmt.step()) {
            const row = feeDetailsStmt.getAsObject() as any;
            feeDetails.push(row);
          }
          feeDetailsStmt.free();
          
          console.log('\n📋 퇴실 완료된 추가요금 내역:');
          feeDetails.forEach((fee, idx) => {
            const sameDay = fee.business_day === fee.entry_business_day ? '✅ 같은 영업일' : '❌ 다른 영업일';
            console.log(`  ${idx + 1}. 락커 #${fee.locker_number}: ${fee.fee_amount}원 (${fee.payment_method.toUpperCase()}) - ${sameDay}`);
          });
        }
      }
      console.log('='.repeat(60));
      
      setTimeout(() => {
        resolve(true);
      }, 100);
    } catch (error) {
      console.error('Error creating test data:', error);
      reject(error);
    }
  });
}
