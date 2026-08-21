import { db, saveDatabaseDebounced } from './core';
import { getBusinessDay } from '@shared/businessDay';

// ============================================================================
// Barcode Mappings (바코드 매핑 관리)
// ============================================================================

export function saveBarcodeMapping(barcode: string, lockerNumber: number): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    
    // Check if barcode already exists
    const existing = db.exec(
      'SELECT id, locker_number FROM barcode_mappings WHERE barcode = ?',
      [barcode]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update existing mapping
      const existingLockerNumber = existing[0].values[0][1] as number;
      
      if (existingLockerNumber === lockerNumber) {
        // Same mapping already exists
        return true;
      }
      
      // Update to new locker number
      db.run(
        'UPDATE barcode_mappings SET locker_number = ?, updated_at = ? WHERE barcode = ?',
        [lockerNumber, now, barcode]
      );
    } else {
      // Insert new mapping
      db.run(
        'INSERT INTO barcode_mappings (id, barcode, locker_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, barcode, lockerNumber, now, now]
      );
    }
    
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error saving barcode mapping:', error);
    return false;
  }
}

export function getLockerNumberByBarcode(barcode: string): number | null {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      'SELECT locker_number FROM barcode_mappings WHERE barcode = ?',
      [barcode]
    );
    
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting locker number by barcode:', error);
    return null;
  }
}

export function getBarcodeByLockerNumber(lockerNumber: number): string | null {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      'SELECT barcode FROM barcode_mappings WHERE locker_number = ?',
      [lockerNumber]
    );
    
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as string;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting barcode by locker number:', error);
    return null;
  }
}

export function getAllBarcodeMappings(): Array<{
  id: string;
  barcode: string;
  lockerNumber: number;
  createdAt: string;
  updatedAt: string;
}> {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      'SELECT id, barcode, locker_number, created_at, updated_at FROM barcode_mappings ORDER BY locker_number'
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    
    return result[0].values.map((row: any) => ({
      id: row[0],
      barcode: row[1],
      lockerNumber: row[2],
      createdAt: row[3],
      updatedAt: row[4],
    }));
  } catch (error) {
    console.error('Error getting all barcode mappings:', error);
    return [];
  }
}

export function deleteBarcodeMapping(barcode: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    db.run('DELETE FROM barcode_mappings WHERE barcode = ?', [barcode]);
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error deleting barcode mapping:', error);
    return false;
  }
}

export function deleteBarcodeMappingById(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    db.run('DELETE FROM barcode_mappings WHERE id = ?', [id]);
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error deleting barcode mapping by id:', error);
    return false;
  }
}

// ============================================================================
// RFID Mappings (RFID 매핑 관리)
// ============================================================================

export function saveRfidMapping(rfidUid: string, lockerNumber: number): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    
    // Check if RFID UID already exists
    const existing = db.exec(
      'SELECT id, locker_number FROM rfid_mappings WHERE rfid_uid = ?',
      [rfidUid]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      // Update existing mapping
      const existingLockerNumber = existing[0].values[0][1] as number;
      
      if (existingLockerNumber === lockerNumber) {
        // Same mapping already exists
        return true;
      }
      
      // Update to new locker number
      db.run(
        'UPDATE rfid_mappings SET locker_number = ?, updated_at = ? WHERE rfid_uid = ?',
        [lockerNumber, now, rfidUid]
      );
    } else {
      // Insert new mapping
      db.run(
        'INSERT INTO rfid_mappings (id, rfid_uid, locker_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, rfidUid, lockerNumber, now, now]
      );
    }
    
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error saving RFID mapping:', error);
    return false;
  }
}

export function getLockerNumberByRfid(rfidUid: string): number | null {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      'SELECT locker_number FROM rfid_mappings WHERE rfid_uid = ?',
      [rfidUid]
    );
    
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting locker number by RFID:', error);
    return null;
  }
}

export function getRfidByLockerNumber(lockerNumber: number): string | null {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      'SELECT rfid_uid FROM rfid_mappings WHERE locker_number = ?',
      [lockerNumber]
    );
    
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as string;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting RFID by locker number:', error);
    return null;
  }
}

export function getAllRfidMappings(): Array<{
  id: string;
  rfidUid: string;
  lockerNumber: number;
  createdAt: string;
  updatedAt: string;
}> {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      'SELECT id, rfid_uid, locker_number, created_at, updated_at FROM rfid_mappings ORDER BY locker_number'
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    
    return result[0].values.map((row: any) => ({
      id: row[0],
      rfidUid: row[1],
      lockerNumber: row[2],
      createdAt: row[3],
      updatedAt: row[4],
    }));
  } catch (error) {
    console.error('Error getting all RFID mappings:', error);
    return [];
  }
}

export function deleteRfidMapping(rfidUid: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    db.run('DELETE FROM rfid_mappings WHERE rfid_uid = ?', [rfidUid]);
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error deleting RFID mapping:', error);
    return false;
  }
}

export function deleteRfidMappingById(id: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    db.run('DELETE FROM rfid_mappings WHERE id = ?', [id]);
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error deleting RFID mapping by id:', error);
    return false;
  }
}

// ==================== Scan Logs Management ====================

export interface ScanLog {
  id: string;
  lockerNumber: number;
  scanTime: string;
  businessDay: string;
  processed: number;
}

// Add scan log when barcode is scanned
export function addScanLog(lockerNumber: number): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = crypto.randomUUID();
  const now = new Date();
  const scanTime = now.toISOString();
  const businessDay = getBusinessDay(now);
  
  try {
    db.run(
      `INSERT INTO scan_logs (id, locker_number, scan_time, business_day, processed)
       VALUES (?, ?, ?, ?, 0)`,
      [id, lockerNumber, scanTime, businessDay]
    );
    // scan_log는 고빈도 쓰기이므로 debounce 저장 (바코드 연속 스캔 시 중복 저장 방지)
    saveDatabaseDebounced();
    return id;
  } catch (error) {
    console.error('Error adding scan log:', error);
    throw error;
  }
}

// Get scan logs with optional date filtering
export function getScanLogs(startDate?: string, endDate?: string): ScanLog[] {
  if (!db) throw new Error('Database not initialized');
  
  try {
    let query = 'SELECT * FROM scan_logs';
    const params: any[] = [];
    
    if (startDate && endDate) {
      query += ' WHERE scan_time >= ? AND scan_time < ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' WHERE scan_time >= ?';
      params.push(startDate);
    } else if (endDate) {
      query += ' WHERE scan_time < ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY scan_time DESC';
    
    const result = db.exec(query, params);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    
    return result[0].values.map((row: any) => ({
      id: row[0],
      lockerNumber: row[1],
      scanTime: row[2],
      businessDay: row[3],
      processed: row[4],
    }));
  } catch (error) {
    console.error('Error getting scan logs:', error);
    return [];
  }
}

// Mark scan as processed when check-in is completed
export function markScanAsProcessed(scanId: string): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    db.run(
      'UPDATE scan_logs SET processed = 1 WHERE id = ?',
      [scanId]
    );
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error marking scan as processed:', error);
    return false;
  }
}

// Get unprocessed scans (scans without check-in)
export function getUnprocessedScans(businessDay?: string): ScanLog[] {
  if (!db) throw new Error('Database not initialized');
  
  try {
    let query = 'SELECT * FROM scan_logs WHERE processed = 0';
    const params: any[] = [];
    
    if (businessDay) {
      query += ' AND business_day = ?';
      params.push(businessDay);
    }
    
    query += ' ORDER BY scan_time DESC';
    
    const result = db.exec(query, params);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    
    return result[0].values.map((row: any) => ({
      id: row[0],
      lockerNumber: row[1],
      scanTime: row[2],
      businessDay: row[3],
      processed: row[4],
    }));
  } catch (error) {
    console.error('Error getting unprocessed scans:', error);
    return [];
  }
}

// Get scan statistics for a business day
export function getScanStats(businessDay: string): {
  totalScans: number;
  processedScans: number;
  unprocessedScans: number;
} {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) as unprocessed
       FROM scan_logs
       WHERE business_day = ?`,
      [businessDay]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { totalScans: 0, processedScans: 0, unprocessedScans: 0 };
    }
    
    const row = result[0].values[0];
    return {
      totalScans: row[0] as number,
      processedScans: row[1] as number,
      unprocessedScans: row[2] as number,
    };
  } catch (error) {
    console.error('Error getting scan stats:', error);
    return { totalScans: 0, processedScans: 0, unprocessedScans: 0 };
  }
}

// Get the scan time of the most recent unprocessed scan for a locker
// This is used to record the entry time as the time the dialog was opened (scan time)
// instead of the time the check-in button was pressed
export function getLatestUnprocessedScanTime(lockerNumber: number): Date | null {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const result = db.exec(
      `SELECT scan_time FROM scan_logs 
       WHERE locker_number = ? AND processed = 0 
       ORDER BY scan_time DESC 
       LIMIT 1`,
      [lockerNumber]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const scanTimeStr = result[0].values[0][0] as string;
    return new Date(scanTimeStr);
  } catch (error) {
    console.error('Error getting latest unprocessed scan time:', error);
    return null;
  }
}

// Mark the most recent unprocessed scan for a locker as processed
export function markLatestScanAsProcessedByLocker(lockerNumber: number): boolean {
  if (!db) throw new Error('Database not initialized');
  
  try {
    // Find the most recent unprocessed scan for this locker
    const result = db.exec(
      `SELECT id FROM scan_logs 
       WHERE locker_number = ? AND processed = 0 
       ORDER BY scan_time DESC 
       LIMIT 1`,
      [lockerNumber]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      // No unprocessed scan found - this is normal (e.g., manual locker click without barcode scan)
      return false;
    }
    
    const scanId = result[0].values[0][0] as string;
    
    // Mark it as processed
    db.run(
      'UPDATE scan_logs SET processed = 1 WHERE id = ?',
      [scanId]
    );
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error marking latest scan as processed:', error);
    return false;
  }
}

// Export all database tables and localStorage settings to JSON
