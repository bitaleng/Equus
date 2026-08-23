import { db, allowDatabaseShrink, saveDatabase } from './core';
import { getTimeType } from '@shared/businessDay';


// Settings operations (using localStorage)
export function getSettings() {
  const baseDefaults = {
    businessDayStartHour: 10,
    dayPrice: 10000,
    nightPrice: 15000,
    discountAmount: 2000,
    foreignerPrice: 25000,
    foreignerSeparateDayNight: false,
    foreignerDayPrice: 25000,
    foreignerNightPrice: 25000,
    domesticCheckpointHour: 1,
    foreignerAdditionalFeePeriod: 24,
    domesticAdditionalFeeMode: 'nextday' as 'nextday' | 'nightstart' | 'settlementCycle' | 'stagedHourly' | 'pending4',
    nightstartFullNightMinHoursBeforeNight: 6,
    settlementCycleFirstDelayHours: 0,
    settlementCycleSecondDelayHours: 0,
    settlementCycleFirstFeeAmount: undefined as number | undefined,
    settlementCycleSecondFeeAmount: undefined as number | undefined,
    stagedFirstDelayHours: 3,
    stagedFirstFeeAmount: undefined as number | undefined,
    stagedSecondEnabled: true,
    stagedSecondApplyHour: 0,
    stagedSecondFeeAmount: undefined as number | undefined,
    stagedSecondMinHoursBeforeNight: 6,
    stagedThirdApplyHour: 12,
    stagedThirdHourOffset: 2,
    stagedThirdUnitAmount: 1000,
    screenWakeLock: true,
    cardPaymentAppEnabled: false,
    cardPaymentAppPackage: 'com.tossplace.app.release',
    dayStartTime: '07:00',
    nightStartTime: '19:00',
    enableDiscountOption: true,
    enableForeignerOption: true,
    enableDirectPriceOption: true,
    enableStaffOption: true,
    enableFreeEntryOption: true,
    enableLongTermOption: true,
    enableCashReceiptVat: false,
    enableCardVat: false,
    outingTimeLimitMinutes: 0,
    outingTimeLimitWeekendMinutes: 0,
    /** 락카 옵션창 스택 기본값: true면 접기(마지막 선택만 펼침), false면 모두 펼침 */
    lockerStackDefaultCollapsed: false,
    /** 락카옵션창(처리중인 고객 패널) 배경 스타일: glass=모노유리(블러·투명도), basic=불투명 단색 */
    lockerWorkspaceStyle: 'glass' as 'glass' | 'basic',
    /** 자동 아카이브: 오늘 달 포함 N개월만 남기고 이전은 폴더에 백업 후 삭제 */
    autoArchiveEnabled: false,
    autoArchiveKeepMonths: 2,
    cctvAlwaysOn: false,
    cctvRemoteEnabled: true,
    cctvNotifyUrl: "https://discordapp.com/api/webhooks/1526625354842771619/9UTDKPU0tIR5gpjJYcUm4Cmb4-Ufi5yKg6nuQy6FseJNbIJdxFenrNdquotTuGUT8DLN",
    cctvNotifyOnStart: true,
    cctvFacingMode: "user" as "user" | "environment",
  };

  // 매장별 기본값 차이는 이제 서버가 라이선스 활성화 시 내려주는 프로필(settingsOverrides)로
  // 대체된다 — client/src/lib/storeProfile.ts의 seedSettingsFromProfileIfNeeded()가 최초 활성화
  // 시점에 localStorage['settings']에 한 번만 병합해두므로, 여기서는 공통 기본값만 쓰면 된다.
  const defaultSettings = baseDefaults;

  const saved = localStorage.getItem('settings');
  if (!saved) return defaultSettings;

  try {
    return { ...defaultSettings, ...JSON.parse(saved) };
  } catch {
    return defaultSettings;
  }
}

export function updateSettings(settings: any) {
  const current = getSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem('settings', JSON.stringify(updated));
}

// Helper: getTimeType with settings (주간/야간 시작 시간 설정 적용)
export function getTimeTypeWithSettings(date: Date = new Date()): '주간' | '야간' {
  const settings = getSettings();
  const { dayStartTime = '07:00', nightStartTime = '19:00' } = settings;
  return getTimeType(date, dayStartTime, nightStartTime);
}

// Data management operations
export function clearAllData() {
  if (!db) throw new Error('Database not initialized');
  allowDatabaseShrink();
  
  // Delete all operational data (but keep locker groups, system metadata, and master data like additional_revenue_items)
  db.run('DELETE FROM locker_logs');
  db.run('DELETE FROM locker_daily_summaries');
  db.run('DELETE FROM rental_transactions');
  db.run('DELETE FROM additional_fee_events');
  db.run('DELETE FROM expenses');
  db.run('DELETE FROM closing_days');
  
  // VACUUM: 삭제된 페이지 공간 회수 → saveDatabase() 크기/속도 정상화
  db.run('VACUUM');
  saveDatabase();
}

