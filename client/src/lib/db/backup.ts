import { db, allowDatabaseShrink, saveDatabase, saveDatabaseDebounced, APP_SYSTEM_NAME } from './core';

export function exportDatabase(): {
  success: boolean;
  data?: string;
  error?: string;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  
  try {
    const exportData: any = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      appName: APP_SYSTEM_NAME,
      tables: {},
      localStorage: {}
    };
    
    // Helper function to export a table
    const exportTable = (tableName: string) => {
      const result = db!.exec(`SELECT * FROM ${tableName}`);
      if (result.length === 0 || result[0].values.length === 0) {
        return [];
      }
      
      const columns = result[0].columns;
      return result[0].values.map((row: any) => {
        const obj: any = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
    };
    
    // Export all tables (including user-defined settings like pricing_options)
    const tables = [
      'locker_logs',
      'locker_daily_summaries',
      'system_metadata',
      'locker_groups',
      'additional_fee_events',
      'additional_revenue_items',
      'rental_transactions',
      'expenses',
      'closing_days',
      'expense_categories',
      'barcode_mappings',
      'rfid_mappings',
      'scan_logs',
      'pricing_options',  // 추가 요금옵션 (사용자 정의)
      'staff',            // 직원 정보
      'staff_work_logs',  // 직원 근무·근태 기록
      'staff_ratings'     // 직원 평가 기록
    ];
    
    tables.forEach(tableName => {
      try {
        exportData.tables[tableName] = exportTable(tableName);
      } catch (error) {
        console.warn(`Failed to export table ${tableName}:`, error);
        exportData.tables[tableName] = [];
      }
    });
    
    // Export localStorage settings (excluding database itself and device-specific data)
    // Include all user settings and preferences that should persist across app updates
    const localStorageKeys = [
      // 시스템 설정
      'settings',
      // 보안 설정
      'staff_pattern',
      'staff_password',
      'security_enabled',
      'security_pattern',
      'security_today_status_enabled',
      'security_sales_tab_enabled',
      'auth_method_mode',
      'webauthn_enabled',
      'webauthn_credential_id',
      // 메뉴별 잠금 설정
      'locked_menu_routes',
      // 락카 사용설정 (사용불가 락카)
      'out_of_service_lockers',
      // 금전 관리
      'cash_register',
      'last_settlement_reminder_date',
      // 메모
      'daily_memo',
      // UI 설정
      'workspaceFloatingMode',
      'workspaceFloatingPosition',
      'workspaceFloatingSize',
      'workspaceDockedSide',
      'workspaceDockedWidth',
      'uiLayoutMode',
      'logsToolFloatingMode',
      'logsToolFloatingPosition',
      'logsToolFloatingSize',
      'logsToolDockedSide',
      'logsToolDockedWidth'
    ];

    localStorageKeys.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value !== null) {
          exportData.localStorage[key] = value;
        }
      } catch (error) {
        console.warn(`Failed to export localStorage key ${key}:`, error);
      }
    });
    
    const jsonString = JSON.stringify(exportData, null, 2);
    return { success: true, data: jsonString };
  } catch (error) {
    console.error('Error exporting database:', error);
    return { success: false, error: String(error) };
  }
}

// Import database from JSON
export function importDatabase(jsonString: string): {
  success: boolean;
  message?: string;
  error?: string;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  
  try {
    const importData = JSON.parse(jsonString);
    
    // Validate import data structure
    if (!importData.version || !importData.tables) {
      return { success: false, error: '유효하지 않은 백업 파일 형식입니다.' };
    }

    if (importData.type === 'archive') {
      return {
        success: false,
        error:
          '이 파일은 구간 아카이브입니다. 「오래된 데이터 정리」의 "아카이브 불러오기"로 현재 데이터에 합쳐 주세요.',
      };
    }
    
    const validAppNames = [
      'Locker Manager System',
      'EQUUS Hotel Management System',
      'HIZZ Hotel Management System',
      'HOME24 Hotel Management System',
    ];
    if (!validAppNames.includes(importData.appName)) {
      return { success: false, error: '이 파일은 호텔 관리 시스템 백업 파일이 아닙니다.' };
    }
    
    console.log(`Importing database backup from ${importData.exportDate}`);
    allowDatabaseShrink();
    
    // Clear existing data from all tables (including user-defined settings)
    const tables = [
      'staff_ratings',    // 직원 평가 기록 (staff_work_logs 보다 먼저)
      'staff_work_logs',  // 직원 근무·근태 기록 (staff 보다 먼저)
      'staff',            // 직원 정보
      'pricing_options',  // 추가 요금옵션 (사용자 정의)
      'scan_logs',
      'rfid_mappings',
      'barcode_mappings',
      'expense_categories',
      'closing_days',
      'expenses',
      'rental_transactions',
      'additional_revenue_items',
      'additional_fee_events',
      'locker_groups',
      'locker_daily_summaries',
      'locker_logs',
      'system_metadata'
    ];
    
    // Delete in reverse order to avoid foreign key issues
    tables.forEach(tableName => {
      try {
        db!.run(`DELETE FROM ${tableName}`);
        console.log(`Cleared table: ${tableName}`);
      } catch (error) {
        console.warn(`Failed to clear table ${tableName}:`, error);
      }
    });
    
    // Clear localStorage settings (except authenticated and database)
    // Include all user settings and preferences that should persist across app updates
    const localStorageKeys = [
      // 시스템 설정
      'settings',
      // 보안 설정
      'staff_pattern',
      'staff_password',
      'security_enabled',
      'security_pattern',
      'security_today_status_enabled',
      'security_sales_tab_enabled',
      'auth_method_mode',
      'webauthn_enabled',
      'webauthn_credential_id',
      // 메뉴별 잠금 설정
      'locked_menu_routes',
      // 락카 사용설정 (사용불가 락카)
      'out_of_service_lockers',
      // 금전 관리
      'cash_register',
      'last_settlement_reminder_date',
      // 메모
      'daily_memo',
      // UI 설정
      'workspaceFloatingMode',
      'workspaceFloatingPosition',
      'workspaceFloatingSize',
      'workspaceDockedSide',
      'workspaceDockedWidth',
      'uiLayoutMode',
      'logsToolFloatingMode',
      'logsToolFloatingPosition',
      'logsToolFloatingSize',
      'logsToolDockedSide',
      'logsToolDockedWidth'
    ];

    localStorageKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`Cleared localStorage key: ${key}`);
      } catch (error) {
        console.warn(`Failed to clear localStorage key ${key}:`, error);
      }
    });
    
    // Import data for each table
    const importTable = (tableName: string, data: any[]) => {
      if (!data || data.length === 0) {
        console.log(`No data to import for ${tableName}`);
        return;
      }

      // Get actual columns in current DB schema to handle version mismatches
      let currentColumns: string[] = [];
      try {
        const schemaResult = db!.exec(`PRAGMA table_info(${tableName})`);
        if (schemaResult.length > 0) {
          currentColumns = schemaResult[0].values.map((row: any) => row[1] as string);
        }
      } catch (e) {
        console.warn(`Could not read schema for ${tableName}:`, e);
      }

      const firstRow = data[0];
      const backupColumns = Object.keys(firstRow);

      // Only insert columns that exist in both backup AND current schema
      // This handles forward/backward compatibility across schema migrations
      const columns = currentColumns.length > 0
        ? backupColumns.filter(col => currentColumns.includes(col))
        : backupColumns;

      if (columns.length === 0) {
        console.warn(`No matching columns for ${tableName}, skipping`);
        return;
      }

      const placeholders = columns.map(() => '?').join(', ');
      const columnNames = columns.join(', ');
      const insertQuery = `INSERT OR IGNORE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;

      let imported = 0;
      let failed = 0;
      data.forEach((row: any) => {
        try {
          const values = columns.map(col => (row[col] !== undefined ? row[col] : null));
          db!.run(insertQuery, values);
          imported++;
        } catch (error) {
          console.warn(`Failed to import row in ${tableName}:`, error, row);
          failed++;
        }
      });

      console.log(`Imported ${imported}/${data.length} rows for ${tableName}` + (failed > 0 ? ` (${failed} failed)` : ''));
    };
    
    // Import tables in order (system_metadata first, then others, user-defined settings included)
    const importOrder = [
      'system_metadata',
      'locker_groups',
      'locker_logs',
      'locker_daily_summaries',
      'additional_fee_events',
      'additional_revenue_items',
      'rental_transactions',
      'expenses',
      'closing_days',
      'expense_categories',
      'barcode_mappings',
      'rfid_mappings',
      'scan_logs',
      'pricing_options',  // 추가 요금옵션 (사용자 정의)
      'staff',            // 직원 정보 (staff_work_logs 보다 먼저)
      'staff_work_logs',  // 직원 근무·근태 기록
      'staff_ratings'     // 직원 평가 기록
    ];
    
    // scan_logs: 최근 90일치만 가져오기 (누적 과다로 인한 DB 비대화 방지)
    const scanLogCutoff = new Date();
    scanLogCutoff.setDate(scanLogCutoff.getDate() - 90);
    const scanLogCutoffStr = scanLogCutoff.toISOString().slice(0, 10); // YYYY-MM-DD

    importOrder.forEach(tableName => {
      if (importData.tables[tableName]) {
        if (tableName === 'scan_logs') {
          const filtered = importData.tables[tableName].filter((row: any) => {
            const scanDay = (row.business_day || row.scan_time || '').slice(0, 10);
            return scanDay >= scanLogCutoffStr;
          });
          console.log(`[Import] scan_logs: ${importData.tables[tableName].length}건 중 최근 90일 ${filtered.length}건만 가져오기`);
          importTable(tableName, filtered);
        } else {
          importTable(tableName, importData.tables[tableName]);
        }
      }
    });
    
    // Import localStorage settings
    if (importData.localStorage) {
      localStorageKeys.forEach(key => {
        if (importData.localStorage[key] !== undefined) {
          try {
            localStorage.setItem(key, importData.localStorage[key]);
            console.log(`Restored localStorage key: ${key}`);
          } catch (error) {
            console.warn(`Failed to restore localStorage key ${key}:`, error);
          }
        }
      });
    }
    
    // VACUUM: 이전 데이터 삭제 후 남은 빈 페이지 공간 회수
    // → db.export() 크기 최소화 → saveDatabase() 속도 정상화 (3-7초 → 수십ms)
    console.log('[Import] Running VACUUM to reclaim freed pages...');
    db!.run('VACUUM');
    
    // Save database to localStorage (immediately after VACUUM - must persist)
    saveDatabase();
    
    const totalRows = Object.values(importData.tables).reduce(
      (sum: number, table: any) => sum + (Array.isArray(table) ? table.length : 0),
      0
    );
    
    const totalLocalStorage = importData.localStorage ? Object.keys(importData.localStorage).length : 0;
    
    return {
      success: true,
      message: `${importData.exportDate}에 백업된 데이터를 성공적으로 복원했습니다. (${totalRows}개 레코드 + ${totalLocalStorage}개 설정)`
    };
  } catch (error) {
    console.error('Error importing database:', error);
    
    // Provide more specific error messages
    if (error instanceof SyntaxError) {
      return { success: false, error: 'JSON 파일 형식이 올바르지 않습니다.' };
    }
    
    return { success: false, error: `가져오기 실패: ${String(error)}` };
  }
}

const ARCHIVE_MERGE_TABLES = [
  'locker_logs',
  'locker_daily_summaries',
  'additional_fee_events',
  'rental_transactions',
  'expenses',
  'closing_days',
  'scan_logs',
  'staff_work_logs',
  'staff_ratings',
] as const;

function _parseArchivePayload(jsonString: string): {
  ok: true;
  data: any;
} | {
  ok: false;
  error: string;
} {
  let importData: any;
  try {
    importData = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: 'JSON 파일 형식이 올바르지 않습니다.' };
  }

  if (!importData?.version || !importData?.tables) {
    return { ok: false, error: '유효하지 않은 백업 파일 형식입니다.' };
  }

  if (importData.type !== 'archive') {
    return {
      ok: false,
      error:
        '구간 아카이브 파일이 아닙니다. 전체 백업은 「데이터 가져오기」를 사용하세요.',
    };
  }

  const validAppNames = [
    'Locker Manager System',
    'EQUUS Hotel Management System',
    'HIZZ Hotel Management System',
    'HOME24 Hotel Management System',
  ];
  if (!validAppNames.includes(importData.appName)) {
    return { ok: false, error: '이 파일은 호텔 관리 시스템 아카이브가 아닙니다.' };
  }

  return { ok: true, data: importData };
}

/** 아카이브 병합 전 미리보기 (파일만 파싱, DB 변경 없음) */
export function previewArchiveMerge(jsonString: string): {
  success: boolean;
  error?: string;
  archiveThrough?: string;
  archiveFrom?: string;
  exportDate?: string;
  counts?: Record<string, number>;
  total?: number;
} {
  const parsed = _parseArchivePayload(jsonString);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const counts: Record<string, number> = {};
  let total = 0;
  for (const tableName of ARCHIVE_MERGE_TABLES) {
    const rows = parsed.data.tables[tableName];
    const n = Array.isArray(rows) ? rows.length : 0;
    counts[tableName] = n;
    total += n;
  }

  return {
    success: true,
    archiveThrough: parsed.data.archiveThrough,
    archiveFrom: parsed.data.archiveFrom,
    exportDate: parsed.data.exportDate,
    counts,
    total,
  };
}

/**
 * 구간 아카이브를 현재 DB에 합침 (기존 데이터 유지).
 * 동일 PK가 있으면 건너뜀 (현재 데이터 우선).
 */
export function mergeArchiveDatabase(jsonString: string): {
  success: boolean;
  message?: string;
  error?: string;
  inserted?: number;
  skipped?: number;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  const parsed = _parseArchivePayload(jsonString);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const importData = parsed.data;

  try {
    let inserted = 0;
    let skipped = 0;

    const mergeTable = (tableName: string, data: any[]) => {
      if (!data || data.length === 0) return;

      let currentColumns: string[] = [];
      try {
        const schemaResult = db!.exec(`PRAGMA table_info(${tableName})`);
        if (schemaResult.length > 0) {
          currentColumns = schemaResult[0].values.map((row: any) => row[1] as string);
        }
      } catch (e) {
        console.warn(`[Archive merge] schema ${tableName}:`, e);
        return;
      }

      const backupColumns = Object.keys(data[0]);
      const columns =
        currentColumns.length > 0
          ? backupColumns.filter((col) => currentColumns.includes(col))
          : backupColumns;

      if (columns.length === 0) {
        console.warn(`[Archive merge] no columns for ${tableName}`);
        return;
      }

      const placeholders = columns.map(() => '?').join(', ');
      const columnNames = columns.join(', ');
      const insertQuery = `INSERT OR IGNORE INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;

      for (const row of data) {
        try {
          const values = columns.map((col) => (row[col] !== undefined ? row[col] : null));
          db!.run(insertQuery, values);
          const ch = db!.exec('SELECT changes() as c');
          const n = Number(ch[0]?.values?.[0]?.[0] ?? 0);
          if (n > 0) inserted += 1;
          else skipped += 1;
        } catch (error) {
          console.warn(`[Archive merge] row failed ${tableName}:`, error);
          skipped += 1;
        }
      }
    };

    for (const tableName of ARCHIVE_MERGE_TABLES) {
      if (importData.tables[tableName]) {
        mergeTable(tableName, importData.tables[tableName]);
      }
    }

    if (inserted === 0 && skipped === 0) {
      return { success: false, error: '아카이브에 합칠 데이터가 없습니다.' };
    }

    // 병합은 용량이 커지므로 VACUUM 생략 (속도). 저장만 수행.
    saveDatabase();

    const through = importData.archiveThrough || '?';
    return {
      success: true,
      inserted,
      skipped,
      message: `${through}까지 아카이브를 합쳤습니다. 추가 ${inserted.toLocaleString()}건` +
        (skipped > 0 ? `, 이미 있어 건너뜀 ${skipped.toLocaleString()}건` : '') +
        '. 정산·매출 화면에서 과거 기간을 확인할 수 있습니다.',
    };
  } catch (error) {
    console.error('Error merging archive:', error);
    return { success: false, error: `아카이브 병합 실패: ${String(error)}` };
  }
}

// Export RFID mappings only
export function exportRfidMappings(): {
  success: boolean;
  data?: string;
  error?: string;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  
  try {
    const exportData = {
      version: '1.0',
      type: 'rfid_mappings',
      exportDate: new Date().toISOString(),
      appName: APP_SYSTEM_NAME,
      mappings: [] as any[]
    };
    
    const result = db.exec(`SELECT * FROM rfid_mappings ORDER BY locker_number`);
    if (result.length > 0 && result[0].values.length > 0) {
      const columns = result[0].columns;
      exportData.mappings = result[0].values.map((row: any) => {
        const obj: any = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
    }
    
    return {
      success: true,
      data: JSON.stringify(exportData, null, 2)
    };
  } catch (error) {
    console.error('Error exporting RFID mappings:', error);
    return { success: false, error: String(error) };
  }
}

// Import RFID mappings only
export function importRfidMappings(jsonData: string): {
  success: boolean;
  message?: string;
  error?: string;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  
  try {
    const importData = JSON.parse(jsonData);
    
    if (importData.type !== 'rfid_mappings') {
      return { success: false, error: 'RFID 매핑 파일이 아닙니다.' };
    }
    
    if (!Array.isArray(importData.mappings)) {
      return { success: false, error: 'RFID 매핑 데이터가 없습니다.' };
    }
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const mapping of importData.mappings) {
      if (!mapping.rfid_uid || !mapping.locker_number) continue;
      
      // Check if already exists
      const existing = db.exec(
        `SELECT id FROM rfid_mappings WHERE rfid_uid = ? OR locker_number = ?`,
        [mapping.rfid_uid, mapping.locker_number]
      );
      
      if (existing.length > 0 && existing[0].values.length > 0) {
        skippedCount++;
        continue;
      }
      
      const id = mapping.id || `rfid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.run(
        `INSERT INTO rfid_mappings (id, rfid_uid, locker_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [id, mapping.rfid_uid, mapping.locker_number, mapping.created_at || new Date().toISOString(), new Date().toISOString()]
      );
      importedCount++;
    }
    
    saveDatabaseDebounced();
    
    return {
      success: true,
      message: `RFID 매핑 ${importedCount}개 가져오기 완료${skippedCount > 0 ? ` (중복 ${skippedCount}개 건너뜀)` : ''}`
    };
  } catch (error) {
    console.error('Error importing RFID mappings:', error);
    return { success: false, error: `가져오기 실패: ${String(error)}` };
  }
}

// Export barcode mappings only
export function exportBarcodeMappings(): {
  success: boolean;
  data?: string;
  error?: string;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  
  try {
    const exportData = {
      version: '1.0',
      type: 'barcode_mappings',
      exportDate: new Date().toISOString(),
      appName: APP_SYSTEM_NAME,
      mappings: [] as any[]
    };
    
    const result = db.exec(`SELECT * FROM barcode_mappings ORDER BY locker_number`);
    if (result.length > 0 && result[0].values.length > 0) {
      const columns = result[0].columns;
      exportData.mappings = result[0].values.map((row: any) => {
        const obj: any = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
    }
    
    return {
      success: true,
      data: JSON.stringify(exportData, null, 2)
    };
  } catch (error) {
    console.error('Error exporting barcode mappings:', error);
    return { success: false, error: String(error) };
  }
}

// Import barcode mappings only
export function importBarcodeMappings(jsonData: string): {
  success: boolean;
  message?: string;
  error?: string;
} {
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }
  
  try {
    const importData = JSON.parse(jsonData);
    
    if (importData.type !== 'barcode_mappings') {
      return { success: false, error: '바코드 매핑 파일이 아닙니다.' };
    }
    
    if (!Array.isArray(importData.mappings)) {
      return { success: false, error: '바코드 매핑 데이터가 없습니다.' };
    }
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const mapping of importData.mappings) {
      if (!mapping.barcode || !mapping.locker_number) continue;
      
      // Check if already exists
      const existing = db.exec(
        `SELECT id FROM barcode_mappings WHERE barcode = ? OR locker_number = ?`,
        [mapping.barcode, mapping.locker_number]
      );
      
      if (existing.length > 0 && existing[0].values.length > 0) {
        skippedCount++;
        continue;
      }
      
      const id = mapping.id || `barcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      db.run(
        `INSERT INTO barcode_mappings (id, barcode, locker_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [id, mapping.barcode, mapping.locker_number, mapping.created_at || new Date().toISOString(), new Date().toISOString()]
      );
      importedCount++;
    }
    
    saveDatabaseDebounced();
    
    return {
      success: true,
      message: `바코드 매핑 ${importedCount}개 가져오기 완료${skippedCount > 0 ? ` (중복 ${skippedCount}개 건너뜀)` : ''}`
    };
  } catch (error) {
    console.error('Error importing barcode mappings:', error);
    return { success: false, error: `가져오기 실패: ${String(error)}` };
  }
}

