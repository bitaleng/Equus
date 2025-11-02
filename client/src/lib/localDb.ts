import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

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
      
      // Check if 'direct_price' is already in the CHECK constraint
      if (!createSql.includes('direct_price')) {
        console.log('Migrating locker_logs table to add direct_price option...');
        
        try {
          // Create backup table
          db.run(`CREATE TABLE locker_logs_backup AS SELECT * FROM locker_logs`);
          
          // Drop old table
          db.run(`DROP TABLE locker_logs`);
          
          // Create new table with updated CHECK constraint
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
              payment_method TEXT CHECK(payment_method IN ('card', 'cash'))
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
      payment_method TEXT CHECK(payment_method IN ('card', 'cash'))
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
}): string {
  if (!db) throw new Error('Database not initialized');

  const id = generateId();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO locker_logs 
    (id, locker_number, entry_time, business_day, time_type, base_price, 
     option_type, option_amount, final_price, status, cancelled, notes, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?)`,
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
      entry.paymentMethod || null
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

  const [totalVisitors, totalSales, cancellations, totalDiscount, foreignerCount, foreignerSales, dayVisitors, nightVisitors] = result[0].values[0];

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
    nightPrice: 13000,
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
