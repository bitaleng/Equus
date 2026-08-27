/**
 * 비즈니스 데이 계산 유틸리티 (클라이언트/서버 공유)
 * 매출 집계는 오전 10시부터 다음날 오전 9시 59분 59초까지
 * Timezone: Asia/Seoul (KST) - 프로덕션 환경에서도 일관성 보장
 */

import { toZonedTime, format } from 'date-fns-tz';

const SEOUL_TIMEZONE = 'Asia/Seoul';

/**
 * 한국 공휴일 판정 (요일 조건 없음 — 순수 날짜 기준).
 * client/src/pages/Home.tsx의 isWeekendOrHoliday()에서 공휴일 판정 부분만 분리한 것.
 * 양력 고정 공휴일 + 음력 기반 공휴일(연도별 사전계산, 2024~2027)을 포함한다.
 * 알려진 제약: 음력 표가 2027년까지만 있어 이후 연도는 매년 수동 업데이트가 필요함.
 */
export function isKoreanHoliday(date: Date): boolean {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();

  // 양력 고정 공휴일
  const fixed: [number, number][] = [
    [1, 1],   // 신정
    [3, 1],   // 삼일절
    [5, 5],   // 어린이날
    [6, 6],   // 현충일
    [8, 15],  // 광복절
    [10, 3],  // 개천절
    [10, 9],  // 한글날
    [12, 25], // 크리스마스
  ];
  if (fixed.some(([hm, hd]) => hm === m && hd === d)) return true;

  // 음력 기반 공휴일 (연도별 사전계산)
  const lunar: Record<number, [number, number][]> = {
    2024: [[2,9],[2,10],[2,11],[2,12],[5,15],[9,16],[9,17],[9,18]],
    2025: [[1,28],[1,29],[1,30],[5,6],[10,5],[10,6],[10,7],[10,8]],
    2026: [[2,16],[2,17],[2,18],[2,19],[5,24],[10,1],[10,2],[10,3]],
    2027: [[2,6],[2,7],[2,8],[2,9],[5,13],[9,20],[9,21],[9,22],[9,23]],
  };
  const yearDates = lunar[y];
  if (yearDates && yearDates.some(([hm, hd]) => hm === m && hd === d)) return true;

  return false;
}

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

/** YYYY-MM-DD 영업일 문자열의 직전 영업일 (캘린더 하루 전) */
export function getPreviousBusinessDay(businessDay: string): string {
  const [year, month, day] = businessDay.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return formatDate(date);
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

/**
 * 외국인 요금 조회
 * - 주야간 동일: foreignerPrice
 * - 주야간 분리: 시간대별 foreignerDayPrice / foreignerNightPrice
 */
export function getForeignerPrice(
  timeType: '주간' | '야간',
  settings: {
    foreignerSeparateDayNight?: boolean;
    foreignerPrice?: number;
    foreignerDayPrice?: number;
    foreignerNightPrice?: number;
  } = {}
): number {
  const fallback = Number(settings.foreignerPrice) || 25000;
  if (settings.foreignerSeparateDayNight) {
    if (timeType === '주간') {
      return Number(settings.foreignerDayPrice) || fallback;
    }
    return Number(settings.foreignerNightPrice) || fallback;
  }
  return fallback;
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

export type DomesticAdditionalFeeMode =
  | 'nextday'
  | 'nightstart'
  | 'settlementCycle'
  | 'stagedHourly'
  | 'pending4'; // stagedHourly 별칭(하위호환)

/** 설정 화면 1~4번 추가요금 방식 번호 */
export function getDomesticAdditionalFeeModeNumber(
  mode: DomesticAdditionalFeeMode | string | undefined
): 1 | 2 | 3 | 4 {
  switch (mode) {
    case 'nightstart':
      return 2;
    case 'settlementCycle':
      return 3;
    case 'stagedHourly':
    case 'pending4':
      return 4;
    case 'nextday':
    default:
      return 1;
  }
}

/**
 * 모드 1~3: 야간요금 재지급 횟수(이용 일수 표시용).
 * 야간전환 차액(야간−주간)은 제외. 모드 4·외국인 주기는 null.
 */
export function countNightFeeStayDays(
  feeDetails: Array<{ label: string; amount: number }> | undefined,
  dayPrice: number,
  nightPrice: number,
  mode: DomesticAdditionalFeeMode | string | undefined
): number | null {
  const modeNum = getDomesticAdditionalFeeModeNumber(mode);
  if (modeNum === 4) return null;
  if (!feeDetails?.length) return 0;

  const surcharge = Math.max(0, nightPrice - dayPrice);

  return feeDetails.filter((d) => {
    if (d.label.includes('차액')) return false;
    // 모드3 1차: 기본값이 야간전환 차액 → 제외 (전액 야간요금인 경우만 포함)
    if (modeNum === 3 && /^1차/.test(d.label) && d.amount !== nightPrice) return false;
    // 금액이 차액과 같고 야간요금이 아니면 제외
    if (surcharge > 0 && d.amount === surcharge && d.amount !== nightPrice) return false;
    return (
      d.amount === nightPrice ||
      d.label.includes('야간요금') ||
      d.label === '정산전·야간전환'
    );
  }).length;
}

export type SettlementCycleOptions = {
  /** 정산시간 (영업일 시작 시) */
  businessDayStartHour?: number;
  /** 야간전환 후 N시간 (0=야간전환 직후) — 1차 추가요금 */
  firstDelayHours?: number;
  /** 정산시간 후 N시간 (0=정산 직후) — 2차 추가요금 */
  secondDelayHours?: number;
  /** 1차 금액 (기본: 야간-주간) */
  firstFeeAmount?: number;
  /** 2차 금액 (기본: 주간요금) */
  secondFeeAmount?: number;
};

/** 설정 객체에서 settlementCycle 옵션 추출 */
export function getSettlementCycleOptions(settings: {
  businessDayStartHour?: number;
  dayPrice?: number;
  nightPrice?: number;
  settlementCycleFirstDelayHours?: number;
  settlementCycleSecondDelayHours?: number;
  settlementCycleFirstFeeAmount?: number;
  settlementCycleSecondFeeAmount?: number;
}): SettlementCycleOptions {
  const dayPrice = settings.dayPrice ?? 10000;
  const nightPrice = settings.nightPrice ?? 15000;
  return {
    businessDayStartHour: settings.businessDayStartHour ?? 10,
    firstDelayHours: settings.settlementCycleFirstDelayHours ?? 0,
    secondDelayHours: settings.settlementCycleSecondDelayHours ?? 0,
    firstFeeAmount:
      settings.settlementCycleFirstFeeAmount ?? Math.max(0, nightPrice - dayPrice),
    secondFeeAmount: settings.settlementCycleSecondFeeAmount ?? dayPrice,
  };
}

export type StagedHourlyOptions = {
  businessDayStartHour?: number;
  /** 야간전환 후 N시간 — 1차 */
  firstDelayHours?: number;
  /** 1차 금액 (기본: 야간-주간) */
  firstFeeAmount?: number;
  /** 2차 ON/OFF */
  secondEnabled?: boolean;
  /** 2차 적용 시각 (0–23, 예: 0=자정) */
  secondApplyHour?: number;
  /** 2차 금액 */
  secondFeeAmount?: number;
  /**
   * 2차 부과 조건: 주간 입실이 야간전환보다 최소 이 시간(시) 이전이어야 함.
   * (야간 직전 입실·야간 입실은 2차 면제)
   */
  secondMinHoursBeforeNight?: number;
  /** 3차 적용 기준 시각 (0–23, 예: 12=정오). 다음 정산 이후 */
  thirdApplyHour?: number;
  /** 3차 식 (경과시간 + offset) * unitAmount 의 offset (기본 2) */
  thirdHourOffset?: number;
  /** 3차 식 단위금액 (기본 1000) */
  thirdUnitAmount?: number;
};

/** 설정 객체에서 stagedHourly 옵션 추출 */
export function getStagedHourlyOptions(settings: {
  businessDayStartHour?: number;
  dayPrice?: number;
  nightPrice?: number;
  stagedFirstDelayHours?: number;
  stagedFirstFeeAmount?: number;
  stagedSecondEnabled?: boolean;
  stagedSecondApplyHour?: number;
  stagedSecondFeeAmount?: number;
  stagedSecondMinHoursBeforeNight?: number;
  stagedThirdApplyHour?: number;
  stagedThirdHourOffset?: number;
  stagedThirdUnitAmount?: number;
}): StagedHourlyOptions {
  const dayPrice = settings.dayPrice ?? 10000;
  const nightPrice = settings.nightPrice ?? 15000;
  return {
    businessDayStartHour: settings.businessDayStartHour ?? 10,
    firstDelayHours: settings.stagedFirstDelayHours ?? 3,
    firstFeeAmount:
      settings.stagedFirstFeeAmount ?? Math.max(0, nightPrice - dayPrice),
    secondEnabled: settings.stagedSecondEnabled !== false,
    secondApplyHour: settings.stagedSecondApplyHour ?? 0,
    secondFeeAmount: settings.stagedSecondFeeAmount ?? dayPrice,
    secondMinHoursBeforeNight: Math.max(
      0,
      Number(settings.stagedSecondMinHoursBeforeNight ?? 6)
    ),
    thirdApplyHour: settings.stagedThirdApplyHour ?? 12,
    thirdHourOffset: settings.stagedThirdHourOffset ?? 2,
    thirdUnitAmount: settings.stagedThirdUnitAmount ?? 1000,
  };
}

/** 야간전환 체크포인트(모드2) 옵션 */
export type NightstartOptions = {
  /**
   * 주간 입실이 야간전환보다 최소 이 시간(시) 이전이면 1회차에 야간요금 전체 부과.
   * 미만이면 차액(야간−주간)만 부과. (기본 6)
   */
  fullNightMinHoursBeforeNight?: number;
};

/** 설정 객체에서 nightstart 옵션 추출 */
export function getNightstartOptions(settings: {
  nightstartFullNightMinHoursBeforeNight?: number;
}): NightstartOptions {
  return {
    fullNightMinHoursBeforeNight: Math.max(
      0,
      Number(settings.nightstartFullNightMinHoursBeforeNight ?? 6)
    ),
  };
}

export type AdditionalFeeDetail = { label: string; amount: number };

export type AdditionalFeeResult = {
  additionalFee: number;
  midnightsPassed: number;
  additionalFeeCount: number;
  feeDetails?: AdditionalFeeDetail[];
};

/**
 * 추가요금 계산 함수
 * 
 * 규칙 (내국인 - checkpointMode: 'nextday'):
 * 1. 주간 입실: 같은 영업일의 체크포인트(01:00)를 넘기면 추가요금(야간-주간 차액)
 *    - 이후 매 24시간(다음 01:00)마다 야간요금 추가
 * 2. 야간 입실: 다음 영업일의 체크포인트(01:00)를 넘기면 추가요금(야간요금)
 *    - 이후 매 24시간(다음 01:00)마다 야간요금 추가
 * 
 * 규칙 (내국인 - checkpointMode: 'nightstart'):
 * 1. 주간 입실: 당일 야간시작시각(nightStartHour)이 첫 체크포인트
 *    - 입실이 야간전환보다 최소 N시간 이전 → 야간요금 전체
 *    - 그렇지 않으면(야간 직전 입실) → 차액(야간−주간)
 *    - 이후 매 24시간(다음날 동일 시각)마다 야간요금 추가
 * 2. 야간 입실: 다음날 야간시작시각(nightStartHour)이 첫 체크포인트 → 야간요금 추가
 *    - 이후 매 24시간마다 야간요금 추가
 *
 * 규칙 (내국인 - checkpointMode: 'settlementCycle'):
 * - 정산시간 이후 입실(같은 영업일 주간): 야간전환+N → 1차(차액), 정산+N → 2차(주간요금), 이후 1·2차 무한 반복
 * - 야간 입실: 정산+N의 2차부터 시작 후 1·2차 반복
 * - 정산시간 이전 주간 입실(다른 영업일): 야간전환까지 무료 → 야간전환 시 야간요금 1회 → 다음 정산부터 위와 동일
 *
 * 규칙 (내국인 - checkpointMode: 'stagedHourly'):
 * - 1차: 야간전환+N → firstFeeAmount
 * - 2차(옵션): 지정 시각(예: 자정) → secondFeeAmount
 *   · 주간 입실이면서, 입실이 야간전환보다 최소 M시간 이전인 경우에만 부과
 *   · 야간 입실·야간 직전(M시간 미만) 주간 입실은 2차 면제
 * - 3차: 다음 정산 이후 지정 시각부터 (경과시간+offset)*unitAmount 매시간
 * - **3차가 시작된 이후에는 1·2차를 합산하지 않고 3차만 적용** (퇴실·재입실 전까지)
 * - 정산 전 주간 입실: 야간전환까지 무료 → 야간요금 1회 → 다음 정산부터 위와 동일
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
 * @param domesticCheckpointHour 내국인 추가요금 체크포인트 시간 (기본값: 1, nextday 모드에서만 사용)
 * @param foreignerAdditionalFeePeriod 외국인 추가요금 주기(시간) (기본값: 24)
 * @param isFreeEntry 무료입장 여부 (기본값: false)
 * @param checkpointMode 추가요금 부과 기준 (4가지 중 택1)
 * @param nightStartHour 야간 시작 시 (기본값: 19)
 * @param settlementCycle settlementCycle 모드 전용 옵션
 * @param stagedHourly stagedHourly 모드 전용 옵션
 * @param nightstartOpts nightstart 모드 전용 옵션
 * @returns { additionalFee: 추가요금, midnightsPassed: 넘긴 체크포인트 횟수, additionalFeeCount: 추가요금 횟수, feeDetails: 내역 }
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
  isFreeEntry: boolean = false,
  checkpointMode: DomesticAdditionalFeeMode = 'nextday',
  nightStartHour: number = 19,
  settlementCycle?: SettlementCycleOptions,
  stagedHourly?: StagedHourlyOptions,
  nightstartOpts?: NightstartOptions
): AdditionalFeeResult {
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
    const feeDetails: AdditionalFeeDetail[] = [];
    for (let i = 1; i <= periodsElapsed; i++) {
      feeDetails.push({
        label: `${i}주기(${validPeriod}h)`,
        amount: foreignerPrice,
      });
    }
    
    return {
      additionalFee,
      midnightsPassed: periodsElapsed, // 외국인은 자정 개념이 아니지만 호환성을 위해
      additionalFeeCount: periodsElapsed,
      feeDetails,
    };
  }

  // 단계별(1·2·3차) 모드 — pending4는 하위호환 별칭
  if (checkpointMode === 'stagedHourly' || checkpointMode === 'pending4') {
    return calculateStagedHourlyAdditionalFee(
      entrySeoul,
      currentSeoul,
      entryTimeType,
      dayPrice,
      nightPrice,
      nightStartHour,
      isFreeEntry,
      stagedHourly
    );
  }

  // 정산·야간 순환 모드
  if (checkpointMode === 'settlementCycle') {
    return calculateSettlementCycleAdditionalFee(
      entrySeoul,
      currentSeoul,
      entryTimeType,
      dayPrice,
      nightPrice,
      nightStartHour,
      isFreeEntry,
      settlementCycle
    );
  }
  
  // 내국인: 'nightstart' 모드 — 야간시작시각을 체크포인트로 사용
  if (checkpointMode === 'nightstart') {
    const validNightStartHour = Math.max(0, Math.min(23, nightStartHour));
    const entryHour = entrySeoul.getHours();

    // 첫 체크포인트: 입실 시각 이후 첫 nightStartHour 발생 시각
    const firstCheckpointNS = new Date(entrySeoul);
    firstCheckpointNS.setHours(validNightStartHour, 0, 0, 0);
    firstCheckpointNS.setMilliseconds(0);
    if (entryHour >= validNightStartHour) {
      firstCheckpointNS.setDate(firstCheckpointNS.getDate() + 1);
    }

    if (currentSeoul < firstCheckpointNS) {
      return { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0, feeDetails: [] };
    }

    const timeDiffNS = currentSeoul.getTime() - firstCheckpointNS.getTime();
    const checkpointsPassed = Math.floor(timeDiffNS / (24 * 60 * 60 * 1000)) + 1;

    const feeDetails: AdditionalFeeDetail[] = [];
    let additionalFeeNS = 0;

    if (entryTimeType === '주간') {
      if (isFreeEntry) {
        // 무료입장: 첫 체크포인트 면제, 두 번째부터 야간요금
        for (let i = 2; i <= checkpointsPassed; i++) {
          feeDetails.push({
            label: `${i}회차(야간시작 ${validNightStartHour}시·야간요금)`,
            amount: nightPrice,
          });
          additionalFeeNS += nightPrice;
        }
      } else {
        // 유료 주간: 야간전환 N시간 이전 입실 → 야간요금 전체, 아니면 차액
        const hoursBeforeNight =
          (firstCheckpointNS.getTime() - entrySeoul.getTime()) / (60 * 60 * 1000);
        const minHoursBeforeNight = Math.max(
          0,
          Number(nightstartOpts?.fullNightMinHoursBeforeNight ?? 6)
        );
        const chargeFullNight = hoursBeforeNight >= minHoursBeforeNight;
        const firstAmount = chargeFullNight
          ? nightPrice
          : Math.max(0, nightPrice - dayPrice);
        feeDetails.push({
          label: chargeFullNight
            ? `1회차(야간시작 ${validNightStartHour}시·야간요금)`
            : `1회차(야간시작 ${validNightStartHour}시·차액)`,
          amount: firstAmount,
        });
        additionalFeeNS += firstAmount;
        for (let i = 2; i <= checkpointsPassed; i++) {
          feeDetails.push({
            label: `${i}회차(야간시작 ${validNightStartHour}시·야간요금)`,
            amount: nightPrice,
          });
          additionalFeeNS += nightPrice;
        }
      }
    } else {
      // 야간 입실: 모든 체크포인트에 야간요금
      for (let i = 1; i <= checkpointsPassed; i++) {
        feeDetails.push({
          label: `${i}회차(야간시작 ${validNightStartHour}시·야간요금)`,
          amount: nightPrice,
        });
        additionalFeeNS += nightPrice;
      }
    }

    return {
      additionalFee: additionalFeeNS,
      midnightsPassed: checkpointsPassed,
      additionalFeeCount: feeDetails.length,
      feeDetails,
    };
  }

  // 내국인: 'nextday' 모드 (기존 로직) — 다음날 고정 시각을 체크포인트로 사용
  const validCheckpointHour = Math.max(0, Math.min(23, domesticCheckpointHour));
  
  // 첫 체크포인트 계산
  const firstCheckpoint = new Date(entrySeoul);
  firstCheckpoint.setHours(validCheckpointHour, 0, 0, 0);
  firstCheckpoint.setMilliseconds(0);
  
  if (entryTimeType === '주간') {
    // 주간 입실: 실제 입실 날짜 + 1일의 checkpointHour가 첫 체크포인트
    const entryDate = entrySeoul.getDate();
    const entryMonth = entrySeoul.getMonth();
    const entryYear = entrySeoul.getFullYear();
    
    firstCheckpoint.setFullYear(entryYear, entryMonth, entryDate);
    firstCheckpoint.setDate(firstCheckpoint.getDate() + 1);
    firstCheckpoint.setHours(validCheckpointHour, 0, 0, 0);
  } else {
    // 야간 입실: 영업일 + 2일의 checkpointHour가 첫 체크포인트
    const entryBusinessDay = getBusinessDay(entry);
    const [year, month, day] = entryBusinessDay.split('-').map(Number);
    
    firstCheckpoint.setFullYear(year, month - 1, day);
    firstCheckpoint.setDate(firstCheckpoint.getDate() + 2);
    firstCheckpoint.setHours(validCheckpointHour, 0, 0, 0);
  }
  
  // 현재 시간이 첫 체크포인트를 넘지 않았으면 추가요금 없음
  if (currentSeoul < firstCheckpoint) {
    return { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0, feeDetails: [] };
  }
  
  // 넘긴 체크포인트 횟수 계산
  const timeDiff = currentSeoul.getTime() - firstCheckpoint.getTime();
  const midnightsPassed = Math.floor(timeDiff / (24 * 60 * 60 * 1000)) + 1; // +1은 첫 체크포인트
  
  const feeDetails: AdditionalFeeDetail[] = [];
  let additionalFee = 0;
  
  if (entryTimeType === '주간') {
    if (isFreeEntry) {
      // 무료입장: 첫 체크포인트 면제, 두 번째부터 야간요금
      for (let i = 2; i <= midnightsPassed; i++) {
        feeDetails.push({
          label: `${i}회차(익일 ${validCheckpointHour}시·야간요금)`,
          amount: nightPrice,
        });
        additionalFee += nightPrice;
      }
    } else {
      // 유료입장: 첫 체크포인트에 차액(야간-주간), 이후 체크포인트마다 야간요금
      const firstDiff = Math.max(0, nightPrice - dayPrice);
      feeDetails.push({
        label: `1회차(익일 ${validCheckpointHour}시·차액)`,
        amount: firstDiff,
      });
      additionalFee += firstDiff;
      for (let i = 2; i <= midnightsPassed; i++) {
        feeDetails.push({
          label: `${i}회차(익일 ${validCheckpointHour}시·야간요금)`,
          amount: nightPrice,
        });
        additionalFee += nightPrice;
      }
    }
  } else {
    // 야간 입실: 모든 체크포인트에 야간요금
    for (let i = 1; i <= midnightsPassed; i++) {
      feeDetails.push({
        label: `${i}회차(익일 ${validCheckpointHour}시·야간요금)`,
        amount: nightPrice,
      });
      additionalFee += nightPrice;
    }
  }
  
  return {
    additionalFee,
    midnightsPassed,
    additionalFeeCount: feeDetails.length,
    feeDetails,
  };
}

function atHourOnDay(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(Math.max(0, Math.min(23, hour)), 0, 0, 0);
  d.setMilliseconds(0);
  return d;
}

/** base 시각 이후(초과) 가장 빠른 해당 시각. 같은 시각이면 다음날 */
function nextAtOrAfterExclusive(after: Date, hour: number): Date {
  const sameDay = atHourOnDay(after, hour);
  if (sameDay.getTime() > after.getTime()) return sameDay;
  const next = atHourOnDay(after, hour);
  next.setDate(next.getDate() + 1);
  return next;
}

function addHoursToDate(base: Date, hours: number): Date {
  return new Date(base.getTime() + Math.max(0, hours) * 60 * 60 * 1000);
}

/**
 * 정산·야간 순환 추가요금
 * 1차: 야간전환+N → firstFeeAmount (기본 야간-주간)
 * 2차: 정산+N → secondFeeAmount (기본 주간요금)
 * 정산 전 주간 입실(다른 영업일): 야간전환까지 무료 → 야간요금 1회 → 이후 순환
 */
function calculateSettlementCycleAdditionalFee(
  entrySeoul: Date,
  currentSeoul: Date,
  entryTimeType: '주간' | '야간',
  dayPrice: number,
  nightPrice: number,
  nightStartHour: number,
  isFreeEntry: boolean,
  options?: SettlementCycleOptions
): AdditionalFeeResult {
  if (currentSeoul.getTime() <= entrySeoul.getTime()) {
    return { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0, feeDetails: [] };
  }

  const settlementHour = Math.max(0, Math.min(23, options?.businessDayStartHour ?? 10));
  const nightHour = Math.max(0, Math.min(23, nightStartHour));
  const firstDelay = Math.max(0, options?.firstDelayHours ?? 0);
  const secondDelay = Math.max(0, options?.secondDelayHours ?? 0);
  const firstFee = Math.max(
    0,
    options?.firstFeeAmount ?? Math.max(0, nightPrice - dayPrice)
  );
  const secondFee = Math.max(0, options?.secondFeeAmount ?? dayPrice);

  type FeeEvent = { time: Date; amount: number; label: string };
  const events: FeeEvent[] = [];

  const entryHour = entrySeoul.getHours() + entrySeoul.getMinutes() / 60;
  // 정산시간 이전 주간 입실 → 다른 영업일 소속(새벽~정산 전 주간)
  const isPreSettlementDayGuest =
    entryTimeType === '주간' && entryHour < settlementHour;
  const isNightGuest = entryTimeType === '야간';

  let cycleAnchor: Date;
  /** 다음 이벤트가 2차(정산)인지 — true면 정산/2차부터 */
  let nextIsSecond: boolean;

  if (isPreSettlementDayGuest) {
    // 야간전환까지 무료 → 야간전환(+delay)에 야간요금 1회 → 다음 정산부터 순환(2차부터)
    const firstNight = addHoursToDate(
      nextAtOrAfterExclusive(entrySeoul, nightHour),
      firstDelay
    );
    if (firstNight.getTime() <= currentSeoul.getTime()) {
      events.push({ time: firstNight, amount: nightPrice, label: '정산전·야간전환' });
    }
    cycleAnchor = firstNight;
    nextIsSecond = true;
  } else if (isNightGuest) {
    cycleAnchor = entrySeoul;
    nextIsSecond = true; // 2차(정산)부터
  } else {
    cycleAnchor = entrySeoul;
    nextIsSecond = false; // 1차(야간)부터
  }

  // 최대 2년치 이벤트 생성 (무한 루프 방지)
  const hardLimit = addHoursToDate(entrySeoul, 24 * 800);
  let cycleRound = 0;
  for (let i = 0; i < 800; i++) {
    let eventTime: Date;
    let amount: number;
    let label: string;
    if (nextIsSecond) {
      eventTime = addHoursToDate(
        nextAtOrAfterExclusive(cycleAnchor, settlementHour),
        secondDelay
      );
      amount = secondFee;
      cycleRound += 1;
      label = `2차#${cycleRound}(정산+${secondDelay}h)`;
    } else {
      eventTime = addHoursToDate(
        nextAtOrAfterExclusive(cycleAnchor, nightHour),
        firstDelay
      );
      amount = firstFee;
      label = `1차#${cycleRound + 1}(야간+${firstDelay}h)`;
    }

    if (eventTime.getTime() > hardLimit.getTime()) break;
    if (eventTime.getTime() > currentSeoul.getTime()) break;
    // 입실 시각 이하 이벤트는 무시
    if (eventTime.getTime() > entrySeoul.getTime()) {
      events.push({ time: eventTime, amount, label });
    }
    cycleAnchor = eventTime;
    nextIsSecond = !nextIsSecond;
  }

  // 무료입장: 첫 과금 1회 면제
  let applicable = events;
  if (isFreeEntry && applicable.length > 0) {
    applicable = applicable.slice(1);
  }

  const additionalFee = applicable.reduce((sum, e) => sum + e.amount, 0);
  const additionalFeeCount = applicable.length;
  const feeDetails = applicable.map((e) => ({ label: e.label, amount: e.amount }));

  return {
    additionalFee,
    midnightsPassed: additionalFeeCount,
    additionalFeeCount,
    feeDetails,
  };
}

/**
 * 단계별 추가요금 (1차 야간+N / 2차 지정시각 / 3차 정산 후 시간당 식)
 * 3차 총액 = (경과시간 + offset) * unitAmount  (예: offset=2, unit=1000 → 기준시각에 2000원)
 */
function calculateStagedHourlyAdditionalFee(
  entrySeoul: Date,
  currentSeoul: Date,
  entryTimeType: '주간' | '야간',
  dayPrice: number,
  nightPrice: number,
  nightStartHour: number,
  isFreeEntry: boolean,
  options?: StagedHourlyOptions
): AdditionalFeeResult {
  if (currentSeoul.getTime() <= entrySeoul.getTime()) {
    return { additionalFee: 0, midnightsPassed: 0, additionalFeeCount: 0, feeDetails: [] };
  }

  const settlementHour = Math.max(0, Math.min(23, Number(options?.businessDayStartHour ?? 10)));
  const nightHour = Math.max(0, Math.min(23, nightStartHour));
  const firstDelay = Math.max(0, Number(options?.firstDelayHours ?? 3));
  const firstFee = Math.max(
    0,
    Number(options?.firstFeeAmount ?? Math.max(0, nightPrice - dayPrice))
  );
  const secondEnabled = options?.secondEnabled !== false;
  const secondHour = Math.max(0, Math.min(23, Number(options?.secondApplyHour ?? 0)));
  const secondFee = Math.max(0, Number(options?.secondFeeAmount ?? dayPrice));
  const secondMinHoursBeforeNight = Math.max(
    0,
    Number(options?.secondMinHoursBeforeNight ?? 6)
  );
  const thirdHour = Math.max(0, Math.min(23, Number(options?.thirdApplyHour ?? 12)));
  const thirdOffset = Math.max(0, Number(options?.thirdHourOffset ?? 2));
  const thirdUnit = Math.max(0, Number(options?.thirdUnitAmount ?? 1000));

  type FeeEvent = { time: Date; amount: number; label: string };
  const events: FeeEvent[] = [];

  const entryHour = entrySeoul.getHours() + entrySeoul.getMinutes() / 60;
  const isPreSettlementDayGuest =
    entryTimeType === '주간' && entryHour < settlementHour;

  let pipelineStart: Date;

  if (isPreSettlementDayGuest) {
    // 야간전환까지 무료 → 야간전환 시 야간요금 → 다음 정산부터 1·2·3차 파이프라인
    const checkoutNight = nextAtOrAfterExclusive(entrySeoul, nightHour);
    if (
      checkoutNight.getTime() > entrySeoul.getTime() &&
      checkoutNight.getTime() <= currentSeoul.getTime()
    ) {
      events.push({ time: checkoutNight, amount: nightPrice, label: '정산전·야간전환' });
    }
    pipelineStart = nextAtOrAfterExclusive(checkoutNight, settlementHour);
  } else {
    pipelineStart = entrySeoul;
  }

  const pipelineActive =
    !isPreSettlementDayGuest || currentSeoul.getTime() >= pipelineStart.getTime();

  if (pipelineActive) {
    // 3차 시작 시각을 먼저 계산 — 3차 도달 후에는 1·2차와 중복 합산하지 않음
    const settlementForThird = nextAtOrAfterExclusive(pipelineStart, settlementHour);
    let thirdStart = atHourOnDay(settlementForThird, thirdHour);
    if (thirdStart.getTime() < settlementForThird.getTime()) {
      thirdStart = atHourOnDay(settlementForThird, thirdHour);
      thirdStart.setDate(thirdStart.getDate() + 1);
    }
    const thirdReached =
      thirdStart.getTime() > entrySeoul.getTime() &&
      thirdStart.getTime() <= currentSeoul.getTime() &&
      thirdUnit > 0;

    if (thirdReached) {
      // 3차만: (경과시간(시, 내림) + offset) * unit — 퇴실 전까지 3차만 누적
      const hoursElapsed = Math.max(
        0,
        Math.floor(
          (currentSeoul.getTime() - thirdStart.getTime()) / (60 * 60 * 1000)
        )
      );
      const thirdTotal = (hoursElapsed + thirdOffset) * thirdUnit;
      if (thirdTotal > 0) {
        events.push({
          time: thirdStart,
          amount: thirdTotal,
          label: `3차(${hoursElapsed}+${thirdOffset})×${thirdUnit.toLocaleString()}`,
        });
      }
    } else {
      // 3차 이전: 1차·2차만 적용
      const firstAt = addHoursToDate(
        nextAtOrAfterExclusive(pipelineStart, nightHour),
        firstDelay
      );
      const firstApplied =
        firstAt.getTime() > entrySeoul.getTime() &&
        firstAt.getTime() <= currentSeoul.getTime();
      if (firstApplied && firstFee > 0) {
        events.push({ time: firstAt, amount: firstFee, label: `1차(야간+${firstDelay}h)` });
      }

      if (secondEnabled && secondFee > 0) {
        // 2차: 주간 입실 + 야간전환보다 최소 N시간 이전 입실인 경우만
        const nightTransitionAfterEntry = nextAtOrAfterExclusive(entrySeoul, nightHour);
        const hoursBeforeNight =
          (nightTransitionAfterEntry.getTime() - entrySeoul.getTime()) / (60 * 60 * 1000);
        const qualifiesForSecond =
          entryTimeType === '주간' &&
          hoursBeforeNight >= secondMinHoursBeforeNight;

        if (qualifiesForSecond) {
          let secondAt = nextAtOrAfterExclusive(pipelineStart, secondHour);
          if (secondAt.getTime() < firstAt.getTime()) {
            secondAt = nextAtOrAfterExclusive(firstAt, secondHour);
          }
          if (
            secondAt.getTime() > entrySeoul.getTime() &&
            secondAt.getTime() <= currentSeoul.getTime()
          ) {
            events.push({
              time: secondAt,
              amount: secondFee,
              label: `2차(${secondHour}시)`,
            });
          }
        }
      }
    }
  }

  let applicable = events;
  if (isFreeEntry && applicable.length > 0) {
    applicable = applicable.slice(1);
  }
  applicable = [...applicable].sort((a, b) => a.time.getTime() - b.time.getTime());

  const additionalFee = applicable.reduce((sum, e) => sum + e.amount, 0);
  const additionalFeeCount = applicable.length;
  const feeDetails = applicable.map((e) => ({ label: e.label, amount: e.amount }));

  return {
    additionalFee,
    midnightsPassed: additionalFeeCount,
    additionalFeeCount,
    feeDetails,
  };
}

/**
 * 금액을 한국 원화 형식으로 포맷
 */
export function formatKoreanCurrency(amount: number): string {
  return `₩${amount.toLocaleString()}`;
}
