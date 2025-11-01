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
export function getBusinessDay(date: Date = new Date()): string {
  // 서울 시간대로 변환
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const hour = seoulDate.getHours();
  
  if (hour < 10) {
    const yesterday = new Date(seoulDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }
  
  return formatDate(seoulDate);
}

/**
 * 현재 시간대가 주간인지 야간인지 판단 (KST 기준)
 */
export function getTimeType(date: Date = new Date()): '주간' | '야간' {
  const seoulDate = toZonedTime(date, SEOUL_TIMEZONE);
  const hour = seoulDate.getHours();
  return (hour >= 7 && hour < 19) ? '주간' : '야간';
}

export function getBasePrice(timeType: '주간' | '야간'): number {
  return timeType === '주간' ? 10000 : 13000;
}

function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd', { timeZone: SEOUL_TIMEZONE });
}

export function calculateFinalPrice(
  basePrice: number,
  optionType: 'none' | 'discount' | 'custom' | 'foreigner',
  optionAmount?: number
): number {
  if (optionType === 'foreigner') return 25000;
  if (optionType === 'discount') return basePrice - 2000;
  if (optionType === 'custom' && optionAmount) return basePrice - optionAmount;
  return basePrice;
}
