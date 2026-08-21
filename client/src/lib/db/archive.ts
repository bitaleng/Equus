import { db, allowDatabaseShrink, saveDatabase, APP_SYSTEM_NAME, _isBusinessDay } from './core';
import { snapshotReportDailyThrough } from './dailySummaries';

function _countSql(sql: string, params: any[] = []): number {
  if (!db) return 0;
  try {
    const r = db.exec(sql, params);
    if (!r.length || !r[0].values.length) return 0;
    return Number(r[0].values[0][0] || 0);
  } catch {
    return 0;
  }
}

function _minmaxBusinessDay(): { oldest: string | null; newest: string | null } {
  if (!db) return { oldest: null, newest: null };
  const queries = [
    `SELECT MIN(business_day), MAX(business_day) FROM locker_logs WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(business_day), MAX(business_day) FROM locker_daily_summaries WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(business_day), MAX(business_day) FROM additional_fee_events WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(business_day), MAX(business_day) FROM rental_transactions WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(business_day), MAX(business_day) FROM expenses WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(business_day), MAX(business_day) FROM closing_days WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(business_day), MAX(business_day) FROM scan_logs WHERE business_day IS NOT NULL AND business_day != ''`,
    `SELECT MIN(work_date), MAX(work_date) FROM staff_work_logs WHERE work_date IS NOT NULL AND work_date != ''`,
    `SELECT MIN(rating_date), MAX(rating_date) FROM staff_ratings WHERE rating_date IS NOT NULL AND rating_date != ''`,
  ];
  let oldest: string | null = null;
  let newest: string | null = null;
  for (const q of queries) {
    try {
      const r = db.exec(q);
      if (!r.length || !r[0].values.length) continue;
      const lo = r[0].values[0][0] as string | null;
      const hi = r[0].values[0][1] as string | null;
      if (lo && (!oldest || lo < oldest)) oldest = lo;
      if (hi && (!newest || hi > newest)) newest = hi;
    } catch {
      /* 테이블 없음 등 */
    }
  }
  return { oldest, newest };
}

/** 운영 데이터 기간 요약 (설정·마스터 제외) */
export function getOperationalDateRange(): {
  oldest: string | null;
  newest: string | null;
} {
  if (!db) throw new Error('Database not initialized');
  return _minmaxBusinessDay();
}

export function getOldestEntryDate(): string | null {
  return getOperationalDateRange().oldest;
}

/** throughDate(포함)까지 백업·삭제 대상 건수 미리보기. 입실중(in_use)은 삭제 제외 */
export function previewArchivePurge(throughDate: string): {
  throughDate: string;
  oldest: string | null;
  newest: string | null;
  counts: Record<string, number>;
  total: number;
  protectedInUse: number;
} {
  if (!db) throw new Error('Database not initialized');
  if (!_isBusinessDay(throughDate)) {
    throw new Error('날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  }
  const { oldest, newest } = _minmaxBusinessDay();
  const counts: Record<string, number> = {
    locker_logs: _countSql(
      `SELECT COUNT(*) FROM locker_logs WHERE business_day <= ? AND status != 'in_use'`,
      [throughDate]
    ),
    locker_daily_summaries: _countSql(
      `SELECT COUNT(*) FROM locker_daily_summaries WHERE business_day <= ?`,
      [throughDate]
    ),
    additional_fee_events: _countSql(
      `SELECT COUNT(*) FROM additional_fee_events WHERE business_day <= ?`,
      [throughDate]
    ),
    rental_transactions: _countSql(
      `SELECT COUNT(*) FROM rental_transactions WHERE business_day <= ?`,
      [throughDate]
    ),
    expenses: _countSql(
      `SELECT COUNT(*) FROM expenses WHERE business_day <= ?`,
      [throughDate]
    ),
    closing_days: _countSql(
      `SELECT COUNT(*) FROM closing_days WHERE business_day <= ?`,
      [throughDate]
    ),
    scan_logs: _countSql(
      `SELECT COUNT(*) FROM scan_logs WHERE business_day <= ?`,
      [throughDate]
    ),
    staff_work_logs: _countSql(
      `SELECT COUNT(*) FROM staff_work_logs WHERE work_date <= ?`,
      [throughDate]
    ),
    staff_ratings: _countSql(
      `SELECT COUNT(*) FROM staff_ratings WHERE rating_date <= ?`,
      [throughDate]
    ),
  };
  const protectedInUse = _countSql(
    `SELECT COUNT(*) FROM locker_logs WHERE business_day <= ? AND status = 'in_use'`,
    [throughDate]
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { throughDate, oldest, newest, counts, total, protectedInUse };
}

function _exportTableFiltered(tableName: string, whereSql: string, params: any[]): any[] {
  if (!db) return [];
  try {
    const result = db.exec(`SELECT * FROM ${tableName} WHERE ${whereSql}`, params);
    if (!result.length || !result[0].values.length) return [];
    const columns = result[0].columns;
    return result[0].values.map((row: any) => {
      const obj: any = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (error) {
    console.warn(`Failed to export filtered ${tableName}:`, error);
    return [];
  }
}

function _minDateFromArchiveTables(tables: Record<string, any[]>): string | null {
  let min: string | null = null;
  const dateKeys = ['business_day', 'work_date', 'rating_date'];
  for (const rows of Object.values(tables)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      for (const key of dateKeys) {
        const value = row?.[key];
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          if (!min || value < min) min = value;
        }
      }
    }
  }
  return min;
}

/**
 * throughDate(포함)까지의 운영 데이터만 JSON 백업.
 * 입실중(in_use) 락커는 백업·삭제 대상에서 제외.
 * 설정/마스터(락커그룹·요금옵션 등)는 포함하지 않음 — 보관용 아카이브.
 */
export function exportArchiveThrough(throughDate: string): {
  success: boolean;
  data?: string;
  error?: string;
  rowCount?: number;
  archiveFrom?: string;
  archiveThrough?: string;
} {
  if (!db) return { success: false, error: 'Database not initialized' };
  if (!_isBusinessDay(throughDate)) {
    return { success: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }

  try {
    const exportData: any = {
      version: '1.0',
      type: 'archive',
      archiveThrough: throughDate,
      archiveFrom: null as string | null,
      exportDate: new Date().toISOString(),
      appName: APP_SYSTEM_NAME,
      tables: {} as Record<string, any[]>,
    };

    exportData.tables.locker_logs = _exportTableFiltered(
      'locker_logs',
      `business_day <= ? AND status != 'in_use'`,
      [throughDate]
    );
    exportData.tables.locker_daily_summaries = _exportTableFiltered(
      'locker_daily_summaries',
      `business_day <= ?`,
      [throughDate]
    );
    exportData.tables.additional_fee_events = _exportTableFiltered(
      'additional_fee_events',
      `business_day <= ?`,
      [throughDate]
    );
    exportData.tables.rental_transactions = _exportTableFiltered(
      'rental_transactions',
      `business_day <= ?`,
      [throughDate]
    );
    exportData.tables.expenses = _exportTableFiltered(
      'expenses',
      `business_day <= ?`,
      [throughDate]
    );
    exportData.tables.closing_days = _exportTableFiltered(
      'closing_days',
      `business_day <= ?`,
      [throughDate]
    );
    exportData.tables.scan_logs = _exportTableFiltered(
      'scan_logs',
      `business_day <= ?`,
      [throughDate]
    );
    exportData.tables.staff_work_logs = _exportTableFiltered(
      'staff_work_logs',
      `work_date <= ?`,
      [throughDate]
    );
    exportData.tables.staff_ratings = _exportTableFiltered(
      'staff_ratings',
      `rating_date <= ?`,
      [throughDate]
    );

    let rowCount = 0;
    for (const rows of Object.values(exportData.tables) as any[][]) {
      rowCount += rows.length;
    }

    if (rowCount === 0) {
      return { success: false, error: '해당 기간에 백업할 데이터가 없습니다.', rowCount: 0 };
    }

    exportData.archiveFrom = _minDateFromArchiveTables(exportData.tables);

    return {
      success: true,
      data: JSON.stringify(exportData, null, 2),
      rowCount,
      archiveFrom: exportData.archiveFrom || undefined,
      archiveThrough: throughDate,
    };
  } catch (error) {
    console.error('Error exporting archive:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * throughDate(포함)까지 운영 데이터 삭제 후 VACUUM.
 * 반드시 exportArchiveThrough 성공·파일 저장 후에 호출할 것.
 * 입실중(in_use)은 삭제하지 않음.
 */
export function purgeDataThrough(throughDate: string): {
  success: boolean;
  deleted: number;
  error?: string;
} {
  if (!db) return { success: false, deleted: 0, error: 'Database not initialized' };
  if (!_isBusinessDay(throughDate)) {
    return { success: false, deleted: 0, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }

  try {
    const preview = previewArchivePurge(throughDate);
    if (preview.total === 0) {
      return { success: false, deleted: 0, error: '삭제할 데이터가 없습니다.' };
    }

    const snapCount = snapshotReportDailyThrough(throughDate);
    if (snapCount > 0) {
      console.log(`[purge] 매출리포트용 일별 스냅샷 ${snapCount}건 저장`);
    }

    allowDatabaseShrink();

    db.run(
      `DELETE FROM locker_logs WHERE business_day <= ? AND status != 'in_use'`,
      [throughDate]
    );
    db.run(`DELETE FROM locker_daily_summaries WHERE business_day <= ?`, [throughDate]);
    db.run(`DELETE FROM additional_fee_events WHERE business_day <= ?`, [throughDate]);
    db.run(`DELETE FROM rental_transactions WHERE business_day <= ?`, [throughDate]);
    db.run(`DELETE FROM expenses WHERE business_day <= ?`, [throughDate]);
    db.run(`DELETE FROM closing_days WHERE business_day <= ?`, [throughDate]);
    db.run(`DELETE FROM scan_logs WHERE business_day <= ?`, [throughDate]);
    try {
      db.run(`DELETE FROM staff_work_logs WHERE work_date <= ?`, [throughDate]);
    } catch {}
    try {
      db.run(`DELETE FROM staff_ratings WHERE rating_date <= ?`, [throughDate]);
    } catch {}

    db.run('VACUUM');
    saveDatabase();

    return { success: true, deleted: preview.total };
  } catch (error) {
    console.error('Error purging archive range:', error);
    return { success: false, deleted: 0, error: String(error) };
  }
}

/** @deprecated 호환용 — purgeDataThrough(하루 전)과 동일하지 않음. cutoff 미만 삭제 */
export function deleteOldData(cutoffDate: string) {
  if (!db) throw new Error('Database not initialized');
  if (!_isBusinessDay(cutoffDate)) throw new Error('Invalid date');
  // cutoffDate 미만만 삭제 (= throughDate = 전날 개념이 아님). 기존 시그니처 유지
  const d = new Date(cutoffDate + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const through = d.toISOString().slice(0, 10);
  const result = purgeDataThrough(through);
  if (!result.success) throw new Error(result.error || 'deleteOldData failed');
}

