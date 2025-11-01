/**
 * 비즈니스 데이 계산 유틸리티 (서버 전용 - 확장 기능)
 * 기본 기능은 shared/businessDay.ts에서 가져옴
 */

import { getBusinessDay as sharedGetBusinessDay } from "@shared/businessDay";
import { toZonedTime } from 'date-fns-tz';

const SEOUL_TIMEZONE = 'Asia/Seoul';

/**
 * 주어진 시간이 속한 비즈니스 데이를 계산
 */
export const getBusinessDay = sharedGetBusinessDay;

/**
 * 비즈니스 데이의 시작 시간 (오전 10시, KST 기준)
 */
export function getBusinessDayStart(businessDay: string): Date {
  const baseDate = new Date(businessDay + 'T10:00:00+09:00');
  return baseDate;
}

/**
 * 비즈니스 데이의 종료 시간 (다음날 오전 9시 59분 59초, KST 기준)
 */
export function getBusinessDayEnd(businessDay: string): Date {
  const date = new Date(businessDay);
  date.setDate(date.getDate() + 1);
  const endDate = new Date(date.toISOString().split('T')[0] + 'T09:59:59+09:00');
  return endDate;
}

export { getTimeType, getBasePrice, calculateFinalPrice } from "@shared/businessDay";
