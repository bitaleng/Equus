/**
 * 비즈니스 데이 계산 유틸리티 (클라이언트/서버 공유)
 * 매출 집계는 오전 10시부터 다음날 오전 9시 59분 59초까지
 * Timezone: Asia/Seoul (KST) - 프로덕션 환경에서도 일관성 보장
 */

import { toZonedTime, format } from 'date-fns-tz';

const SEOUL_TIMEZONE = 'Asia/Seoul';

/**
 * 주어진 시간이 속한 비즈니스 데이를 계산 (KST 기준)
 */
export function getBusinessDay(date: Date = new Date(), businessDayStartHour: number = 10): string {
  // 서울 시간대로 변환
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const hour = seoulDate.getHours();
  
  if (hour < businessDayStartHour) {
    const yesterday = new Date(seoulDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }
  
  return formatDate(seoulDate);
}

/**
 * 특정 비즈니스 데이의 시작/종료 시간을 반환 (KST 기준, UTC로 변환)
 * 
 * @param date 기준 날짜 (기본값: 현재)
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 * @returns { start: 비즈니스 데이 시작 시각 (UTC), end: 비즈니스 데이 종료 시각 (UTC), businessDay: YYYY-MM-DD 문자열 }
 * 
 * @example
 * // 2025-11-06 14:00 KST에 호출하면 (businessDayStartHour = 10)
 * // start: 2025-11-06 10:00:00.000 KST (= 2025-11-06 01:00:00.000 UTC)
 * // end: 2025-11-07 09:59:59.999 KST (= 2025-11-07 00:59:59.999 UTC)
 * // businessDay: '2025-11-06'
 */
export function getBusinessDayRange(
  date: Date = new Date(), 
  businessDayStartHour: number = 10
): { start: Date; end: Date; businessDay: string } {
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const businessDay = getBusinessDay(seoulDate, businessDayStartHour);
  
  // Parse businessDay string (YYYY-MM-DD)
  const [year, month, day] = businessDay.split('-').map(Number);
  
  // KST = UTC+9
  // Convert KST hours to UTC hours
  const KST_OFFSET_HOURS = 9;
  
  // Start: businessDay at businessDayStartHour:00:00 KST
  // Example: 2025-11-06 10:00:00 KST = 2025-11-06 01:00:00 UTC
  let startUTCHour = businessDayStartHour - KST_OFFSET_HOURS;
  let startUTCDay = day;
  let startUTCMonth = month;
  let startUTCYear = year;
  
  // Handle day boundary crossing
  if (startUTCHour < 0) {
    startUTCHour += 24;
    startUTCDay -= 1;
    if (startUTCDay < 1) {
      startUTCMonth -= 1;
      if (startUTCMonth < 1) {
        startUTCMonth = 12;
        startUTCYear -= 1;
      }
      // Get last day of previous month (simple approximation)
      startUTCDay = new Date(startUTCYear, startUTCMonth, 0).getDate();
    }
  } else if (startUTCHour >= 24) {
    startUTCHour -= 24;
    startUTCDay += 1;
    // Handle month overflow
    const daysInMonth = new Date(startUTCYear, startUTCMonth, 0).getDate();
    if (startUTCDay > daysInMonth) {
      startUTCDay = 1;
      startUTCMonth += 1;
      if (startUTCMonth > 12) {
        startUTCMonth = 1;
        startUTCYear += 1;
      }
    }
  }
  
  const start = new Date(Date.UTC(startUTCYear, startUTCMonth - 1, startUTCDay, startUTCHour, 0, 0, 0));
  
  // End: next day at businessDayStartHour:00:00 KST - 1 millisecond
  // Example: 2025-11-07 09:59:59.999 KST = 2025-11-07 00:59:59.999 UTC
  let endUTCHour = businessDayStartHour - KST_OFFSET_HOURS;
  let endUTCDay = day + 1;
  let endUTCMonth = month;
  let endUTCYear = year;
  
  // Handle month/year overflow for end day
  const daysInMonth = new Date(endUTCYear, endUTCMonth, 0).getDate();
  if (endUTCDay > daysInMonth) {
    endUTCDay = 1;
    endUTCMonth += 1;
    if (endUTCMonth > 12) {
      endUTCMonth = 1;
      endUTCYear += 1;
    }
  }
  
  // Handle hour boundary crossing for end
  if (endUTCHour < 0) {
    endUTCHour += 24;
    endUTCDay -= 1;
    if (endUTCDay < 1) {
      endUTCMonth -= 1;
      if (endUTCMonth < 1) {
        endUTCMonth = 12;
        endUTCYear -= 1;
      }
      endUTCDay = new Date(endUTCYear, endUTCMonth, 0).getDate();
    }
  } else if (endUTCHour >= 24) {
    endUTCHour -= 24;
    endUTCDay += 1;
    const endDaysInMonth = new Date(endUTCYear, endUTCMonth, 0).getDate();
    if (endUTCDay > endDaysInMonth) {
      endUTCDay = 1;
      endUTCMonth += 1;
      if (endUTCMonth > 12) {
        endUTCMonth = 1;
        endUTCYear += 1;
      }
    }
  }
  
  const end = new Date(Date.UTC(endUTCYear, endUTCMonth - 1, endUTCDay, endUTCHour, 0, 0, 0));
  // Subtract 1 millisecond to get 09:59:59.999 instead of 10:00:00.000
  end.setMilliseconds(end.getMilliseconds() - 1);
  
  return {
    start,
    end,
    businessDay
  };
}

/**
 * 현재 시간대가 주간인지 야간인지 판단 (KST 기준)
 * @param date 기준 시각 (기본값: 현재)
 * @param dayStartTime 주간 시작 시간 "HH:mm" 형식 (기본값: "07:00")
 * @param nightStartTime 야간 시작 시간 "HH:mm" 형식 (기본값: "19:00")
 */
export function getTimeType(
  date: Date = new Date(),
  dayStartTime: string = "07:00",
  nightStartTime: string = "19:00"
): '주간' | '야간' {
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const currentHour = seoulDate.getHours();
  const currentMinute = seoulDate.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  // 주간/야간 시작 시간 파싱
  const [dayH, dayM] = dayStartTime.split(':').map(Number);
  const [nightH, nightM] = nightStartTime.split(':').map(Number);
  const dayStartMinutes = dayH * 60 + dayM;
  const nightStartMinutes = nightH * 60 + nightM;
  
  // 주간: dayStartMinutes <= current < nightStartMinutes
  if (dayStartMinutes < nightStartMinutes) {
    // 일반 케이스: 주간시작 < 야간시작 (예: 07:00 ~ 19:00)
    return (currentTotalMinutes >= dayStartMinutes && currentTotalMinutes < nightStartMinutes) ? '주간' : '야간';
  } else {
    // 역전 케이스: 야간시작 < 주간시작 (예: 야간 22:00 ~ 주간 06:00)
    // 야간: nightStartMinutes <= current < dayStartMinutes
    return (currentTotalMinutes >= nightStartMinutes && currentTotalMinutes < dayStartMinutes) ? '야간' : '주간';
  }
}

export function getBasePrice(timeType: '주간' | '야간', dayPrice: number = 10000, nightPrice: number = 15000): number {
  return timeType === '주간' ? dayPrice : nightPrice;
}

function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd', { timeZone: SEOUL_TIMEZONE });
}

export function calculateFinalPrice(
  basePrice: number,
  optionType: 'none' | 'discount' | 'custom' | 'foreigner',
  optionAmount?: number,
  discountAmount: number = 2000,
  foreignerPrice: number = 25000
): number {
  if (optionType === 'foreigner') return foreignerPrice;
  if (optionType === 'discount') return basePrice - discountAmount;
  if (optionType === 'custom' && optionAmount) return basePrice - optionAmount;
  return basePrice;
}

/**
 * 추가요금 계산 함수
 * 
 * 규칙 (내국인):
 * 1. 주간 입실: 같은 영업일의 체크포인트(01:00)를 넘기면 추가요금(야간-주간 차액)
 *    - 이후 매 24시간(다음 01:00)마다 야간요금 추가
 * 2. 야간 입실: 다음 영업일의 체크포인트(01:00)를 넘기면 추가요금(야간요금)
 *    - 이후 매 24시간(다음 01:00)마다 야간요금 추가
 * 
 * 규칙 (외국인):
 * - 입실 시각 기준 설정된 주기마다 외국인요금(foreignerPrice) 추가
 * 
 * 규칙 (무료입장 - 주간 07:00~16:59:59):
 * - 입실 후 24시간 내에는 추가요금 없음 (첫 체크포인트 면제)
 * - 24시간 경과 후부터는 유료입장과 동일하게 체크포인트마다 야간요금 추가
 * 
 * @param entryTime 입실 시간
 * @param entryTimeType 입실 시간대 (주간/야간)
 * @param dayPrice 주간 요금
 * @param nightPrice 야간 요금
 * @param currentTime 현재 시간 (기본값: 현재)
 * @param isForeigner 외국인 여부 (기본값: false)
 * @param foreignerPrice 외국인 요금 (기본값: 25000)
 * @param domesticCheckpointHour 내국인 추가요금 체크포인트 시간 (기본값: 1)
 * @param foreignerAdditionalFeePeriod 외국인 추가요금 주기(시간) (기본값: 24)
 * @param isFreeEntry 무료입장 여부 (기본값: false)
 * @returns { additionalFee: 추가요금, midnightsPassed: 넘긴 체크포인트 횟수, additionalFeeCount: 추가요금 횟수 }
 */
export function calculateAdditionalFee(
  entryTime: Date | string,
  entryTimeType: '주간' | '야간',
  dayPrice: number = 10000,
  nightPrice: number = 15000,
  currentTime: Date = new Date(),
  isForeigner: boolean = false,
  foreignerPrice: number = 25000,
  domesticCheckpointHour: number = 1,
  foreignerAdditionalFeePeriod: number = 24,
  isFreeEntry: boolean = false
): { additionalFee: number; midnightsPassed: number; additionalFeeCount: number } {
  const entry = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
  const entrySeoul = toZonedTime(entry, SEOUL_TIMEZONE);
  const currentSeoul = toZonedTime(currentTime, SEOUL_TIMEZONE);
  
  // 외국인: 입실 시각 기준 설정된 주기로 계산
  if (isForeigner) {
    // Validate and clamp foreignerAdditionalFeePeriod (must be >= 1)
    const validPeriod = Math.max(1, foreignerAdditionalFeePeriod);
    
    // 입실 시각부터 경과한 시간 (밀리초)
    const elapsedTime = currentSeoul.getTime() - entrySeoul.getTime();
    
    // 설정된 주기(시간)를 밀리초로 변환
    const periodInMillis = validPeriod * 60 * 60 * 1000;
    
    // 주기 단위로 넘긴 횟수
    const periodsElapsed = Math.max(0, Math.floor(elapsedTime / periodInMillis));
    
    // 추가요금 = 넘긴 주기 × 외국인요금
    const additionalFee = periodsElapsed * foreignerPrice;
    const additionalFeeCount = periodsElapsed;
    
    return {
      additionalFee,
      midnightsPassed: periodsElapsed, // 외국인은 자정 개념이 아니지만 호환성을 위해
      additionalFeeCount
    };
  }
  
  // 내국인: 체크포인트 계산
  // Validate and clamp domesticCheckpointHour (must be 0-23)
  const validCheckpointHour = Math.max(0, Math.min(23, domesticCheckpointHour));
  
  // 첫 체크포인트 계산
  const firstCheckpoint = new Date(entrySeoul);
  firstCheckpoint.setHours(validCheckpointHour, 0, 0, 0);
  firstCheckpoint.setMilliseconds(0);
  
  if (entryTimeType === '주간') {
    // 주간 입실: 실제 입실 날짜 + 1일의 01:00가 첫 체크포인트
    // 핵심: 영업일이 아닌 "실제 입실 날짜"를 기준으로 함
    // 예: 11/28 08:47 주간 입실 → 11/29 01:00 첫 체크포인트
    // 예: 11/27 14:00 주간 입실 → 11/28 01:00 첫 체크포인트
    const entryDate = entrySeoul.getDate();
    const entryMonth = entrySeoul.getMonth();
    const entryYear = entrySeoul.getFullYear();
    
    firstCheckpoint.setFullYear(entryYear, entryMonth, entryDate);
    firstCheckpoint.setDate(firstCheckpoint.getDate() + 1);
    firstCheckpoint.setHours(validCheckpointHour, 0, 0, 0);
  } else {
    // 야간 입실: 영업일 + 2일의 01:00가 첫 체크포인트
    // 영업일 기준으로 계산 (10:00 AM 이전 입실은 전날 영업일)
    // 예: 11/27 23:00 야간 입실(영업일 11/27) → 11/29 01:00 첫 체크포인트
    // 예: 11/28 02:00 야간 입실(영업일 11/27) → 11/29 01:00 첫 체크포인트
    const entryBusinessDay = getBusinessDay(entry);
    const [year, month, day] = entryBusinessDay.split('-').map(Number);
    
    firstCheckpoint.setFullYear(year, month - 1, day);
    firstCheckpoint.setDate(firstCheckpoint.getDate() + 2);
    firstCheckpoint.setHours(validCheckpointHour, 0, 0, 0);
  }
  
  // 현재 시간이 첫 체크포인트를 넘지 않았으면 추가요금 없음
  if (currentSeoul < firstCheckpoint) {
    return { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0 };
  }
  
  // 넘긴 체크포인트 횟수 계산
  const timeDiff = currentSeoul.getTime() - firstCheckpoint.getTime();
  const midnightsPassed = Math.floor(timeDiff / (24 * 60 * 60 * 1000)) + 1; // +1은 첫 체크포인트
  
  let additionalFee = 0;
  let additionalFeeCount = 0;
  
  if (entryTimeType === '주간') {
    // 무료입장 주간(07:00~16:59:59) 손님: 첫 체크포인트(익일 1시) 면제
    // - 24시간 내에는 추가요금 없음
    // - 24시간 경과 후(두 번째 체크포인트부터)는 야간요금 추가
    if (isFreeEntry) {
      // 무료입장: 첫 체크포인트 면제, 두 번째부터 야간요금
      if (midnightsPassed <= 1) {
        // 첫 체크포인트만 넘긴 경우 → 추가요금 없음
        additionalFee = 0;
        additionalFeeCount = 0;
      } else {
        // 두 번째 체크포인트부터 야간요금 추가
        additionalFee = (midnightsPassed - 1) * nightPrice;
        additionalFeeCount = midnightsPassed - 1;
      }
    } else {
      // 유료입장: 첫 체크포인트에 차액(야간-주간), 이후 체크포인트마다 야간요금
      additionalFee = (nightPrice - dayPrice); // 첫 01:00: 5,000원
      additionalFeeCount = midnightsPassed;
      
      // 두 번째 체크포인트부터 야간요금 추가
      if (midnightsPassed > 1) {
        additionalFee += (midnightsPassed - 1) * nightPrice;
      }
    }
  } else {
    // 야간 입실: 모든 체크포인트에 야간요금
    additionalFee = midnightsPassed * nightPrice;
    additionalFeeCount = midnightsPassed;
  }
  
  return {
    additionalFee,
    midnightsPassed,
    additionalFeeCount
  };
}

/**
 * 금액을 한국 원화 형식으로 포맷
 */
export function formatKoreanCurrency(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}
