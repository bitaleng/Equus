import { db, rowsToObjects, saveDatabase, _isBusinessDay } from './core';

export function getDailySummary(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    'SELECT * FROM locker_daily_summaries WHERE business_day = ?',
    [businessDay]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return {
      businessDay,
      totalVisitors: 0,
      totalSales: 0,
      cancellations: 0,
      totalDiscount: 0,
      foreignerCount: 0,
      foreignerSales: 0,
      dayVisitors: 0,
      nightVisitors: 0
    };
  }

  return rowsToObjects(result[0])[0];
}

export function updateDailySummary(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  // Get locker logs summary
  // 후불결제(deferred_payment = 1)인 경우 매출에서 제외
  // NULL은 후불결제가 아닌 것으로 처리 (이전 데이터 호환성)
  // 참고: final_price에는 이미 선지급금(prepaid_additional_fee)이 포함되어 있음
  const result = db.exec(
    `SELECT 
      COUNT(CASE WHEN (is_staff IS NULL OR is_staff = 0) THEN 1 END) as total_visitors,
      COALESCE(SUM(CASE WHEN status != 'cancelled' AND (deferred_payment IS NULL OR deferred_payment = 0) THEN final_price - COALESCE(refund_amount, 0) ELSE 0 END), 0) as total_sales,
      COUNT(CASE WHEN cancelled = 1 THEN 1 END) as cancellations,
      COALESCE(SUM(
        CASE
          WHEN status = 'cancelled' THEN 0
          WHEN option_type = 'discount' THEN COALESCE(option_amount, 0)
          WHEN option_type = 'custom' AND COALESCE(option_amount, 0) < 0 THEN -option_amount
          WHEN option_type = 'direct_price' AND COALESCE(option_amount, 0) < base_price
            THEN base_price - option_amount
          ELSE 0
        END
      ), 0) + COALESCE(SUM(
        CASE WHEN status != 'cancelled' THEN COALESCE(long_term_discount, 0) ELSE 0 END
      ), 0) as total_discount,
      COUNT(CASE WHEN option_type = 'foreigner' AND status != 'cancelled' AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as foreigner_count,
      COALESCE(SUM(CASE WHEN option_type = 'foreigner' AND status != 'cancelled' AND (deferred_payment IS NULL OR deferred_payment = 0) AND (is_staff IS NULL OR is_staff = 0) THEN final_price - COALESCE(refund_amount, 0) ELSE 0 END), 0) as foreigner_sales,
      COUNT(CASE WHEN time_type = '주간' AND status != 'cancelled' AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as day_visitors,
      COUNT(CASE WHEN time_type = '야간' AND status != 'cancelled' AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as night_visitors
    FROM locker_logs
    WHERE business_day = ?`,
    [businessDay]
  );

  if (result.length === 0 || result[0].values.length === 0) return;

  const [totalVisitors, baseSales, cancellations, entryDiscount, foreignerCount, foreignerSales, dayVisitors, nightVisitors] = result[0].values[0];

  // Get additional fee events for this business day (fees recorded at checkout time)
  // 참고: 이것은 퇴실 시 발생하는 추가요금이며, 입실 시 선지급금과는 별개임
  const additionalFeeResult = db.exec(
    `SELECT
       COALESCE(SUM(fee_amount), 0) as additional_fee_total,
       COALESCE(SUM(COALESCE(discount_amount, 0)), 0) as additional_fee_discount
     FROM additional_fee_events
     WHERE business_day = ?`,
    [businessDay]
  );
  
  const additionalFeeTotal = additionalFeeResult.length > 0 && additionalFeeResult[0].values.length > 0 
    ? additionalFeeResult[0].values[0][0] 
    : 0;
  const additionalFeeDiscount = additionalFeeResult.length > 0 && additionalFeeResult[0].values.length > 0
    ? (additionalFeeResult[0].values[0][1] as number)
    : 0;

  // Total sales = base sales from locker_logs (선지급금 포함) + additional fees from checkout time
  const totalSales = (baseSales as number) + (additionalFeeTotal as number);
  const totalDiscount = (entryDiscount as number) + additionalFeeDiscount;

  // Insert or update
  db.run(
    `INSERT INTO locker_daily_summaries 
     (business_day, total_visitors, total_sales, cancellations, total_discount, foreigner_count, foreigner_sales, day_visitors, night_visitors)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(business_day) DO UPDATE SET
       total_visitors = excluded.total_visitors,
       total_sales = excluded.total_sales,
       cancellations = excluded.cancellations,
       total_discount = excluded.total_discount,
       foreigner_count = excluded.foreigner_count,
       foreigner_sales = excluded.foreigner_sales,
       day_visitors = excluded.day_visitors,
       night_visitors = excluded.night_visitors`,
    [businessDay, totalVisitors, totalSales, cancellations, totalDiscount, foreignerCount, foreignerSales, dayVisitors, nightVisitors]
  );
}

// Get all daily summaries for sales reports
export function getAllDailySummaries() {
  if (!db) throw new Error('Database not initialized');

  const cols = _snapshotSummaryColumns();
  const result = db.exec(
    `SELECT ${cols} FROM locker_daily_summaries ORDER BY business_day DESC`
  );

  const live = result.length === 0 ? [] : rowsToObjects(result[0]);

  const snapResult = db.exec(
    `SELECT ${cols} FROM report_daily_snapshots ORDER BY business_day DESC`
  );
  const snapshots = snapResult.length === 0 ? [] : rowsToObjects(snapResult[0]);

  return _mergeDailySummariesByMonth(live, snapshots).reverse();
}

// 진단 함수: 데이터베이스 상태 확인
export function debugDatabaseStatus() {
  if (!db) {
    console.error('[DEBUG] Database not initialized!');
    return { error: 'Database not initialized' };
  }
  
  // locker_logs 테이블 상태
  const logsResult = db.exec(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'in_use' THEN 1 END) as in_use,
      COUNT(CASE WHEN status = 'checked_out' THEN 1 END) as checked_out,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
    FROM locker_logs
  `);
  
  // locker_daily_summaries 테이블 상태
  const summariesResult = db.exec(`
    SELECT COUNT(*) as total, 
           COALESCE(SUM(total_sales), 0) as total_sales,
           MIN(business_day) as oldest_day,
           MAX(business_day) as newest_day
    FROM locker_daily_summaries
  `);
  
  // 최근 7일 요약 데이터
  const recentSummaries = db.exec(`
    SELECT business_day, total_visitors, total_sales 
    FROM locker_daily_summaries 
    ORDER BY business_day DESC 
    LIMIT 10
  `);
  
  const logs = logsResult.length > 0 ? logsResult[0].values[0] : [];
  const summaries = summariesResult.length > 0 ? summariesResult[0].values[0] : [];
  
  console.log('='.repeat(60));
  console.log('[DEBUG] 데이터베이스 상태 확인');
  console.log('='.repeat(60));
  console.log('\n📋 locker_logs 테이블:');
  console.log(`  - 전체 레코드: ${logs[0]}건`);
  console.log(`  - 사용중(in_use): ${logs[1]}건`);
  console.log(`  - 퇴실완료(checked_out): ${logs[2]}건`);
  console.log(`  - 취소(cancelled): ${logs[3]}건`);
  
  console.log('\n📊 locker_daily_summaries 테이블:');
  console.log(`  - 전체 레코드: ${summaries[0]}건`);
  console.log(`  - 총 매출: ${summaries[1]}원`);
  console.log(`  - 가장 오래된 날: ${summaries[2]}`);
  console.log(`  - 가장 최근 날: ${summaries[3]}`);
  
  console.log('\n📅 최근 10일 요약:');
  if (recentSummaries.length > 0 && recentSummaries[0].values.length > 0) {
    recentSummaries[0].values.forEach((row: any) => {
      console.log(`  - ${row[0]}: 방문 ${row[1]}명, 매출 ${row[2]}원`);
    });
  } else {
    console.log('  (데이터 없음)');
  }
  console.log('='.repeat(60));
  
  return {
    locker_logs: {
      total: logs[0],
      in_use: logs[1],
      checked_out: logs[2],
      cancelled: logs[3]
    },
    daily_summaries: {
      total: summaries[0],
      total_sales: summaries[1],
      oldest_day: summaries[2],
      newest_day: summaries[3]
    },
    recent_summaries: recentSummaries.length > 0 ? rowsToObjects(recentSummaries[0]) : []
  };
}

// Get daily summaries for a specific year-month (YYYY-MM)
/** 자동 백업으로 삭제된 영업일은 report_daily_snapshots에서 보조 */
function _snapshotSummaryColumns(): string {
  return `business_day, total_visitors, total_sales, cancellations, total_discount,
    foreigner_count, foreigner_sales, day_visitors, night_visitors`;
}

function _mergeDailySummariesByMonth(
  liveRows: any[],
  snapshotRows: any[]
): any[] {
  const liveDays = new Set(liveRows.map((r) => r.businessDay));
  const merged = [...liveRows];
  for (const row of snapshotRows) {
    if (!liveDays.has(row.businessDay)) {
      merged.push(row);
    }
  }
  merged.sort((a, b) => String(a.businessDay).localeCompare(String(b.businessDay)));
  return merged;
}

export function snapshotReportDailyThrough(throughDate: string): number {
  if (!db) throw new Error('Database not initialized');
  if (!_isBusinessDay(throughDate)) {
    throw new Error('날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)');
  }

  const daysResult = db.exec(
    `SELECT DISTINCT business_day FROM (
       SELECT business_day FROM locker_daily_summaries
         WHERE business_day <= ? AND business_day IS NOT NULL AND business_day != ''
       UNION
       SELECT business_day FROM locker_logs
         WHERE business_day <= ? AND business_day IS NOT NULL AND business_day != '' AND status != 'in_use'
     )
     ORDER BY business_day ASC`,
    [throughDate, throughDate]
  );

  if (daysResult.length === 0 || daysResult[0].values.length === 0) {
    return 0;
  }

  const archivedAt = new Date().toISOString();
  let count = 0;

  for (const row of daysResult[0].values) {
    const businessDay = String(row[0]);
    try {
      updateDailySummary(businessDay);
    } catch {
      // 집계 실패 시 기존 summary·로그 기준으로 계속
    }

    const summaryResult = db.exec(
      `SELECT total_visitors, total_sales, cancellations, total_discount,
              foreigner_count, foreigner_sales, day_visitors, night_visitors
       FROM locker_daily_summaries WHERE business_day = ?`,
      [businessDay]
    );

    let totalVisitors = 0;
    let totalSales = 0;
    let cancellations = 0;
    let totalDiscount = 0;
    let foreignerCount = 0;
    let foreignerSales = 0;
    let dayVisitors = 0;
    let nightVisitors = 0;

    if (summaryResult.length > 0 && summaryResult[0].values.length > 0) {
      [
        totalVisitors,
        totalSales,
        cancellations,
        totalDiscount,
        foreignerCount,
        foreignerSales,
        dayVisitors,
        nightVisitors,
      ] = summaryResult[0].values[0].map((v) => Number(v) || 0);
    }

    const visitorResult = db.exec(
      `SELECT
         COUNT(CASE WHEN (is_staff IS NULL OR is_staff = 0) THEN 1 END) as total_visitors,
         COUNT(CASE WHEN cancelled = 0 AND (option_type IS NULL OR option_type != 'free') AND parent_locker IS NULL AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as actual_visitors,
         COUNT(CASE WHEN cancelled = 1 THEN 1 END) as cancelled_visitors,
         COUNT(CASE WHEN cancelled = 0 AND option_type = 'free' AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as free_visitors
       FROM locker_logs
       WHERE business_day = ? AND parent_locker IS NULL`,
      [businessDay]
    );

    let actualVisitors = 0;
    let cancelledVisitors = 0;
    let freeVisitors = 0;
    if (visitorResult.length > 0 && visitorResult[0].values.length > 0) {
      const [tv, av, cv, fv] = visitorResult[0].values[0].map((v) => Number(v) || 0);
      if (tv > 0) totalVisitors = tv;
      actualVisitors = av;
      cancelledVisitors = cv;
      freeVisitors = fv;
    }

    db.run(
      `INSERT INTO report_daily_snapshots
       (business_day, total_visitors, total_sales, cancellations, total_discount,
        foreigner_count, foreigner_sales, day_visitors, night_visitors,
        actual_visitors, cancelled_visitors, free_visitors, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(business_day) DO UPDATE SET
         total_visitors = excluded.total_visitors,
         total_sales = excluded.total_sales,
         cancellations = excluded.cancellations,
         total_discount = excluded.total_discount,
         foreigner_count = excluded.foreigner_count,
         foreigner_sales = excluded.foreigner_sales,
         day_visitors = excluded.day_visitors,
         night_visitors = excluded.night_visitors,
         actual_visitors = excluded.actual_visitors,
         cancelled_visitors = excluded.cancelled_visitors,
         free_visitors = excluded.free_visitors,
         archived_at = excluded.archived_at`,
      [
        businessDay,
        totalVisitors,
        totalSales,
        cancellations,
        totalDiscount,
        foreignerCount,
        foreignerSales,
        dayVisitors,
        nightVisitors,
        actualVisitors,
        cancelledVisitors,
        freeVisitors,
        archivedAt,
      ]
    );
    count++;
  }

  if (count > 0) {
    saveDatabase();
  }
  return count;
}

export function getDailySummariesByMonth(yearMonth: string) {
  if (!db) throw new Error('Database not initialized');

  const cols = _snapshotSummaryColumns();
  const result = db.exec(
    `SELECT ${cols} FROM locker_daily_summaries 
     WHERE business_day LIKE ?
     ORDER BY business_day ASC`,
    [yearMonth + '%']
  );

  const live =
    result.length === 0 ? [] : rowsToObjects(result[0]);

  const snapResult = db.exec(
    `SELECT ${cols} FROM report_daily_snapshots
     WHERE business_day LIKE ?
     ORDER BY business_day ASC`,
    [yearMonth + '%']
  );
  const snapshots =
    snapResult.length === 0 ? [] : rowsToObjects(snapResult[0]);

  return _mergeDailySummariesByMonth(live, snapshots);
}

/** 월별 입실할인 / 추가할인 합계 (원본 로그·이벤트 기준, 항상 최신) */
export function getDiscountTotalsByMonth(yearMonth: string): {
  entryDiscount: number;
  additionalDiscount: number;
  totalDiscount: number;
} {
  if (!db) throw new Error('Database not initialized');

  const entryResult = db.exec(
    `SELECT COALESCE(SUM(
        CASE
          WHEN option_type = 'discount' THEN COALESCE(option_amount, 0)
          WHEN option_type = 'custom' AND COALESCE(option_amount, 0) < 0 THEN -option_amount
          WHEN option_type = 'direct_price' AND COALESCE(option_amount, 0) < base_price
            THEN base_price - option_amount
          ELSE 0
        END
      ), 0) + COALESCE(SUM(COALESCE(long_term_discount, 0)), 0) as entry_discount
     FROM locker_logs
     WHERE business_day LIKE ? AND status != 'cancelled'`,
    [yearMonth + '%']
  );

  const additionalResult = db.exec(
    `SELECT COALESCE(SUM(COALESCE(discount_amount, 0)), 0) as additional_discount
     FROM additional_fee_events
     WHERE business_day LIKE ?`,
    [yearMonth + '%']
  );

  const entryDiscount =
    entryResult.length > 0 && entryResult[0].values.length > 0
      ? Number(entryResult[0].values[0][0]) || 0
      : 0;
  const additionalDiscount =
    additionalResult.length > 0 && additionalResult[0].values.length > 0
      ? Number(additionalResult[0].values[0][0]) || 0
      : 0;

  return {
    entryDiscount,
    additionalDiscount,
    totalDiscount: entryDiscount + additionalDiscount,
  };
}

/** 월별 일 단위 입실할인 / 추가할인 내역 */
export function getDailyDiscountBreakdownByMonth(yearMonth: string): Array<{
  businessDay: string;
  entryDiscount: number;
  additionalDiscount: number;
  totalDiscount: number;
}> {
  if (!db) throw new Error('Database not initialized');

  const entryResult = db.exec(
    `SELECT business_day,
       COALESCE(SUM(
         CASE
           WHEN option_type = 'discount' THEN COALESCE(option_amount, 0)
           WHEN option_type = 'custom' AND COALESCE(option_amount, 0) < 0 THEN -option_amount
           WHEN option_type = 'direct_price' AND COALESCE(option_amount, 0) < base_price
             THEN base_price - option_amount
           ELSE 0
         END
       ), 0) + COALESCE(SUM(COALESCE(long_term_discount, 0)), 0) as entry_discount
     FROM locker_logs
     WHERE business_day LIKE ? AND status != 'cancelled'
     GROUP BY business_day`,
    [yearMonth + '%']
  );

  const additionalResult = db.exec(
    `SELECT business_day,
       COALESCE(SUM(COALESCE(discount_amount, 0)), 0) as additional_discount
     FROM additional_fee_events
     WHERE business_day LIKE ?
     GROUP BY business_day`,
    [yearMonth + '%']
  );

  const map = new Map<string, { entryDiscount: number; additionalDiscount: number }>();

  if (entryResult.length > 0) {
    for (const row of entryResult[0].values) {
      const day = String(row[0]);
      const entry = Number(row[1]) || 0;
      const prev = map.get(day) || { entryDiscount: 0, additionalDiscount: 0 };
      prev.entryDiscount = entry;
      map.set(day, prev);
    }
  }

  if (additionalResult.length > 0) {
    for (const row of additionalResult[0].values) {
      const day = String(row[0]);
      const additional = Number(row[1]) || 0;
      const prev = map.get(day) || { entryDiscount: 0, additionalDiscount: 0 };
      prev.additionalDiscount = additional;
      map.set(day, prev);
    }
  }

  return Array.from(map.entries())
    .map(([businessDay, v]) => ({
      businessDay,
      entryDiscount: v.entryDiscount,
      additionalDiscount: v.additionalDiscount,
      totalDiscount: v.entryDiscount + v.additionalDiscount,
    }))
    .filter((d) => d.totalDiscount > 0)
    .sort((a, b) => a.businessDay.localeCompare(b.businessDay));
}

// Get locker logs by business day for hourly analysis
export function getLockerLogsByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE business_day = ? AND status != 'cancelled'
     ORDER BY entry_time ASC`,
    [businessDay]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

// Get visitor statistics by month (총방문수, 실제방문수, 취소, 무료입장)
export function getVisitorStatsByMonth(yearMonth: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT 
      business_day,
      COUNT(CASE WHEN (is_staff IS NULL OR is_staff = 0) THEN 1 END) as total_visitors,
      COUNT(CASE WHEN cancelled = 0 AND (option_type IS NULL OR option_type != 'free') AND parent_locker IS NULL AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as actual_visitors,
      COUNT(CASE WHEN cancelled = 1 THEN 1 END) as cancelled_visitors,
      COUNT(CASE WHEN cancelled = 0 AND option_type = 'free' AND (is_staff IS NULL OR is_staff = 0) THEN 1 END) as free_visitors
     FROM locker_logs 
     WHERE business_day LIKE ? AND parent_locker IS NULL
     GROUP BY business_day
     ORDER BY business_day ASC`,
    [yearMonth + '%']
  );

  const live = result.length === 0 ? [] : rowsToObjects(result[0]);
  const liveDays = new Set(live.map((v) => v.businessDay));

  const snapResult = db.exec(
    `SELECT business_day, total_visitors, actual_visitors, cancelled_visitors, free_visitors
     FROM report_daily_snapshots
     WHERE business_day LIKE ?
     ORDER BY business_day ASC`,
    [yearMonth + '%']
  );
  const snapshots = snapResult.length === 0 ? [] : rowsToObjects(snapResult[0]);

  const merged = [...live];
  for (const row of snapshots) {
    if (!liveDays.has(row.businessDay)) {
      merged.push(row);
    }
  }
  merged.sort((a, b) => String(a.businessDay).localeCompare(String(b.businessDay)));
  return merged;
}

// Get daily payment breakdown by month (cash, card, transfer)
export function getDailyPaymentBreakdownByMonth(yearMonth: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT 
      business_day,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer
     FROM locker_logs 
     WHERE business_day LIKE ?
     GROUP BY business_day
     ORDER BY business_day ASC`,
    [yearMonth + '%']
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

// Get cancelled sales amount for a specific month (YYYY-MM)
export function getCancelledSalesByMonth(yearMonth: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT 
      business_day,
      COALESCE(SUM(final_price), 0) as cancelled_amount,
      COUNT(*) as cancelled_count
     FROM locker_logs 
     WHERE business_day LIKE ? AND (status = 'cancelled' OR cancelled = 1)
     GROUP BY business_day
     ORDER BY business_day ASC`,
    [yearMonth + '%']
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

// Get locker logs for a date range (for reports)
export function getLockerLogsByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE business_day >= ? AND business_day <= ? AND status != 'cancelled'
     ORDER BY entry_time ASC`,
    [startDate, endDate]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

