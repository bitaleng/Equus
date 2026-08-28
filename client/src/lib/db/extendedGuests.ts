import { db, rowsToObjects } from './core';
import { getSettings } from './settings';
import {
  getBusinessDayRange,
  getSettlementCycleOptions,
  getStagedHourlyOptions,
  getNightstartOptions,
  countExtendedGuestLockers,
} from '@shared/businessDay';
import type { DomesticAdditionalFeeMode, ExtendedGuestFeeConfig, ExtendedGuestEntry } from '@shared/businessDay';

/**
 * 연장객(하루 더 머물며 추가요금이 최소 1회 부과된 손님) 집계 — Home.tsx의 실시간 계산과
 * 같은 기준(shared/businessDay.ts의 countExtendedGuestLockers)을 과거 영업일 조회에도 재사용한다.
 *
 * 주의: 방문객수(getVisitorStatsByMonth)와 달리 이 값은 locker_logs 원본 행이 있어야만 재계산할 수
 * 있다 — 설정 > 데이터 정리(archive.ts의 purgeDataThrough)로 오래된 행이 삭제된 이후에는 여기서
 * 다시 계산할 수 없으므로, snapshotReportDailyThrough()가 삭제 직전에 report_daily_snapshots에
 * extended_guest_count로 미리 계산해 남겨둔다(dailySummaries.ts).
 */

function buildExtendedGuestConfig(): ExtendedGuestFeeConfig {
  const settings = getSettings();
  return {
    dayPrice: settings.dayPrice ?? 10000,
    nightPrice: settings.nightPrice ?? 15000,
    foreignerPrice: settings.foreignerPrice,
    foreignerSeparateDayNight: settings.foreignerSeparateDayNight,
    foreignerDayPrice: settings.foreignerDayPrice,
    foreignerNightPrice: settings.foreignerNightPrice,
    domesticCheckpointHour: settings.domesticCheckpointHour ?? 1,
    foreignerAdditionalFeePeriod: settings.foreignerAdditionalFeePeriod ?? 24,
    domesticAdditionalFeeMode: (settings.domesticAdditionalFeeMode || 'nextday') as DomesticAdditionalFeeMode,
    nightStartHour: parseInt((settings.nightStartTime || '19:00').split(':')[0], 10),
    settlementCycleOpts: getSettlementCycleOptions(settings as any),
    stagedHourlyOpts: getStagedHourlyOptions(settings as any),
    nightstartOpts: getNightstartOptions(settings as any),
  };
}

/** startBusinessDay~endBusinessDay 범위 동안 조금이라도 "활성"(입실 중 또는 그 기간에 퇴실)이었던 entries를 통째로 조회.
 * entry_time이 범위 시작 이전이어도, exit_time이 범위 시작 이후(또는 아직 in_use)면 포함한다. */
function getEntriesOverlappingRange(startBusinessDay: string, endBusinessDay: string, businessDayStartHour: number): ExtendedGuestEntry[] {
  if (!db) return [];
  const rangeStart = getBusinessDayRange(new Date(startBusinessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour).start;
  const rangeEnd = getBusinessDayRange(new Date(endBusinessDay + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'), businessDayStartHour).end;
  const startUnix = Math.floor(rangeStart.getTime() / 1000);
  const endUnix = Math.floor(rangeEnd.getTime() / 1000);
  const result = db.exec(
    `SELECT locker_number, entry_time, exit_time, time_type, option_type,
            no_additional_fee, is_long_term, parent_locker, is_staff,
            additional_fee_paid_amount, prepaid_additional_fee
     FROM locker_logs
     WHERE status != 'cancelled'
       AND strftime('%s', entry_time) <= ?
       AND (exit_time IS NULL OR strftime('%s', exit_time) >= ?)`,
    [endUnix.toString(), startUnix.toString()]
  );
  if (result.length === 0) return [];
  return rowsToObjects(result[0]) as unknown as ExtendedGuestEntry[];
}

/** 영업일별 연장객 수(락커 단위 중복제거) — 라이브 locker_logs 데이터로만 계산.
 * 정리(purge)된 과거 영업일은 원본 행이 없어 0으로 나올 수 있으니, 호출부에서 report_daily_snapshots와 병합해야 한다. */
export function getExtendedGuestCountsByBusinessDayRange(
  startBusinessDay: string,
  endBusinessDay: string
): Record<string, number> {
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour ?? 10;
  const config = buildExtendedGuestConfig();
  const entries = getEntriesOverlappingRange(startBusinessDay, endBusinessDay, businessDayStartHour);

  const counts: Record<string, number> = {};
  let cursor = startBusinessDay;
  let guard = 0;
  while (cursor <= endBusinessDay && guard < 3660) {
    guard++;
    const { start: dayStart, end: dayEnd } = getBusinessDayRange(
      new Date(cursor + 'T' + String(businessDayStartHour).padStart(2, '0') + ':00:00'),
      businessDayStartHour
    );
    const activeThatDay = entries.filter(e => {
      const entryMs = new Date(e.entryTime).getTime();
      const exitMs = e.exitTime ? new Date(e.exitTime).getTime() : null;
      return entryMs <= dayEnd.getTime() && (exitMs === null || exitMs >= dayStart.getTime());
    });
    counts[cursor] = countExtendedGuestLockers(activeThatDay, dayEnd, config);
    const d = new Date(cursor + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return counts;
}

/** 오늘(라이브) 연장객 수 — Home.tsx는 activeLockers를 이미 들고 있어 보통 직접 countExtendedGuestLockers를 쓰지만,
 * 다른 화면에서 "오늘"만 간단히 필요할 때 쓸 수 있는 진입점 */
export function getExtendedGuestCountForToday(businessDay: string, businessDayStartHour: number): number {
  const config = buildExtendedGuestConfig();
  const entries = getEntriesOverlappingRange(businessDay, businessDay, businessDayStartHour);
  return countExtendedGuestLockers(entries, new Date(), config);
}
