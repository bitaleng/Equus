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
 * 특정 비즈니스 데이의 시작/종료 시간을 반환 (KST 기준)
 * 
 * @param date 기준 날짜 (기본값: 현재)
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 * @returns { start: 비즈니스 데이 시작 시각, end: 비즈니스 데이 종료 시각, businessDay: YYYY-MM-DD 문자열 }
 * 
 * @example
 * // 2025-11-06 14:00에 호출하면 (businessDayStartHour = 10)
 * // start: 2025-11-06 10:00:00
 * // end: 2025-11-07 09:59:59
 * // businessDay: '2025-11-06'
 */
export function getBusinessDayRange(
  date: Date = new Date(), 
  businessDayStartHour: number = 10
): { start: Date; end: Date; businessDay: string } {
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const businessDay = getBusinessDay(seoulDate, businessDayStartHour);
  
  // 비즈니스 데이 시작: businessDay 날짜의 startHour시
  const start = new Date(`${businessDay}T${String(businessDayStartHour).padStart(2, '0')}:00:00`);
  const startSeoul = toZonedTime(start, SEOUL_TIMEZONE);
  
  // 비즈니스 데이 종료: 다음날 startHour시 - 1초
  const end = new Date(startSeoul);
  end.setDate(end.getDate() + 1);
  end.setSeconds(end.getSeconds() - 1);
  
  return {
    start: startSeoul,
    end,
    businessDay
  };
}

/**
 * 현재 시간대가 주간인지 야간인지 판단 (KST 기준)
 */
export function getTimeType(date: Date = new Date()): '주간' | '야간' {
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const hour = seoulDate.getHours();
  return (hour >= 7 && hour < 19) ? '주간' : '야간';
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
 * 1. 주간 입실 (07:00-18:59): 첫 자정에 5,000원, 두 번째 자정부터 15,000원
 * 2. 야간 입실 >= 19:00: 첫 자정 무료, 두 번째 자정부터 15,000원
 * 3. 야간 입실 < 07:00: 첫 자정부터 15,000원
 * 
 * 규칙 (외국인):
 * - 입실 시각 기준 24시간마다 외국인요금(foreignerPrice) 추가
 * 
 * @param entryTime 입실 시간
 * @param entryTimeType 입실 시간대 (주간/야간)
 * @param dayPrice 주간 요금
 * @param nightPrice 야간 요금
 * @param currentTime 현재 시간 (기본값: 현재)
 * @param isForeigner 외국인 여부 (기본값: false)
 * @param foreignerPrice 외국인 요금 (기본값: 25000)
 * @returns { additionalFee: 추가요금, midnightsPassed: 넘긴 자정 횟수, additionalFeeCount: 추가요금 횟수 }
 */
export function calculateAdditionalFee(
  entryTime: Date | string,
  entryTimeType: '주간' | '야간',
  dayPrice: number = 10000,
  nightPrice: number = 15000,
  currentTime: Date = new Date(),
  isForeigner: boolean = false,
  foreignerPrice: number = 25000
): { additionalFee: number; midnightsPassed: number; additionalFeeCount: number } {
  const entry = typeof entryTime === 'string' ? new Date(entryTime) : entryTime;
  const entrySeoul = toZonedTime(entry, SEOUL_TIMEZONE);
  const currentSeoul = toZonedTime(currentTime, SEOUL_TIMEZONE);
  
  // 외국인: 입실 시각 기준 24시간 간격으로 계산
  if (isForeigner) {
    // 입실 시각부터 경과한 시간 (밀리초)
    const elapsedTime = currentSeoul.getTime() - entrySeoul.getTime();
    
    // 24시간 = 24 * 60 * 60 * 1000 = 86,400,000 밀리초
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    // 24시간 단위로 넘긴 횟수
    const periodsElapsed = Math.floor(elapsedTime / twentyFourHours);
    
    // 추가요금 = 넘긴 24시간 단위 × 외국인요금
    const additionalFee = periodsElapsed * foreignerPrice;
    const additionalFeeCount = periodsElapsed;
    
    return {
      additionalFee,
      midnightsPassed: periodsElapsed, // 외국인은 자정 개념이 아니지만 호환성을 위해
      additionalFeeCount
    };
  }
  
  // 내국인: 자정 기준 계산
  const entryHour = entrySeoul.getHours();
  
  // 입실일의 자정 (다음날 00:00)
  const firstMidnight = new Date(entrySeoul);
  firstMidnight.setDate(firstMidnight.getDate() + 1);
  firstMidnight.setHours(0, 0, 0, 0);
  
  // 현재 시간이 첫 자정을 넘지 않았으면 추가요금 없음
  if (currentSeoul < firstMidnight) {
    return { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0 };
  }
  
  // 넘긴 자정 횟수 계산
  const timeDiff = currentSeoul.getTime() - firstMidnight.getTime();
  const midnightsPassed = Math.floor(timeDiff / (24 * 60 * 60 * 1000)) + 1; // +1은 첫 자정
  
  let additionalFee = 0;
  let additionalFeeCount = 0; // 추가요금 발생 횟수
  
  // 케이스 분류:
  // 1. 주간 입실 (07:00-18:59): 첫 자정에 차액(5,000원)
  if (entryTimeType === '주간') {
    additionalFee = (nightPrice - dayPrice); // 첫 자정: 5,000원
    additionalFeeCount = midnightsPassed; // 주간 입실은 모든 자정이 추가요금
    
    // 두 번째 자정부터 야간요금 추가
    if (midnightsPassed > 1) {
      additionalFee += (midnightsPassed - 1) * nightPrice;
    }
  }
  // 2. 야간 입실 >= 19:00: 첫 자정 무료, 두 번째 자정부터 야간요금
  else if (entryHour >= 19) {
    // 첫 자정(내일 00:00)까지는 무료
    if (midnightsPassed === 1) {
      additionalFee = 0;
      additionalFeeCount = 0;
    }
    // 두 번째 자정부터 야간요금
    else if (midnightsPassed > 1) {
      additionalFee = (midnightsPassed - 1) * nightPrice;
      additionalFeeCount = midnightsPassed - 1; // 첫 자정 제외
    }
  }
  // 3. 야간 입실 < 07:00: 첫 자정(오늘 00:00)부터 야간요금
  else {
    // 새벽에 입실한 경우 첫 자정부터 야간요금
    additionalFee = midnightsPassed * nightPrice;
    additionalFeeCount = midnightsPassed; // 모든 자정이 추가요금
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
