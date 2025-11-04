import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { getTimeType } from '@shared/businessDay';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;

const DB_NAME = 'rest_hotel_db';

// Initialize SQL.js and load database from localStorage
export async function initDatabase(): Promise<Database> {
  if (db) return db;

  // Load SQL.js WASM from local file
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `/${file}`
    });
  }

  // Try to load existing database from localStorage
  const savedDb = localStorage.getItem(DB_NAME);
  if (savedDb) {
    const buf = Uint8Array.from(atob(savedDb), c => c.charCodeAt(0));
    db = new SQL.Database(buf);
    
    // Run migrations for existing databases
    migrateDatabase();
  } else {
    db = new SQL.Database();
    createTables();
  }

  return db;
}

// Save database to localStorage
export function saveDatabase() {
  if (!db) return;
  
  const data = db.export();
  const binary = String.fromCharCode.apply(null, Array.from(data));
  const base64 = btoa(binary);
  localStorage.setItem(DB_NAME, base64);
}

// Migrate existing database schema
function migrateDatabase() {
  if (!db) return;
  
  try {
    // Step 1: Ensure all tables exist first (before any ALTER operations)
    db.run(`
      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS locker_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_number INTEGER NOT NULL,
        end_number INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS locker_daily_summaries (
        business_day TEXT PRIMARY KEY,
        total_visitors INTEGER NOT NULL DEFAULT 0,
        total_sales INTEGER NOT NULL DEFAULT 0,
        cancellations INTEGER NOT NULL DEFAULT 0,
        total_discount INTEGER NOT NULL DEFAULT 0,
        foreigner_count INTEGER NOT NULL DEFAULT 0,
        foreigner_sales INTEGER NOT NULL DEFAULT 0,
        day_visitors INTEGER NOT NULL DEFAULT 0,
        night_visitors INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    // Step 2: Migrate locker_logs table if needed
    const result = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='locker_logs'`);
    
    if (result.length > 0 && result[0].values.length > 0) {
      const createSql = result[0].values[0][0] as string;
      
      // Check if 'direct_price' and 'transfer' are already in the CHECK constraints
      const needsMigration = !createSql.includes('direct_price') || !createSql.includes('transfer');
      
      if (needsMigration) {
        console.log('Migrating locker_logs table to add direct_price option and transfer payment method...');
        
        try {
          // Create backup table
          db.run(`CREATE TABLE locker_logs_backup AS SELECT * FROM locker_logs`);
          
          // Drop old table
          db.run(`DROP TABLE locker_logs`);
          
          // Create new table with updated CHECK constraints
          db.run(`
            CREATE TABLE locker_logs (
              id TEXT PRIMARY KEY,
              locker_number INTEGER NOT NULL,
              entry_time TEXT NOT NULL,
              exit_time TEXT,
              business_day TEXT NOT NULL,
              time_type TEXT NOT NULL CHECK(time_type IN ('주간', '야간')),
              base_price INTEGER NOT NULL,
              option_type TEXT NOT NULL CHECK(option_type IN ('none', 'discount', 'custom', 'foreigner', 'direct_price')),
              option_amount INTEGER,
              final_price INTEGER NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('in_use', 'checked_out', 'cancelled')),
              cancelled INTEGER NOT NULL DEFAULT 0,
              notes TEXT,
              payment_method TEXT CHECK(payment_method IN ('card', 'cash', 'transfer')),
              rental_items TEXT
            )
          `);
          
          // Copy data back
          db.run(`INSERT INTO locker_logs SELECT * FROM locker_logs_backup`);
          
          // Drop backup table
          db.run(`DROP TABLE locker_logs_backup`);
          
          console.log('Migration completed successfully!');
          saveDatabase();
        } catch (migrationError) {
          console.error('Locker logs migration failed:', migrationError);
          // Try to restore from backup if it exists
          try {
            db.run(`DROP TABLE IF EXISTS locker_logs`);
            db.run(`ALTER TABLE locker_logs_backup RENAME TO locker_logs`);
            console.log('Rollback successful');
          } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
          }
          throw migrationError;
        }
      }
    }
    
    // Step 3: Add missing columns to daily summaries (safe now that table exists)
    try {
      db.run(`ALTER TABLE locker_daily_summaries ADD COLUMN day_visitors INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.run(`ALTER TABLE locker_daily_summaries ADD COLUMN night_visitors INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 4: Add rental_items column to locker_logs (for tracking blanket/towel rentals)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN rental_items TEXT`);
      console.log('Added rental_items column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 5: Create additional_fee_events table (Stage 1 migration)
    db.run(`
      CREATE TABLE IF NOT EXISTS additional_fee_events (
        id TEXT PRIMARY KEY,
        locker_log_id TEXT NOT NULL,
        locker_number INTEGER NOT NULL,
        checkout_time TEXT NOT NULL,
        fee_amount INTEGER NOT NULL,
        business_day TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
        created_at TEXT NOT NULL
      )
    `);
    
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Create all tables
function createTables() {
  if (!db) return;

  // Locker logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS locker_logs (
      id TEXT PRIMARY KEY,
      locker_number INTEGER NOT NULL,
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      business_day TEXT NOT NULL,
      time_type TEXT NOT NULL CHECK(time_type IN ('주간', '야간')),
      base_price INTEGER NOT NULL,
      option_type TEXT NOT NULL CHECK(option_type IN ('none', 'discount', 'custom', 'foreigner', 'direct_price')),
      option_amount INTEGER,
      final_price INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('in_use', 'checked_out', 'cancelled')),
      cancelled INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      payment_method TEXT CHECK(payment_method IN ('card', 'cash', 'transfer')),
      rental_items TEXT
    )
  `);

  // Daily summaries table
  db.run(`
    CREATE TABLE IF NOT EXISTS locker_daily_summaries (
      business_day TEXT PRIMARY KEY,
      total_visitors INTEGER NOT NULL DEFAULT 0,
      total_sales INTEGER NOT NULL DEFAULT 0,
      cancellations INTEGER NOT NULL DEFAULT 0,
      total_discount INTEGER NOT NULL DEFAULT 0,
      foreigner_count INTEGER NOT NULL DEFAULT 0,
      foreigner_sales INTEGER NOT NULL DEFAULT 0,
      day_visitors INTEGER NOT NULL DEFAULT 0,
      night_visitors INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Locker groups table
  db.run(`
    CREATE TABLE IF NOT EXISTS locker_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_number INTEGER NOT NULL,
      end_number INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  // System metadata table
  db.run(`
    CREATE TABLE IF NOT EXISTS system_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Additional fee events table (Stage 1: fees recorded at checkout)
  db.run(`
    CREATE TABLE IF NOT EXISTS additional_fee_events (
      id TEXT PRIMARY KEY,
      locker_log_id TEXT NOT NULL,
      locker_number INTEGER NOT NULL,
      checkout_time TEXT NOT NULL,
      fee_amount INTEGER NOT NULL,
      business_day TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
      created_at TEXT NOT NULL
    )
  `);

  saveDatabase();
}

// Generate UUID
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Entry operations
export function createEntry(entry: {
  lockerNumber: number;
  timeType: string;
  basePrice: number;
  finalPrice: number;
  businessDay: string;
  optionType: string;
  optionAmount?: number;
  notes?: string;
  paymentMethod?: string;
  rentalItems?: string[];
}): string {
  if (!db) throw new Error('Database not initialized');

  const id = generateId();
  const now = new Date().toISOString();
  const rentalItemsJson = entry.rentalItems && entry.rentalItems.length > 0 
    ? JSON.stringify(entry.rentalItems) 
    : null;

  db.run(
    `INSERT INTO locker_logs 
    (id, locker_number, entry_time, business_day, time_type, base_price, 
     option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?)`,
    [
      id,
      entry.lockerNumber,
      now,
      entry.businessDay,
      entry.timeType,
      entry.basePrice,
      entry.optionType,
      entry.optionAmount || null,
      entry.finalPrice,
      entry.notes || null,
      entry.paymentMethod || null,
      rentalItemsJson
    ]
  );

  // Update daily summary
  updateDailySummary(entry.businessDay);
  saveDatabase();
  
  return id;
}

export function updateEntry(id: string, updates: any) {
  if (!db) throw new Error('Database not initialized');

  const sets: string[] = [];
  const values: any[] = [];

  if (updates.optionType !== undefined) {
    sets.push('option_type = ?');
    values.push(updates.optionType);
  }
  if (updates.optionAmount !== undefined) {
    sets.push('option_amount = ?');
    values.push(updates.optionAmount);
  }
  if (updates.finalPrice !== undefined) {
    sets.push('final_price = ?');
    values.push(updates.finalPrice);
  }
  if (updates.notes !== undefined) {
    sets.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.paymentMethod !== undefined) {
    sets.push('payment_method = ?');
    values.push(updates.paymentMethod);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.exitTime !== undefined) {
    sets.push('exit_time = ?');
    values.push(new Date(updates.exitTime).toISOString());
  }
  if (updates.cancelled !== undefined) {
    sets.push('cancelled = ?');
    values.push(updates.cancelled ? 1 : 0);
  }
  if (updates.rentalItems !== undefined) {
    sets.push('rental_items = ?');
    const rentalItemsJson = updates.rentalItems && updates.rentalItems.length > 0
      ? JSON.stringify(updates.rentalItems)
      : null;
    values.push(rentalItemsJson);
  }

  if (sets.length > 0) {
    values.push(id);
    db.run(
      `UPDATE locker_logs SET ${sets.join(', ')} WHERE id = ?`,
      values
    );

    // Get business day for this entry and update summary
    const result = db.exec('SELECT business_day FROM locker_logs WHERE id = ?', [id]);
    if (result.length > 0 && result[0].values.length > 0) {
      const businessDay = result[0].values[0][0] as string;
      updateDailySummary(businessDay);
    }

    saveDatabase();
  }
}

export function getActiveLockers() {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs WHERE status = 'in_use' ORDER BY entry_time DESC`
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

export function getTodayEntries(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE business_day = ? 
     ORDER BY entry_time DESC`,
    [businessDay]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

export function getEntriesByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE business_day >= ? AND business_day <= ?
     ORDER BY entry_time DESC`,
    [startDate, endDate]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

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

function updateDailySummary(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  // Get locker logs summary
  const result = db.exec(
    `SELECT 
      COUNT(*) as total_visitors,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN final_price ELSE 0 END), 0) as total_sales,
      COUNT(CASE WHEN cancelled = 1 THEN 1 END) as cancellations,
      COALESCE(SUM(CASE WHEN option_type IN ('discount', 'custom') AND status != 'cancelled' THEN option_amount ELSE 0 END), 0) as total_discount,
      COUNT(CASE WHEN option_type = 'foreigner' AND status != 'cancelled' THEN 1 END) as foreigner_count,
      COALESCE(SUM(CASE WHEN option_type = 'foreigner' AND status != 'cancelled' THEN final_price ELSE 0 END), 0) as foreigner_sales,
      COUNT(CASE WHEN time_type = '주간' AND status != 'cancelled' THEN 1 END) as day_visitors,
      COUNT(CASE WHEN time_type = '야간' AND status != 'cancelled' THEN 1 END) as night_visitors
    FROM locker_logs
    WHERE business_day = ?`,
    [businessDay]
  );

  if (result.length === 0 || result[0].values.length === 0) return;

  const [totalVisitors, baseSales, cancellations, totalDiscount, foreignerCount, foreignerSales, dayVisitors, nightVisitors] = result[0].values[0];

  // Get additional fee events for this business day (fees recorded at checkout time)
  const additionalFeeResult = db.exec(
    `SELECT COALESCE(SUM(fee_amount), 0) as additional_fee_total
     FROM additional_fee_events
     WHERE business_day = ?`,
    [businessDay]
  );
  
  const additionalFeeTotal = additionalFeeResult.length > 0 && additionalFeeResult[0].values.length > 0 
    ? additionalFeeResult[0].values[0][0] 
    : 0;

  // Total sales = base sales from locker_logs + additional fees from checkout time
  const totalSales = (baseSales as number) + (additionalFeeTotal as number);

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

// Locker Groups operations
export function getLockerGroups() {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec('SELECT * FROM locker_groups ORDER BY sort_order ASC');

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

export function createLockerGroup(group: {
  name: string;
  startNumber: number;
  endNumber: number;
  sortOrder?: number;
}): string {
  if (!db) throw new Error('Database not initialized');

  const id = generateId();
  const sortOrder = group.sortOrder ?? 0;

  db.run(
    `INSERT INTO locker_groups (id, name, start_number, end_number, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    [id, group.name, group.startNumber, group.endNumber, sortOrder]
  );

  saveDatabase();
  return id;
}

export function updateLockerGroup(id: string, updates: {
  name?: string;
  startNumber?: number;
  endNumber?: number;
  sortOrder?: number;
}) {
  if (!db) throw new Error('Database not initialized');

  const sets: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.startNumber !== undefined) {
    sets.push('start_number = ?');
    values.push(updates.startNumber);
  }
  if (updates.endNumber !== undefined) {
    sets.push('end_number = ?');
    values.push(updates.endNumber);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }

  if (sets.length > 0) {
    values.push(id);
    db.run(
      `UPDATE locker_groups SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    saveDatabase();
  }
}

export function deleteLockerGroup(id: string) {
  if (!db) throw new Error('Database not initialized');

  db.run('DELETE FROM locker_groups WHERE id = ?', [id]);
  saveDatabase();
}

// Helper function to convert SQL result rows to objects
function rowsToObjects(result: { columns: string[]; values: any[][] }): any[] {
  return result.values.map(row => {
    const obj: any = {};
    result.columns.forEach((col, idx) => {
      let value = row[idx];
      
      // Convert camelCase column names
      const camelCol = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      
      // Convert numeric strings to numbers where appropriate
      if (col.includes('number') || col.includes('price') || col.includes('amount') || col.includes('count') || col.includes('visitors') || col.includes('sales') || col.includes('order')) {
        value = typeof value === 'number' ? value : (value ? parseInt(value as string) : value);
      }
      
      // Convert boolean fields
      if (col === 'cancelled') {
        value = value === 1;
      }
      
      obj[camelCol] = value;
    });
    return obj;
  });
}

// Settings operations (using localStorage)
export function getSettings() {
  const defaultSettings = {
    businessDayStartHour: 10,
    dayPrice: 10000,
    nightPrice: 15000,
    discountAmount: 2000,
    foreignerPrice: 25000
  };

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

// Data management operations
export function clearAllData() {
  if (!db) throw new Error('Database not initialized');
  
  // Delete all locker logs and daily summaries (but keep locker groups and system metadata)
  db.run('DELETE FROM locker_logs');
  db.run('DELETE FROM locker_daily_summaries');
  
  saveDatabase();
}

export function deleteOldData(cutoffDate: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Delete entries older than cutoff date (1 year ago)
  db.run('DELETE FROM locker_logs WHERE business_day < ?', [cutoffDate]);
  db.run('DELETE FROM locker_daily_summaries WHERE business_day < ?', [cutoffDate]);
  
  saveDatabase();
}

export function getOldestEntryDate(): string | null {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT MIN(business_day) as oldest FROM locker_logs');
  
  if (result.length === 0 || result[0].values.length === 0 || !result[0].values[0][0]) {
    return null;
  }
  
  return result[0].values[0][0] as string;
}

// Test data generation for time-based features
export function createTestData() {
  if (!db) throw new Error('Database not initialized');
  
  const settings = getSettings();
  const { dayPrice, nightPrice, businessDayStartHour, discountAmount, foreignerPrice } = settings;
  
  // Helper function to format date for business day
  const getBusinessDay = (date: Date): string => {
    const hour = date.getHours();
    if (hour < businessDayStartHour) {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  };
  
  // Random helpers
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randomBoolean = (probability = 0.5) => Math.random() < probability;
  
  // Delete existing test data (locker numbers 1-80)
  db.run('DELETE FROM locker_logs WHERE locker_number BETWEEN 1 AND 80');
  
  const now = new Date();
  const currentHour = now.getHours();
  const isCurrentlyDaytime = getTimeType(now) === '주간';
  
  console.log('=== 테스트 데이터 생성 시작 ===');
  console.log('현재 시각:', now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
  console.log('현재 시간대:', getTimeType(now));
  
  // 중복 방지: 각 락커당 하나의 entry만 생성
  const usedLockers = new Set<number>();
  
  const paymentMethods: Array<'card' | 'cash' | 'transfer'> = ['card', 'cash', 'transfer'];
  const optionTypes: Array<'none' | 'discount' | 'foreigner'> = ['none', 'discount', 'foreigner'];
  
  // Helper: Get unused random locker number
  const getUnusedLocker = (): number | null => {
    if (usedLockers.size >= 80) return null;
    let lockerNumber: number;
    do {
      lockerNumber = randomInt(1, 80);
    } while (usedLockers.has(lockerNumber));
    usedLockers.add(lockerNumber);
    return lockerNumber;
  };
  
  let totalGenerated = 0;
  let additionalFee1Count = 0; // 추가요금 1회 카운터
  let additionalFee2PlusCount = 0; // 추가요금 2회 이상 카운터
  const database = db;
  
  // 먼저 추가요금 발생 데이터를 제한된 개수만큼 생성
  console.log('\n추가요금 1회 데이터 2개 생성 중...');
  // 1. 추가요금 1회 데이터 (1일 전 입실, 최대 2개)
  for (let i = 0; i < 2; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    const daysAgo = 1;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    
    const hour = randomInt(0, 23);
    const minute = randomInt(0, 59);
    
    const entryDate = new Date(targetDate);
    entryDate.setHours(hour, minute, 0, 0);
    
    const timeType = getTimeType(entryDate);
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} (1일 전) → timeType: ${timeType}, basePrice: ${basePrice}`);
    
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = foreignerPrice - basePrice;
      finalPrice = foreignerPrice;
    }
    
    const paymentMethod = randomElement(paymentMethods);
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?)`,
      [id, lockerNumber, entryTime, null, businessDay, timeType, basePrice, optionType, optionAmount, finalPrice, '테스트: 추가요금 1회', paymentMethod, null]
    );
    
    totalGenerated++;
    additionalFee1Count++;
    updateDailySummary(businessDay);
  }
  
  // 2. 추가요금 2회 이상 데이터 (2~3일 전 입실, 최대 2개)
  console.log('\n추가요금 2회+ 데이터 2개 생성 중...');
  for (let i = 0; i < 2; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    const daysAgo = randomInt(2, 3);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    
    const hour = randomInt(0, 23);
    const minute = randomInt(0, 59);
    
    const entryDate = new Date(targetDate);
    entryDate.setHours(hour, minute, 0, 0);
    
    const timeType = getTimeType(entryDate);
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} (${daysAgo}일 전) → timeType: ${timeType}, basePrice: ${basePrice}`);
    
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = foreignerPrice - basePrice;
      finalPrice = foreignerPrice;
    }
    
    const paymentMethod = randomElement(paymentMethods);
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?)`,
      [id, lockerNumber, entryTime, null, businessDay, timeType, basePrice, optionType, optionAmount, finalPrice, '테스트: 추가요금 2회+', paymentMethod, null]
    );
    
    totalGenerated++;
    additionalFee2PlusCount++;
    updateDailySummary(businessDay);
  }
  
  // 3. 나머지는 오늘 데이터만 생성 (추가요금 발생하지 않도록)
  // 현재 시각 기준으로 과거 시간만 생성
  const remainingLockers = 80 - usedLockers.size;
  
  // 주간과 야간을 반반씩 생성하도록
  const dayEntries = Math.floor(remainingLockers / 2);
  const nightEntries = remainingLockers - dayEntries;
  
  // 주간 데이터 생성 (오전 7시부터 현재 시각까지만)
  console.log(`\n주간 데이터 ${dayEntries}개 생성 중...`);
  for (let i = 0; i < dayEntries; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    // 현재 시각보다 이전 시간으로만 생성
    const minHour = 7;
    const maxHour = Math.min(currentHour, 18); // 현재 시각과 18시 중 작은 값
    
    // 만약 현재가 오전 7시 이전이면 주간 데이터 생성 불가
    if (maxHour < minHour) continue;
    
    const hour = randomInt(minHour, maxHour);
    const maxMinute = (hour === currentHour) ? now.getMinutes() : 59; // 현재 시각이면 현재 분까지만
    const minute = randomInt(0, maxMinute);
    
    const entryDate = new Date();
    entryDate.setHours(hour, minute, 0, 0);
    
    const timeType = getTimeType(entryDate); // 실제 입실 시각으로 판단
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    if (i < 3) { // 처음 3개만 로그 출력
      console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} → timeType: ${timeType}, basePrice: ${basePrice}`);
    }
    
    // Random option type
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = foreignerPrice - basePrice;
      finalPrice = foreignerPrice;
    }
    
    // Random payment method
    const paymentMethod = randomElement(paymentMethods);
    
    // Most are in_use (today's data)
    const status = 'in_use';
    const exitTime = null;
    
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id,
        lockerNumber,
        entryTime,
        exitTime,
        businessDay,
        timeType,
        basePrice,
        optionType,
        optionAmount,
        finalPrice,
        status,
        '테스트 데이터',
        paymentMethod,
        null
      ]
    );
    
    totalGenerated++;
    
    // Update daily summary for this business day
    updateDailySummary(businessDay);
  }
  
  // 야간 데이터 생성 (어제 저녁 19시 ~ 오늘 오전 7시)
  console.log(`\n야간 데이터 ${nightEntries}개 생성 중...`);
  for (let i = 0; i < nightEntries; i++) {
    const lockerNumber = getUnusedLocker();
    if (!lockerNumber) break;
    
    let entryDate: Date;
    let hour: number;
    let minute: number;
    
    // 50% 확률로 오늘 새벽 또는 어제 저녁
    if (randomBoolean()) {
      // 오늘 새벽 (0-6시, 현재가 7시 이전이면 현재 시각까지)
      const maxNightHour = currentHour < 7 ? currentHour : 6;
      if (maxNightHour < 0) continue; // 현재가 자정 이전이면 스킵
      
      hour = randomInt(0, maxNightHour);
      const maxMinute = (hour === currentHour && currentHour < 7) ? now.getMinutes() : 59;
      minute = randomInt(0, maxMinute);
      
      entryDate = new Date();
      entryDate.setHours(hour, minute, 0, 0);
    } else {
      // 어제 저녁 (19-23시)
      hour = randomInt(19, 23);
      minute = randomInt(0, 59);
      
      entryDate = new Date();
      entryDate.setDate(entryDate.getDate() - 1); // 어제
      entryDate.setHours(hour, minute, 0, 0);
    }
    
    const timeType = getTimeType(entryDate); // 실제 입실 시각으로 판단
    const basePrice = timeType === '주간' ? dayPrice : nightPrice;
    
    if (i < 3) { // 처음 3개만 로그 출력
      console.log(`  락커${lockerNumber}: ${entryDate.toLocaleString('ko-KR')} → timeType: ${timeType}, basePrice: ${basePrice}`);
    }
    
    // Random option type
    const optionType = randomElement(optionTypes);
    let optionAmount = null;
    let finalPrice = basePrice;
    
    if (optionType === 'discount') {
      optionAmount = -discountAmount;
      finalPrice = basePrice - discountAmount;
    } else if (optionType === 'foreigner') {
      optionAmount = foreignerPrice - basePrice;
      finalPrice = foreignerPrice;
    }
    
    // Random payment method
    const paymentMethod = randomElement(paymentMethods);
    
    // Most are in_use (today's data)
    const status = 'in_use';
    const exitTime = null;
    
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id,
        lockerNumber,
        entryTime,
        exitTime,
        businessDay,
        timeType,
        basePrice,
        optionType,
        optionAmount,
        finalPrice,
        status,
        '테스트 데이터',
        paymentMethod,
        null
      ]
    );
    
    totalGenerated++;
    
    // Update daily summary for this business day
    updateDailySummary(businessDay);
  }
  
  // 4. 과거 데이터는 퇴실 완료된 데이터로만 생성 (추가요금 방지)
  for (let pastDays = 1; pastDays <= 7; pastDays++) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - pastDays);
    
    const pastEntries = randomInt(10, 30);
    
    for (let i = 0; i < pastEntries; i++) {
      const lockerNumber = randomInt(1, 80);
      const hour = randomInt(0, 23);
      const minute = randomInt(0, 59);
      
      const entryDate = new Date(pastDate);
      entryDate.setHours(hour, minute, 0, 0);
      
      const timeType = getTimeType(entryDate);
      const basePrice = timeType === '주간' ? dayPrice : nightPrice;
      
      const optionType = randomElement(optionTypes);
      let optionAmount = null;
      let finalPrice = basePrice;
      
      if (optionType === 'discount') {
        optionAmount = -discountAmount;
        finalPrice = basePrice - discountAmount;
      } else if (optionType === 'foreigner') {
        optionAmount = foreignerPrice - basePrice;
        finalPrice = foreignerPrice;
      }
      
      const paymentMethod = randomElement(paymentMethods);
      
      // 과거 데이터는 모두 퇴실 완료 상태
      const status = 'checked_out';
      const exitTime = new Date(entryDate.getTime() + randomInt(30, 180) * 60000).toISOString();
      
      const id = generateId();
      const entryTime = entryDate.toISOString();
      const businessDay = getBusinessDay(entryDate);
      
      database.run(
        `INSERT INTO locker_logs 
        (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
         option_type, option_amount, final_price, status, cancelled, notes, payment_method, rental_items)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
          id,
          lockerNumber,
          entryTime,
          exitTime,
          businessDay,
          timeType,
          basePrice,
          optionType,
          optionAmount,
          finalPrice,
          status,
          '테스트 데이터 (퇴실완료)',
          paymentMethod,
          null
        ]
      );
      
      totalGenerated++;
      updateDailySummary(businessDay);
    }
  }
  
  saveDatabase();
  
  console.log(`테스트 데이터 생성 완료: 총 ${totalGenerated}건 (과거 7일치, 락커 #1~80)`);
  console.log(`- 추가요금 1회: ${additionalFee1Count}건 (오렌지)`);
  console.log(`- 추가요금 2회+: ${additionalFee2PlusCount}건 (레드)`);
}

// ===== Stage 1: Additional Fee Events =====

export function createAdditionalFeeEvent(event: {
  lockerLogId: string;
  lockerNumber: number;
  checkoutTime: Date;
  feeAmount: number;
  businessDay: string;
  paymentMethod: string;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const checkoutTimeStr = event.checkoutTime.toISOString();
  const createdAt = new Date().toISOString();
  
  db.run(
    `INSERT INTO additional_fee_events 
    (id, locker_log_id, locker_number, checkout_time, fee_amount, business_day, payment_method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, event.lockerLogId, event.lockerNumber, checkoutTimeStr, event.feeAmount, event.businessDay, event.paymentMethod, createdAt]
  );
  
  saveDatabase();
  return id;
}

export function getAdditionalFeeEventsByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events WHERE business_day = ? ORDER BY checkout_time DESC`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

export function getAdditionalFeeEventsByLockerLog(lockerLogId: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events WHERE locker_log_id = ? ORDER BY created_at DESC`,
    [lockerLogId]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

export function getAllAdditionalFeeEvents() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events ORDER BY checkout_time DESC`
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    businessDay: row[5],
    paymentMethod: row[6],
    createdAt: row[7],
  }));
}

export function getTotalAdditionalFeesByBusinessDay(businessDay: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT COALESCE(SUM(fee_amount), 0) as total FROM additional_fee_events WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  
  return result[0].values[0][0] as number;
}
