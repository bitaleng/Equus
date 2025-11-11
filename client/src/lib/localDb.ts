import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { getTimeType, getBusinessDayRange, getBusinessDay, calculateAdditionalFee } from '@shared/businessDay';

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
  
  // Convert to binary string in chunks to avoid "Maximum call stack size exceeded"
  const chunkSize = 65535; // Safe chunk size for String.fromCharCode
  let binary = '';
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
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
    
    // Step 4.5: Add mixed payment columns to all tables
    // locker_logs
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN payment_cash INTEGER`);
      console.log('Added payment_cash column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN payment_card INTEGER`);
      console.log('Added payment_card column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN payment_transfer INTEGER`);
      console.log('Added payment_transfer column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 4.6: Add additional_fees column to locker_logs (for tracking overtime fees on same business day)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN additional_fees INTEGER DEFAULT 0`);
      console.log('Added additional_fees column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // additional_fee_events
    try {
      db.run(`ALTER TABLE additional_fee_events ADD COLUMN payment_cash INTEGER`);
    } catch (e) {}
    try {
      db.run(`ALTER TABLE additional_fee_events ADD COLUMN payment_card INTEGER`);
    } catch (e) {}
    try {
      db.run(`ALTER TABLE additional_fee_events ADD COLUMN payment_transfer INTEGER`);
    } catch (e) {}
    
    // rental_transactions
    try {
      db.run(`ALTER TABLE rental_transactions ADD COLUMN payment_cash INTEGER`);
    } catch (e) {}
    try {
      db.run(`ALTER TABLE rental_transactions ADD COLUMN payment_card INTEGER`);
    } catch (e) {}
    try {
      db.run(`ALTER TABLE rental_transactions ADD COLUMN payment_transfer INTEGER`);
    } catch (e) {}
    
    // expenses
    try {
      db.run(`ALTER TABLE expenses ADD COLUMN payment_cash INTEGER`);
    } catch (e) {}
    try {
      db.run(`ALTER TABLE expenses ADD COLUMN payment_card INTEGER`);
    } catch (e) {}
    try {
      db.run(`ALTER TABLE expenses ADD COLUMN payment_transfer INTEGER`);
    } catch (e) {}
    
    // Step 4.6: Backfill existing records with mixed payment data based on legacy payment_method
    console.log('[Migration] Backfilling mixed payment columns for existing records...');
    
    // Backfill locker_logs
    try {
      db.run(`
        UPDATE locker_logs
        SET payment_cash = CASE 
              WHEN payment_method = 'cash' THEN final_price 
              WHEN payment_method IS NULL AND final_price > 0 THEN final_price
              ELSE NULL 
            END,
            payment_card = CASE WHEN payment_method = 'card' THEN final_price ELSE NULL END,
            payment_transfer = CASE WHEN payment_method = 'transfer' THEN final_price ELSE NULL END
        WHERE payment_cash IS NULL AND payment_card IS NULL AND payment_transfer IS NULL
      `);
      console.log('[Migration] Backfilled locker_logs');
    } catch (e) {
      console.error('[Migration] Failed to backfill locker_logs:', e);
    }
    
    // Backfill additional_fee_events
    try {
      db.run(`
        UPDATE additional_fee_events
        SET payment_cash = CASE 
              WHEN payment_method = 'cash' THEN fee_amount 
              WHEN payment_method IS NULL AND fee_amount > 0 THEN fee_amount
              ELSE NULL 
            END,
            payment_card = CASE WHEN payment_method = 'card' THEN fee_amount ELSE NULL END,
            payment_transfer = CASE WHEN payment_method = 'transfer' THEN fee_amount ELSE NULL END
        WHERE payment_cash IS NULL AND payment_card IS NULL AND payment_transfer IS NULL
      `);
      console.log('[Migration] Backfilled additional_fee_events');
    } catch (e) {
      console.error('[Migration] Failed to backfill additional_fee_events:', e);
    }
    
    // Backfill rental_transactions
    try {
      db.run(`
        UPDATE rental_transactions
        SET payment_cash = CASE 
              WHEN payment_method = 'cash' THEN revenue 
              WHEN payment_method IS NULL AND revenue > 0 THEN revenue
              ELSE NULL 
            END,
            payment_card = CASE WHEN payment_method = 'card' THEN revenue ELSE NULL END,
            payment_transfer = CASE WHEN payment_method = 'transfer' THEN revenue ELSE NULL END
        WHERE payment_cash IS NULL AND payment_card IS NULL AND payment_transfer IS NULL
      `);
      console.log('[Migration] Backfilled rental_transactions');
    } catch (e) {
      console.error('[Migration] Failed to backfill rental_transactions:', e);
    }
    
    // Backfill expenses
    try {
      db.run(`
        UPDATE expenses
        SET payment_cash = CASE 
              WHEN payment_method = 'cash' THEN amount 
              WHEN payment_method IS NULL AND amount > 0 THEN amount
              ELSE NULL 
            END,
            payment_card = CASE WHEN payment_method = 'card' THEN amount ELSE NULL END,
            payment_transfer = CASE WHEN payment_method = 'transfer' THEN amount ELSE NULL END
        WHERE payment_cash IS NULL AND payment_card IS NULL AND payment_transfer IS NULL
      `);
      console.log('[Migration] Backfilled expenses');
    } catch (e) {
      console.error('[Migration] Failed to backfill expenses:', e);
    }
    
    console.log('[Migration] Backfill complete');
    
    // Step 4.65: Normalize all timestamps to ISO-8601 UTC format
    console.log('[Migration] Normalizing all timestamps to ISO-8601 UTC format...');
    
    try {
      // Check if migration has already been run
      const migrationCheck = db.exec(`SELECT value FROM system_metadata WHERE key = 'timestamp_normalized'`);
      const alreadyNormalized = migrationCheck.length > 0 && migrationCheck[0].values.length > 0;
      
      if (!alreadyNormalized) {
        // Normalize locker_logs timestamps
        db.run(`
          UPDATE locker_logs
          SET entry_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(entry_time))
          WHERE entry_time NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE locker_logs
          SET exit_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(exit_time))
          WHERE exit_time IS NOT NULL AND exit_time NOT LIKE '%T%'
        `);
        
        console.log('[Migration] Normalized locker_logs timestamps');
        
        // Normalize additional_fee_events timestamps
        db.run(`
          UPDATE additional_fee_events
          SET checkout_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(checkout_time))
          WHERE checkout_time NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE additional_fee_events
          SET created_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(created_at))
          WHERE created_at IS NOT NULL AND created_at NOT LIKE '%T%'
        `);
        
        console.log('[Migration] Normalized additional_fee_events timestamps');
        
        // Normalize rental_transactions timestamps
        db.run(`
          UPDATE rental_transactions
          SET rental_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(rental_time))
          WHERE rental_time NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE rental_transactions
          SET return_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(return_time))
          WHERE return_time IS NOT NULL AND return_time NOT LIKE '%T%'
        `);
        
        console.log('[Migration] Normalized rental_transactions timestamps');
        
        // Normalize expenses timestamps
        db.run(`
          UPDATE expenses
          SET created_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(created_at))
          WHERE created_at IS NOT NULL AND created_at NOT LIKE '%T%'
        `);
        
        console.log('[Migration] Normalized expenses timestamps');
        
        // Normalize closing_days timestamps
        db.run(`
          UPDATE closing_days
          SET start_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(start_time))
          WHERE start_time NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE closing_days
          SET end_time = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(end_time))
          WHERE end_time NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE closing_days
          SET created_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(created_at))
          WHERE created_at IS NOT NULL AND created_at NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE closing_days
          SET updated_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(updated_at))
          WHERE updated_at IS NOT NULL AND updated_at NOT LIKE '%T%'
        `);
        
        db.run(`
          UPDATE closing_days
          SET confirmed_at = strftime('%Y-%m-%dT%H:%M:%S.000Z', datetime(confirmed_at))
          WHERE confirmed_at IS NOT NULL AND confirmed_at NOT LIKE '%T%'
        `);
        
        console.log('[Migration] Normalized closing_days timestamps');
        
        // Mark migration as complete
        db.run(`
          INSERT OR REPLACE INTO system_metadata (key, value)
          VALUES ('timestamp_normalized', 'true')
        `);
        
        console.log('[Migration] Timestamp normalization complete - all timestamps now in ISO-8601 UTC format');
        saveDatabase();
      } else {
        console.log('[Migration] Timestamp normalization already completed, skipping');
      }
    } catch (e) {
      console.error('[Migration] Failed to normalize timestamps:', e);
    }
    
    // Step 4.7: Add discount fields to additional_fee_events
    try {
      db.run(`ALTER TABLE additional_fee_events ADD COLUMN original_fee_amount INTEGER`);
      console.log('Added original_fee_amount column to additional_fee_events');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.run(`ALTER TABLE additional_fee_events ADD COLUMN discount_amount INTEGER DEFAULT 0`);
      console.log('Added discount_amount column to additional_fee_events');
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
        original_fee_amount INTEGER,
        discount_amount INTEGER DEFAULT 0,
        business_day TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
        payment_cash INTEGER,
        payment_card INTEGER,
        payment_transfer INTEGER,
        created_at TEXT NOT NULL
      )
    `);
    
    // Step 6: Create additional_revenue_items table (rental items)
    db.run(`
      CREATE TABLE IF NOT EXISTS additional_revenue_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rental_fee INTEGER NOT NULL DEFAULT 0,
        deposit_amount INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Step 7: Migrate rental_transactions table (one-time migration)
    // Check if migration has already been done
    const migrationCheck = db.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='rental_transactions'
    `);
    
    if (migrationCheck.length > 0) {
      // Table exists, check if it has the new schema
      const schemaCheck = db.exec(`PRAGMA table_info(rental_transactions)`);
      const columns = schemaCheck.length > 0 && schemaCheck[0].values ? schemaCheck[0].values : [];
      const hasRevenueColumn = columns.some((row: any) => row[1] === 'revenue');
      
      // Check if return_time is nullable (notnull = 0 means nullable, notnull = 1 means NOT NULL)
      const returnTimeInfo = columns.find((row: any) => row[1] === 'return_time');
      const isReturnTimeNullable = returnTimeInfo ? returnTimeInfo[3] === 0 : false; // row[3] is the 'notnull' field
      
      // Check if deposit_status CHECK constraint includes 'none'
      const tableCheck = db.exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name='rental_transactions'`);
      const tableSql = tableCheck.length > 0 && tableCheck[0].values.length > 0 ? tableCheck[0].values[0][0] as string : '';
      const hasNoneDepositStatus = tableSql.includes("'none'");
      
      console.log('[Migration] rental_transactions check:', { 
        hasRevenueColumn, 
        isReturnTimeNullable,
        hasNoneDepositStatus,
        returnTimeInfo: returnTimeInfo ? `notnull=${returnTimeInfo[3]}` : 'not found'
      });
      
      // Need migration if missing revenue column OR return_time is not nullable OR missing 'none' deposit status
      if (!hasRevenueColumn || !isReturnTimeNullable || !hasNoneDepositStatus) {
        console.log('[Migration] Starting rental_transactions migration...');
        // Old schema detected, need to migrate
        // Since SQLite doesn't support easy column rename/restructure, we need to:
        // 1. Rename old table
        // 2. Create new table
        // 3. Copy data (if any)
        // 4. Drop old table
        
        db.run('ALTER TABLE rental_transactions RENAME TO rental_transactions_old');
        
        db.run(`
          CREATE TABLE rental_transactions (
            id TEXT PRIMARY KEY,
            locker_log_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            locker_number INTEGER NOT NULL,
            rental_time TEXT NOT NULL,
            return_time TEXT,
            business_day TEXT NOT NULL,
            rental_fee INTEGER NOT NULL,
            deposit_amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
            deposit_status TEXT NOT NULL CHECK(deposit_status IN ('received', 'refunded', 'forfeited', 'none')),
            revenue INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);
        
        // Try to migrate existing data (best effort)
        // Old schema had: id, locker_log_id, item_id, locker_number, rental_date, rental_time, 
        //                 rental_fee, deposit_amount, payment_method, deposit_status, deposit_revenue
        // New schema needs: id, locker_log_id, item_id, item_name, locker_number, rental_time, return_time,
        //                   business_day, rental_fee, deposit_amount, payment_method, deposit_status, revenue
        let migrationSuccess = false;
        try {
          db.run(`
            INSERT INTO rental_transactions 
            (id, locker_log_id, item_id, item_name, locker_number, rental_time, return_time, 
             business_day, rental_fee, deposit_amount, payment_method, deposit_status, revenue, created_at, updated_at)
            SELECT 
              id, 
              locker_log_id, 
              item_id,
              '',  -- item_name didn't exist in old schema, use empty string
              locker_number,
              rental_time,  -- rental_time existed in old schema
              rental_date,  -- Use rental_date as return_time (best guess)
              rental_date,  -- Use rental_date as business_day
              rental_fee,
              deposit_amount,
              payment_method,
              deposit_status,
              rental_fee + CASE 
                WHEN deposit_status IN ('received', 'forfeited') THEN deposit_amount 
                ELSE 0 
              END,  -- Calculate revenue from rental_fee and deposit_status
              created_at,
              updated_at
            FROM rental_transactions_old
          `);
          migrationSuccess = true;
        } catch (e) {
          console.error('Failed to migrate rental transaction data. Old table will be kept as rental_transactions_old for manual recovery:', e);
          // Don't drop the old table - keep it as rental_transactions_old for manual recovery
        }
        
        // Only drop the old table if migration was successful
        if (migrationSuccess) {
          db.run('DROP TABLE rental_transactions_old');
          console.log('[Migration] rental_transactions migration completed successfully');
        } else {
          console.warn('[Migration] rental_transactions migration failed - old table preserved as rental_transactions_old');
        }
      } else {
        console.log('[Migration] rental_transactions schema is up-to-date');
      }
    } else {
      console.log('[Migration] rental_transactions table does not exist, creating new...');
      // Table doesn't exist, create it with new schema
      db.run(`
        CREATE TABLE rental_transactions (
          id TEXT PRIMARY KEY,
          locker_log_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          locker_number INTEGER NOT NULL,
          rental_time TEXT NOT NULL,
          return_time TEXT,
          business_day TEXT NOT NULL,
          rental_fee INTEGER NOT NULL,
          deposit_amount INTEGER NOT NULL,
          payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
          deposit_status TEXT NOT NULL CHECK(deposit_status IN ('received', 'refunded', 'forfeited', 'none')),
          revenue INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    }
    
    // Step 8: Initialize default rental items if not exist
    const countResult = db.exec(`SELECT COUNT(*) FROM additional_revenue_items`);
    const count = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
    
    if (count === 0) {
      console.log('Initializing default rental items...');
      const now = new Date().toISOString();
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();
      
      // 롱타올
      db.run(`
        INSERT INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
        VALUES (?, '롱타올', 1000, 5000, 0, 1, ?, ?)
      `, [id1, now, now]);
      
      // 담요
      db.run(`
        INSERT INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
        VALUES (?, '담요', 1000, 5000, 1, 1, ?, ?)
      `, [id2, now, now]);
      
      console.log('Default rental items created');
      saveDatabase();
    }
    
    // Step 9: Create expense_categories table if not exists
    db.run(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 999,
        created_at TEXT NOT NULL
      )
    `);
    
    // Step 9.5: Initialize default expense categories if not exist
    const expenseCategoryCountResult = db.exec(`SELECT COUNT(*) FROM expense_categories`);
    const categoryCount = expenseCategoryCountResult.length > 0 && expenseCategoryCountResult[0].values.length > 0 ? expenseCategoryCountResult[0].values[0][0] : 0;
    
    if (categoryCount === 0) {
      console.log('Initializing default expense categories...');
      const now = new Date().toISOString();
      const defaultCategories = [
        { name: '인건비', sortOrder: 0 },
        { name: '공과금', sortOrder: 1 },
        { name: '식자재', sortOrder: 2 },
        { name: '소모품', sortOrder: 3 },
        { name: '수리비', sortOrder: 4 },
        { name: '통신비', sortOrder: 5 },
        { name: '보증금환급', sortOrder: 6 },
        { name: '기타', sortOrder: 999 }
      ];
      
      for (const category of defaultCategories) {
        const id = crypto.randomUUID();
        db.run(`
          INSERT INTO expense_categories (id, name, is_default, sort_order, created_at)
          VALUES (?, ?, 1, ?, ?)
        `, [id, category.name, category.sortOrder, now]);
      }
      
      console.log('Default expense categories created');
      saveDatabase();
    }
    
    // Step 10: Create expenses table if not exists
    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        category TEXT NOT NULL,
        amount INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
        business_day TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `);
    
    // Step 11: Create closing_days table if not exists
    db.run(`
      CREATE TABLE IF NOT EXISTS closing_days (
        id TEXT PRIMARY KEY,
        business_day TEXT NOT NULL UNIQUE,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        opening_float INTEGER NOT NULL,
        target_float INTEGER NOT NULL,
        actual_cash INTEGER,
        expected_cash INTEGER,
        discrepancy INTEGER DEFAULT 0,
        bank_deposit INTEGER,
        notes TEXT,
        is_confirmed INTEGER NOT NULL DEFAULT 0,
        confirmed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Step 11: Add memo column to closing_days table for daily notes
    try {
      db.run(`ALTER TABLE closing_days ADD COLUMN memo TEXT`);
      console.log('Added memo column to closing_days');
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
      payment_method TEXT CHECK(payment_method IN ('card', 'cash', 'transfer')),
      payment_cash INTEGER,
      payment_card INTEGER,
      payment_transfer INTEGER,
      rental_items TEXT,
      additional_fees INTEGER DEFAULT 0
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
      original_fee_amount INTEGER,
      discount_amount INTEGER DEFAULT 0,
      business_day TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
      payment_cash INTEGER,
      payment_card INTEGER,
      payment_transfer INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  // Additional revenue items table (rental items: 롱타올, 담요 등)
  db.run(`
    CREATE TABLE IF NOT EXISTS additional_revenue_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rental_fee INTEGER NOT NULL DEFAULT 0,
      deposit_amount INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Rental transactions table (대여 거래 기록)
  db.run(`
    CREATE TABLE IF NOT EXISTS rental_transactions (
      id TEXT PRIMARY KEY,
      locker_log_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      locker_number INTEGER NOT NULL,
      rental_time TEXT NOT NULL,
      return_time TEXT,
      business_day TEXT NOT NULL,
      rental_fee INTEGER NOT NULL,
      deposit_amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
      payment_cash INTEGER,
      payment_card INTEGER,
      payment_transfer INTEGER,
      deposit_status TEXT NOT NULL CHECK(deposit_status IN ('received', 'refunded', 'forfeited', 'none')),
      revenue INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Expenses table (지출 기록)
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('card', 'cash', 'transfer')),
      payment_cash INTEGER,
      payment_card INTEGER,
      payment_transfer INTEGER,
      business_day TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Closing days table (정산 기록)
  db.run(`
    CREATE TABLE IF NOT EXISTS closing_days (
      id TEXT PRIMARY KEY,
      business_day TEXT NOT NULL UNIQUE,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      opening_float INTEGER NOT NULL,
      target_float INTEGER NOT NULL,
      actual_cash INTEGER,
      expected_cash INTEGER,
      discrepancy INTEGER DEFAULT 0,
      bank_deposit INTEGER,
      notes TEXT,
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      confirmed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  saveDatabase();
}

// Force database regeneration (drops all tables and recreates them)
export function forceRegenerateDatabase() {
  if (!db) {
    console.error('Database not initialized');
    return false;
  }
  
  try {
    console.log('[Force Regenerate] Starting database regeneration...');
    
    // Drop all existing tables
    const tables = ['locker_logs', 'locker_daily_summaries', 'locker_groups', 
                   'system_metadata', 'additional_fee_events', 'additional_revenue_items', 
                   'rental_transactions', 'expenses', 'closing_days'];
    
    tables.forEach(table => {
      try {
        db!.run(`DROP TABLE IF EXISTS ${table}`);
        console.log(`[Force Regenerate] Dropped table: ${table}`);
      } catch (e) {
        console.error(`[Force Regenerate] Failed to drop table ${table}:`, e);
      }
    });
    
    // Recreate all tables with correct schema
    createTables();
    
    // Initialize default rental items
    const now = new Date().toISOString();
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    
    db.run(`
      INSERT INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
      VALUES (?, '롱타올', 1000, 5000, 0, 1, ?, ?)
    `, [id1, now, now]);
    
    db.run(`
      INSERT INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
      VALUES (?, '담요', 1000, 5000, 1, 1, ?, ?)
    `, [id2, now, now]);
    
    console.log('[Force Regenerate] Database regeneration completed successfully');
    saveDatabase();
    return true;
  } catch (error) {
    console.error('[Force Regenerate] Error during database regeneration:', error);
    return false;
  }
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
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
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
     option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
     payment_cash, payment_card, payment_transfer, rental_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?)`,
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
      entry.paymentCash || null,
      entry.paymentCard || null,
      entry.paymentTransfer || null,
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
  if (updates.paymentCash !== undefined) {
    sets.push('payment_cash = ?');
    values.push(updates.paymentCash);
  }
  if (updates.paymentCard !== undefined) {
    sets.push('payment_card = ?');
    values.push(updates.paymentCard);
  }
  if (updates.paymentTransfer !== undefined) {
    sets.push('payment_transfer = ?');
    values.push(updates.paymentTransfer);
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
  if (updates.additionalFees !== undefined) {
    sets.push('additional_fees = ?');
    values.push(updates.additionalFees);
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
    `SELECT * FROM locker_logs WHERE status = 'in_use' ORDER BY COALESCE(exit_time, entry_time) DESC`
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

export function getTodayEntries(businessDay: string) {
  if (!db) throw new Error('Database not initialized');

  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE business_day = ? 
     ORDER BY COALESCE(exit_time, entry_time) DESC`,
    [businessDay]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 날짜 범위로 입실 기록 조회 (entry_time 기준)
 * 입출기록 페이지의 날짜 필터링용 - 해당 기간에 입실한 기록만 반환
 */
export function getEntriesByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');

  // Parse dates and convert to ISO
  // Input format: YYYY-MM-DD
  // Append time component for local timezone parsing
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  
  // Validate dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('Invalid date format:', { startDate, endDate });
    return [];
  }
  
  const startDateTime = start.toISOString();
  const endDateTime = end.toISOString();

  // Entry time based filtering: Include only records that entered within the period
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE entry_time >= ? AND entry_time <= ?
     ORDER BY entry_time DESC`,
    [startDateTime, endDateTime]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 시간 범위로 입실 기록 조회 (entry_time 기준)
 * 입출기록 페이지의 시간 필터링용 - 해당 시간대에 입실한 기록만 반환
 */
export function getEntriesByDateTimeRange(startDateTime: string, endDateTime: string) {
  if (!db) throw new Error('Database not initialized');

  // Entry time based filtering: Include only records that entered within the period
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE entry_time >= ? AND entry_time <= ?
     ORDER BY entry_time DESC`,
    [startDateTime, endDateTime]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 특정 비즈니스 데이의 모든 입실 기록 조회 (interval overlap 로직)
 * 영업일 범위와 겹치는 모든 기록 반환 - 사용 중인 락커 조회용
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
export function getEntriesByBusinessDayRange(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - Add T12:00:00 to avoid timezone parsing issues
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T12:00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Interval overlap logic: includes entries that overlap with the business day range
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE (strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?)
        OR (strftime('%s', exit_time) >= ? AND strftime('%s', exit_time) <= ?)
        OR (strftime('%s', entry_time) < ? AND (exit_time IS NULL OR strftime('%s', exit_time) > ?))
     ORDER BY COALESCE(exit_time, entry_time) DESC`,
    [startUnix.toString(), endUnix.toString(), startUnix.toString(), endUnix.toString(), startUnix.toString(), endUnix.toString()]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 특정 비즈니스 데이에 입실한 기록만 조회 (entry_time 기준)
 * 방문자 수 및 입실 매출 계산용
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
export function getEntriesByEntryTime(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - Add T12:00:00 to avoid timezone parsing issues
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T12:00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Filter by entry_time only
  const result = db.exec(
    `SELECT * FROM locker_logs 
     WHERE strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?
     ORDER BY entry_time DESC`,
    [startUnix.toString(), endUnix.toString()]
  );

  if (result.length === 0) return [];

  return rowsToObjects(result[0]);
}

/**
 * 모든 입실 기록 조회 (전체)
 */
export function getAllEntries() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM locker_logs ORDER BY entry_time DESC');
  
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

export function updateDailySummary(businessDay: string) {
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
      if (col.includes('number') || col.includes('price') || col.includes('amount') || col.includes('count') || col.includes('visitors') || col.includes('sales') || col.includes('order') || col.includes('fee') || col.includes('revenue')) {
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
  
  // Delete all operational data (but keep locker groups, system metadata, and master data like additional_revenue_items)
  db.run('DELETE FROM locker_logs');
  db.run('DELETE FROM locker_daily_summaries');
  db.run('DELETE FROM rental_transactions');
  db.run('DELETE FROM additional_fee_events');
  db.run('DELETE FROM expenses');
  db.run('DELETE FROM closing_days');
  
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
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?)`,
      [id, lockerNumber, entryTime, null, businessDay, timeType, basePrice, optionType, optionAmount, finalPrice, '테스트: 추가요금 1회', paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
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
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?)`,
      [id, lockerNumber, entryTime, null, businessDay, timeType, basePrice, optionType, optionAmount, finalPrice, '테스트: 추가요금 2회+', paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
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
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    // Most are in_use (today's data)
    const status = 'in_use';
    const exitTime = null;
    
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
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
        paymentCash,
        paymentCard,
        paymentTransfer,
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
    
    // Set payment columns based on payment method
    const paymentCash = paymentMethod === 'cash' ? finalPrice : null;
    const paymentCard = paymentMethod === 'card' ? finalPrice : null;
    const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : null;
    
    // Most are in_use (today's data)
    const status = 'in_use';
    const exitTime = null;
    
    const id = generateId();
    const entryTime = entryDate.toISOString();
    const businessDay = getBusinessDay(entryDate);
    
    database.run(
      `INSERT INTO locker_logs 
      (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
       option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
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
        paymentCash,
        paymentCard,
        paymentTransfer,
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
  
  // 5. 추가품목 생성 (롱타올, 담요)
  console.log('\n추가품목 생성 중...');
  
  // 롱타올과 담요가 이미 있는지 확인
  const existingItems = db.exec(`SELECT * FROM additional_revenue_items WHERE name IN ('롱타올', '담요')`);
  
  if (existingItems.length === 0 || existingItems[0].values.length < 2) {
    // 롱타올 추가 (대여금 0원, 보증금 5000원)
    const longTowelId = generateId();
    db.run(
      `INSERT OR REPLACE INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
       VALUES (?, '롱타올', 0, 5000, 3, 0, ?, ?)`,
      [longTowelId, new Date().toISOString(), new Date().toISOString()]
    );
    console.log('  롱타올 추가 (대여금: 0원, 보증금: 5000원)');
    
    // 담요 추가 (대여금 1000원, 보증금 0원)
    const blanketId = generateId();
    db.run(
      `INSERT OR REPLACE INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
       VALUES (?, '담요', 1000, 0, 4, 0, ?, ?)`,
      [blanketId, new Date().toISOString(), new Date().toISOString()]
    );
    console.log('  담요 추가 (대여금: 1000원, 보증금: 0원)');
  }
  
  // 6. 랜덤하게 사용중인 락커에 렌탈 아이템 추가 (약 30%)
  console.log('\n렌탈 아이템 추가 중...');
  const inUseLogs = db.exec(`SELECT * FROM locker_logs WHERE status = 'in_use' AND locker_number BETWEEN 1 AND 80`);
  
  if (inUseLogs.length > 0 && inUseLogs[0].values.length > 0) {
    const rentalItems = db.exec(`SELECT * FROM additional_revenue_items`);
    const items = rentalItems.length > 0 && rentalItems[0].values.length > 0 
      ? rentalItems[0].values.map((row: any) => ({
          id: row[0],
          name: row[1],
          rentalFee: row[2],
          depositAmount: row[3],
        }))
      : [];
    
    let rentalCount = 0;
    inUseLogs[0].values.forEach((row: any) => {
      // 30% 확률로 렌탈 아이템 추가
      if (randomBoolean(0.3)) {
        const logId = row[0];
        const lockerNumber = row[1];
        const entryTime = row[2];
        const businessDay = row[4];
        const paymentCash = row[14];
        const paymentCard = row[15];
        const paymentTransfer = row[16];
        
        // 랜덤하게 아이템 선택 (1-2개)
        const numItems = randomBoolean(0.5) ? 1 : 2;
        const selectedItems = [];
        const usedItemIds = new Set();
        
        for (let i = 0; i < numItems && i < items.length; i++) {
          let item;
          do {
            item = randomElement(items);
          } while (usedItemIds.has(item.id) && usedItemIds.size < items.length);
          
          usedItemIds.add(item.id);
          selectedItems.push(item);
        }
        
        // 각 아이템마다 렌탈 트랜잭션 생성
        selectedItems.forEach(item => {
          const rentalId = generateId();
          const itemRevenue = item.rentalFee + item.depositAmount; // 대여시: 렌탈비 + 보증금
          
          // 결제 방식은 현금으로 고정
          database.run(
            `INSERT INTO rental_transactions 
            (id, locker_log_id, item_id, item_name, locker_number, rental_time, return_time, business_day, 
             rental_fee, deposit_amount, payment_method, payment_cash, payment_card, payment_transfer, 
             deposit_status, revenue, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?, 'received', ?, ?, ?)`,
            [
              rentalId, logId, item.id, item.name, lockerNumber, entryTime, null, businessDay,
              item.rentalFee, item.depositAmount, itemRevenue, 0, 0, 'received', itemRevenue,
              new Date().toISOString(), new Date().toISOString()
            ]
          );
        });
        
        rentalCount++;
      }
    });
    
    console.log(`  ${rentalCount}개 락커에 렌탈 아이템 추가`);
  }
  
  saveDatabase();
  
  console.log(`\n테스트 데이터 생성 완료: 총 ${totalGenerated}건 (과거 7일치, 락커 #1~80)`);
  console.log(`- 추가요금 1회: ${additionalFee1Count}건 (오렌지)`);
  console.log(`- 추가요금 2회+: ${additionalFee2PlusCount}건 (레드)`);
}

// Create comprehensive test data with guaranteed same-business-day additional fee
export async function createAdditionalFeeTestData() {
  if (!db) throw new Error('Database not initialized');
  
  return new Promise<boolean>((resolve, reject) => {
    try {
      const settings = getSettings();
      const { dayPrice, nightPrice, businessDayStartHour, discountAmount, foreignerPrice } = settings;
      
      // Random helpers
      const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
      const randomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      const randomBoolean = (probability = 0.5) => Math.random() < probability;
      
      // Delete existing test data (locker numbers 1-80)
      db!.run('DELETE FROM additional_fee_events WHERE locker_number BETWEEN 1 AND 80');
      db!.run('DELETE FROM locker_logs WHERE locker_number BETWEEN 1 AND 80');
      
      const paymentMethods: Array<'card' | 'cash' | 'transfer'> = ['card', 'cash', 'transfer'];
      const optionTypes: Array<'none' | 'discount' | 'foreigner'> = ['none', 'discount', 'foreigner'];
      
      let totalGenerated = 0;
      console.log('=== 3일치 랜덤 테스트 데이터 생성 시작 ===');
      
      // Get current business day range
      const now = new Date();
      const currentBusinessDay = getBusinessDay(now, businessDayStartHour);
      const { start: currentBusinessDayStart } = getBusinessDayRange(now, businessDayStartHour);
      
      console.log(`📍 현재 영업일: ${currentBusinessDay}`);
      console.log(`📍 영업일 시작: ${currentBusinessDayStart.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
      
      // ===== CURRENT IN-USE LOCKERS: Generate 5-10 random lockers with various states =====
      console.log('\n현재 사용 중인 락커 생성 (5-10개, 다양한 상태)');
      
      const numCurrentLockers = randomInt(5, 10);
      const currentUsedLockers = new Set<number>();
      
      // Pre-determine state distribution to guarantee at least one of each color
      // 30% Green, 30% Red, 20% Yellow, 20% Blue
      const states: string[] = [];
      const greenCount = Math.max(1, Math.round(numCurrentLockers * 0.3)); // At least 1
      const redCount = Math.max(1, Math.round(numCurrentLockers * 0.3)); // At least 1
      const yellowCount = Math.max(1, Math.round(numCurrentLockers * 0.2));
      const blueCount = numCurrentLockers - greenCount - redCount - yellowCount;
      
      for (let i = 0; i < greenCount; i++) states.push('green');
      for (let i = 0; i < redCount; i++) states.push('red');
      for (let i = 0; i < yellowCount; i++) states.push('yellow');
      for (let i = 0; i < blueCount; i++) states.push('blue');
      
      // Shuffle states for randomness
      for (let i = states.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [states[i], states[j]] = [states[j], states[i]];
      }
      
      for (let i = 0; i < numCurrentLockers; i++) {
        // Get unused locker number
        let lockerNumber: number;
        do {
          lockerNumber = randomInt(1, 80);
        } while (currentUsedLockers.has(lockerNumber));
        currentUsedLockers.add(lockerNumber);
        
        const state = states[i];
        
        if (state === 'green') {
          // GREEN: Previous business day entry with NO additional fee
          // - 내국인: 이전 영업일 야간(19:00~) 입실 + 아직 첫 자정 안 넘김
          // - 외국인: 이전 영업일 입실 + 아직 24시간 안 지남
          
          const previousBusinessDayStart = new Date(currentBusinessDayStart.getTime() - 24 * 60 * 60 * 1000);
          
          // 50% 외국인, 50% 내국인
          const isForeigner = randomBoolean(0.5);
          let entryTime: Date;
          let validEntry = false;
          let attempts = 0;
          const maxAttempts = 20;
          
          while (!validEntry && attempts < maxAttempts) {
            attempts++;
            
            if (isForeigner) {
              // 외국인: 24시간 기준 → 현재 시각 - 24시간 이내 입실
              // 범위: max(previousBusinessDayStart, now - 24시간 + 1시간 버퍼) ~ currentBusinessDayStart - 1
              const twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
              const minEntryTime = Math.max(previousBusinessDayStart.getTime(), twentyFourHoursAgo + 60 * 60 * 1000); // +1시간 버퍼
              const maxEntryTime = currentBusinessDayStart.getTime() - 1;
              
              if (minEntryTime >= maxEntryTime) {
                console.log(`  ⚠️ 락커 #${lockerNumber}: 외국인 그린 생성 불가 (유효 시간 범위 없음)`);
                break;
              }
              
              entryTime = new Date(minEntryTime + Math.random() * (maxEntryTime - minEntryTime));
            } else {
              // 내국인: 자정 기준 → 이전 영업일 야간(19:00~) + 아직 첫 자정 안 넘김
              // 첫 자정 = 입실일 다음날 00:00
              // 범위: previousBusinessDayStart + 9시간(19:00) ~ min(currentBusinessDayStart - 1, 다음날 00:00 - 1)
              
              const nineteenHoursAfterStart = previousBusinessDayStart.getTime() + 9 * 60 * 60 * 1000; // 19:00
              
              // 다음날 00:00 (첫 자정)
              const nextMidnight = new Date(previousBusinessDayStart);
              nextMidnight.setDate(nextMidnight.getDate() + 1);
              nextMidnight.setHours(0, 0, 0, 0);
              
              const minEntryTime = nineteenHoursAfterStart;
              const maxEntryTime = Math.min(currentBusinessDayStart.getTime() - 1, nextMidnight.getTime() - 1);
              
              if (minEntryTime >= maxEntryTime) {
                console.log(`  ⚠️ 락커 #${lockerNumber}: 내국인 그린 생성 불가 (현재 시각으로는 자정 안 넘긴 야간 입실 불가능)`);
                break;
              }
              
              entryTime = new Date(minEntryTime + Math.random() * (maxEntryTime - minEntryTime));
            }
            
            // 검증: 추가요금이 없는지 확인
            const businessDay = getBusinessDay(entryTime, businessDayStartHour);
            const timeType = getTimeType(entryTime);
            
            const { additionalFeeCount, additionalFee } = calculateAdditionalFee(
              entryTime.toISOString(),
              timeType,
              dayPrice,
              nightPrice,
              now,
              isForeigner,
              foreignerPrice
            );
            
            if (additionalFeeCount === 0) {
              validEntry = true;
              
              const basePrice = isForeigner ? foreignerPrice : (timeType === '주간' ? dayPrice : nightPrice);
              const optionType = isForeigner ? 'foreigner' : 'none';
              const paymentMethod = randomElement(paymentMethods);
              
              db!.run(
                `INSERT INTO locker_logs 
                (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
                 option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
                 payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
                [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
                 timeType, basePrice, optionType, 0, basePrice, 
                 `이전영업일+사용중+추가요금없음(${isForeigner ? '외국인' : '내국인'})`, 
                 paymentMethod, 
                 paymentMethod === 'cash' ? basePrice : 0,
                 paymentMethod === 'card' ? basePrice : 0,
                 paymentMethod === 'transfer' ? basePrice : 0,
                 null]
              );
              
              console.log(`  🟢 락커 #${lockerNumber}: 그린 (${isForeigner ? '외국인' : '내국인'}, ${timeType}, 입실: ${entryTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}) ✓`);
              totalGenerated++;
              updateDailySummary(businessDay);
            } else {
              console.log(`  ⚠️ 락커 #${lockerNumber}: 그린 재시도 (추가요금: ${additionalFee}원, ${attempts}/${maxAttempts})`);
            }
          }
          
          if (!validEntry) {
            console.log(`  ❌ 락커 #${lockerNumber}: 그린 생성 실패 (${maxAttempts}회 시도 후 포기)`);
          }
          
        } else if (state === 'red') {
          // RED: Previous business day entry, crossed midnight → additional fee MUST occur
          // Validate with calculateAdditionalFee to guarantee red status
          
          const previousBusinessDayStart = new Date(currentBusinessDayStart.getTime() - 24 * 60 * 60 * 1000);
          
          let validEntry = false;
          let attempts = 0;
          const maxAttempts = 20;
          let entryTime: Date;
          let optionType: 'none' | 'foreigner';
          let basePrice: number;
          let timeType: '주간' | '야간';
          let businessDay: string;
          
          while (!validEntry && attempts < maxAttempts) {
            attempts++;
            
            // 50% 외국인, 50% 내국인
            const isForeigner = randomBoolean(0.5);
            optionType = isForeigner ? 'foreigner' : 'none';
            
            if (isForeigner) {
              // 외국인: 24시간 기준 → 24시간 이상 전에 입실
              // 현재 시각 - 25~35시간 전
              const hoursAgo = randomInt(25, 35);
              entryTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
              
              // Make sure entry is in previous business day range
              if (entryTime < previousBusinessDayStart) {
                entryTime = new Date(previousBusinessDayStart.getTime() + randomInt(1, 12) * 60 * 60 * 1000);
              }
            } else {
              // 내국인: 자정 기준 → 어제 주간 또는 야간 < 07:00 입실 (첫 자정에 추가요금 발생)
              // 야간 >= 19:00는 첫 자정 무료이므로 제외
              const useEarlyMorning = randomBoolean(0.5);
              
              if (useEarlyMorning) {
                // 야간 < 07:00 입실: 새벽 00:00 ~ 06:59
                const entryHour = randomInt(0, 6);
                const entryMinute = randomInt(0, 59);
                entryTime = new Date(previousBusinessDayStart);
                entryTime.setDate(entryTime.getDate() + 1); // 다음 날로 이동
                entryTime.setHours(entryHour, entryMinute, 0, 0);
              } else {
                // 주간 입실: 07:00 ~ 18:59
                const hoursAfterStart = randomInt(0, 9); // 0-9시간 (최대 19:00까지)
                entryTime = new Date(previousBusinessDayStart.getTime() + hoursAfterStart * 60 * 60 * 1000);
              }
            }
            
            businessDay = getBusinessDay(entryTime, businessDayStartHour);
            timeType = getTimeType(entryTime);
            basePrice = timeType === '주간' ? dayPrice : nightPrice;
            
            // Validate: Must have additional fee
            const result = calculateAdditionalFee(
              entryTime.toISOString(),
              timeType,
              dayPrice,
              nightPrice,
              now,
              optionType === 'foreigner',
              foreignerPrice
            );
            
            if (result.additionalFee > 0) {
              validEntry = true;
              
              const paymentMethod = randomElement(paymentMethods);
              
              db!.run(
                `INSERT INTO locker_logs 
                (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
                 option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
                 payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
                [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
                 timeType, basePrice, optionType, 0, basePrice, 
                 `이전영업일+사용중+추가요금발생(${isForeigner ? '외국인' : '내국인'})`, 
                 paymentMethod,
                 paymentMethod === 'cash' ? basePrice : 0,
                 paymentMethod === 'card' ? basePrice : 0,
                 paymentMethod === 'transfer' ? basePrice : 0,
                 null]
              );
              
              console.log(`  🔴 락커 #${lockerNumber}: 레드 (${isForeigner ? '외국인' : '내국인'}, ${timeType}, 추가요금: ₩${result.additionalFee.toLocaleString()}, 입실: ${entryTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}) ✓`);
              totalGenerated++;
              updateDailySummary(businessDay);
            } else {
              console.log(`  ⚠️ 락커 #${lockerNumber}: 레드 재시도 (추가요금: ${result.additionalFee}원, ${attempts}/${maxAttempts})`);
            }
          }
          
          if (!validEntry) {
            console.log(`  ❌ 락커 #${lockerNumber}: 레드 생성 실패 (${maxAttempts}회 시도 후 포기)`);
          }
          
        } else if (state === 'yellow') {
          // YELLOW: Today daytime entry (must be in the past)
          // Calculate max hours from business day start to current time
          const now = new Date();
          const maxHoursFromStart = Math.floor((now.getTime() - currentBusinessDayStart.getTime()) / (60 * 60 * 1000));
          const maxHours = Math.min(8, maxHoursFromStart - 1); // Cap at 8 hours, ensure past time
          
          if (maxHours < 1) {
            // Not enough time passed since business day start, skip yellow
            continue;
          }
          
          const hoursAfterStart = randomInt(1, maxHours);
          const entryTime = new Date(currentBusinessDayStart.getTime() + hoursAfterStart * 60 * 60 * 1000);
          
          const businessDay = getBusinessDay(entryTime, businessDayStartHour);
          const timeType = getTimeType(entryTime);
          const basePrice = dayPrice;
          const paymentMethod = randomElement(paymentMethods);
          
          db!.run(
            `INSERT INTO locker_logs 
            (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
             option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
             payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
            [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
             timeType, basePrice, 'none', 0, basePrice, '오늘주간입실+사용중', 
             paymentMethod,
             paymentMethod === 'cash' ? basePrice : 0,
             paymentMethod === 'card' ? basePrice : 0,
             paymentMethod === 'transfer' ? basePrice : 0,
             null]
          );
          
          console.log(`  🟡 락커 #${lockerNumber}: 옐로우 (오늘 주간 입실)`);
          totalGenerated++;
          updateDailySummary(businessDay);
          
        } else {
          // BLUE: Today nighttime entry (must be in the past)
          // Calculate max hours from business day start to current time
          const now = new Date();
          const maxHoursFromStart = Math.floor((now.getTime() - currentBusinessDayStart.getTime()) / (60 * 60 * 1000));
          const maxHours = Math.min(15, maxHoursFromStart - 1); // Cap at 15 hours, ensure past time
          
          if (maxHours < 9) {
            // Not enough time passed for nighttime entry, skip blue
            continue;
          }
          
          const hoursAfterStart = randomInt(9, maxHours);
          const entryTime = new Date(currentBusinessDayStart.getTime() + hoursAfterStart * 60 * 60 * 1000);
          
          const businessDay = getBusinessDay(entryTime, businessDayStartHour);
          const timeType = getTimeType(entryTime);
          const basePrice = nightPrice;
          const paymentMethod = randomElement(paymentMethods);
          
          db!.run(
            `INSERT INTO locker_logs 
            (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
             option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
             payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
            [generateId(), lockerNumber, entryTime.toISOString(), null, businessDay, 
             timeType, basePrice, 'none', 0, basePrice, '오늘야간입실+사용중', 
             paymentMethod,
             paymentMethod === 'cash' ? basePrice : 0,
             paymentMethod === 'card' ? basePrice : 0,
             paymentMethod === 'transfer' ? basePrice : 0,
             null]
          );
          
          console.log(`  🔵 락커 #${lockerNumber}: 블루 (오늘 야간 입실)`);
          totalGenerated++;
          updateDailySummary(businessDay);
        }
      }
      
      console.log(`\n✅ 현재 사용 중인 락커 ${numCurrentLockers}개 생성 완료`);
      
      // ===== NO PAST DATA: Only today's data =====
      // Past data generation removed to ensure fresh state on initial installation
      console.log('\n✅ 과거 데이터 생성 생략 (깨끗한 상태 유지)');
      
      // ===== TODAY'S DATA: More in-use entries =====
      console.log('\n추가 사용중 락커 생성 중...');
      const nowForToday = new Date();
      const todayEntries = randomInt(5, 15);
      
      // Use existing currentUsedLockers Set to avoid duplicates
      const usedLockers = currentUsedLockers;
      
      const getUnusedLocker = (): number | null => {
        if (usedLockers.size >= 80) return null;
        let lockerNumber: number;
        do {
          lockerNumber = randomInt(1, 80);
        } while (usedLockers.has(lockerNumber));
        usedLockers.add(lockerNumber);
        return lockerNumber;
      };
      
      // Calculate valid entry time range for current business day
      // If current time is before business day start (e.g., 02:00, start at 10:00)
      // → Use yesterday's business day start to now
      // If current time is after business day start
      // → Use today's business day start to now
      let entryRangeStart: Date;
      if (nowForToday < currentBusinessDayStart) {
        // Early morning (before business day start)
        entryRangeStart = new Date(currentBusinessDayStart.getTime() - 24 * 60 * 60 * 1000);
        console.log(`  ⏰ 새벽 시간 (${nowForToday.getHours()}시) → 어제 영업일 시작부터 생성`);
      } else {
        entryRangeStart = currentBusinessDayStart;
        console.log(`  ⏰ 영업일 시작 이후 → 오늘 영업일 시작부터 생성`);
      }
      
      console.log(`  📅 입실 범위: ${entryRangeStart.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} ~ ${nowForToday.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
      
      for (let i = 0; i < todayEntries; i++) {
        const lockerNumber = getUnusedLocker();
        if (!lockerNumber) break;
        
        // Random entry time within valid range
        const timeRange = nowForToday.getTime() - entryRangeStart.getTime();
        const randomOffset = Math.floor(Math.random() * timeRange);
        const entryDate = new Date(entryRangeStart.getTime() + randomOffset);
        
        const timeType = getTimeType(entryDate);
        const basePrice = timeType === '주간' ? dayPrice : nightPrice;
        
        const optionType = randomElement(optionTypes);
        let optionAmount = 0;
        let finalPrice = basePrice;
        
        if (optionType === 'discount') {
          optionAmount = -discountAmount;
          finalPrice = basePrice - discountAmount;
        } else if (optionType === 'foreigner') {
          optionAmount = foreignerPrice - basePrice;
          finalPrice = foreignerPrice;
        }
        
        const paymentMethod = randomElement(paymentMethods);
        const paymentCash = paymentMethod === 'cash' ? finalPrice : 0;
        const paymentCard = paymentMethod === 'card' ? finalPrice : 0;
        const paymentTransfer = paymentMethod === 'transfer' ? finalPrice : 0;
        
        const id = generateId();
        const businessDay = getBusinessDay(entryDate, businessDayStartHour);
        
        db!.run(
          `INSERT INTO locker_logs 
          (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, 
           option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
           payment_cash, payment_card, payment_transfer, rental_items, additional_fees)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_use', 0, ?, ?, ?, ?, ?, ?, 0)`,
          [id, lockerNumber, entryDate.toISOString(), null, businessDay, 
           timeType, basePrice, optionType, optionAmount, finalPrice, '테스트 데이터', 
           paymentMethod, paymentCash, paymentCard, paymentTransfer, null]
        );
        
        totalGenerated++;
        updateDailySummary(businessDay);
      }
      
      saveDatabase();
      
      // Verify additional fee pending lockers (in_use with expected fees)
      const pendingStmt = db!.prepare(`
        SELECT COUNT(*) as count 
        FROM locker_logs 
        WHERE locker_number BETWEEN 1 AND 80 
        AND status = 'in_use'
        AND notes LIKE '%추가요금%'
      `);
      const pendingResult = pendingStmt.get([]) as any;
      const pendingAdditionalFeeCount = pendingResult?.count || 0;
      pendingStmt.free();
      
      // Verify completed additional fee events
      const verifyStmt = db!.prepare('SELECT COUNT(*) as count FROM additional_fee_events WHERE locker_number BETWEEN 1 AND 80');
      const verifyResult = verifyStmt.get([]) as any;
      const completedAdditionalFeeCount = verifyResult?.count || 0;
      verifyStmt.free();
      
      console.log('\n='.repeat(60));
      console.log('✅ 테스트 데이터 생성 완료!');
      console.log('='.repeat(60));
      console.log(`📊 총 생성 건수: ${totalGenerated}건 (락커 #1~80, 3일치)`);
      console.log(`🔴 추가요금 발생 예정: ${pendingAdditionalFeeCount}건 (사용중, 퇴실 시 기록됨)`);
      console.log(`💰 추가요금 이미 처리: ${completedAdditionalFeeCount}건 (퇴실 완료)`);
      
      if (pendingAdditionalFeeCount === 0 && completedAdditionalFeeCount === 0) {
        console.warn('⚠️ 추가요금 관련 락커가 생성되지 않았습니다.');
      } else {
        console.log('🎯 Type A 시나리오: 전일 주간 입실 + 자정 넘김 + 사용중 (₩5,000 발생 예정) ✓');
        
        // Show detailed info about completed additional fees
        if (completedAdditionalFeeCount > 0) {
          const feeDetailsStmt = db!.prepare(`
            SELECT 
              afe.locker_number,
              afe.fee_amount,
              afe.payment_method,
              afe.business_day,
              ll.business_day as entry_business_day
            FROM additional_fee_events afe
            LEFT JOIN locker_logs ll ON afe.locker_log_id = ll.id
            WHERE afe.locker_number BETWEEN 1 AND 80
            ORDER BY afe.checkout_time DESC
          `);
          
          const feeDetails: Array<{
            locker_number: number;
            fee_amount: number;
            payment_method: string;
            business_day: string;
            entry_business_day: string;
          }> = [];
          
          while (feeDetailsStmt.step()) {
            const row = feeDetailsStmt.getAsObject() as any;
            feeDetails.push(row);
          }
          feeDetailsStmt.free();
          
          console.log('\n📋 퇴실 완료된 추가요금 내역:');
          feeDetails.forEach((fee, idx) => {
            const sameDay = fee.business_day === fee.entry_business_day ? '✅ 같은 영업일' : '❌ 다른 영업일';
            console.log(`  ${idx + 1}. 락커 #${fee.locker_number}: ${fee.fee_amount}원 (${fee.payment_method.toUpperCase()}) - ${sameDay}`);
          });
        }
      }
      console.log('='.repeat(60));
      
      setTimeout(() => {
        resolve(true);
      }, 100);
    } catch (error) {
      console.error('Error creating test data:', error);
      reject(error);
    }
  });
}

// ===== Stage 1: Additional Fee Events =====

export function createAdditionalFeeEvent(event: {
  lockerLogId: string;
  lockerNumber: number;
  checkoutTime: Date;
  feeAmount: number;
  originalFeeAmount?: number;
  discountAmount?: number;
  businessDay: string;
  paymentMethod: string;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const checkoutTimeStr = event.checkoutTime.toISOString();
  const createdAt = new Date().toISOString();
  
  db.run(
    `INSERT INTO additional_fee_events 
    (id, locker_log_id, locker_number, checkout_time, fee_amount, original_fee_amount, discount_amount, 
     business_day, payment_method, payment_cash, payment_card, payment_transfer, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, event.lockerLogId, event.lockerNumber, checkoutTimeStr, event.feeAmount, 
     event.originalFeeAmount || null, event.discountAmount || 0, event.businessDay, event.paymentMethod, 
     event.paymentCash || null, event.paymentCard || null, event.paymentTransfer || null, createdAt]
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

export function getAdditionalFeeEventsByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Convert dates to datetime range in local timezone, then to ISO for storage comparison
  const startDateTime = new Date(startDate + 'T00:00:00').toISOString();
  const endDateTime = new Date(endDate + 'T23:59:59.999').toISOString();
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events 
     WHERE checkout_time >= ? AND checkout_time <= ?
     ORDER BY checkout_time DESC`,
    [startDateTime, endDateTime]
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

export function getAdditionalFeeEventsByDateTimeRange(startDateTime: string, endDateTime: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM additional_fee_events 
     WHERE checkout_time >= ? AND checkout_time <= ?
     ORDER BY checkout_time DESC`,
    [startDateTime, endDateTime]
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

/**
 * 특정 비즈니스 데이의 모든 추가요금 이벤트 조회
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
/**
 * 모든 추가요금 이벤트 조회 (전체)
 */
export function getAllAdditionalFeeEvents() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM additional_fee_events ORDER BY checkout_time DESC');
  
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    lockerNumber: row[2],
    checkoutTime: row[3],
    feeAmount: row[4],
    originalFeeAmount: row[5],
    discountAmount: row[6],
    businessDay: row[7],
    paymentMethod: row[8],
    paymentCash: row[9],
    paymentCard: row[10],
    paymentTransfer: row[11],
    createdAt: row[12],
  }));
}

export function getAdditionalFeeEventsByBusinessDayRange(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - Add T12:00:00 to avoid timezone parsing issues
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T12:00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  const result = db.exec(
    `SELECT afe.*, ll.business_day as entry_business_day 
     FROM additional_fee_events afe
     LEFT JOIN locker_logs ll ON afe.locker_log_id = ll.id
     WHERE strftime('%s', afe.checkout_time) >= ? AND strftime('%s', afe.checkout_time) <= ?
     ORDER BY afe.checkout_time DESC`,
    [startUnix.toString(), endUnix.toString()]
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
    originalFeeAmount: row[5],
    discountAmount: row[6],
    businessDay: row[7],
    paymentMethod: row[8],
    paymentCash: row[9],
    paymentCard: row[10],
    paymentTransfer: row[11],
    createdAt: row[12],
    entryBusinessDay: row[13], // 입실 영업일 추가
  }));
}

export function getTotalRentalRevenueByBusinessDay(businessDay: string): number {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT COALESCE(SUM(revenue), 0) as total FROM rental_transactions WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  
  return result[0].values[0][0] as number;
}

// Additional Revenue Items (rental items: 롱타올, 담요 등) operations
export function getAdditionalRevenueItems() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM additional_revenue_items ORDER BY sort_order ASC');
  
  if (result.length === 0) return [];
  
  return rowsToObjects(result[0]);
}

export function createAdditionalRevenueItem(item: {
  name: string;
  rentalFee: number;
  depositAmount: number;
  sortOrder?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  const sortOrder = item.sortOrder ?? 999;
  
  db.run(
    `INSERT INTO additional_revenue_items (id, name, rental_fee, deposit_amount, sort_order, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, item.name, item.rentalFee, item.depositAmount, sortOrder, now, now]
  );
  
  saveDatabase();
  return id;
}

export function updateAdditionalRevenueItem(id: string, updates: {
  name?: string;
  rentalFee?: number;
  depositAmount?: number;
  sortOrder?: number;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.rentalFee !== undefined) {
    sets.push('rental_fee = ?');
    values.push(updates.rentalFee);
  }
  if (updates.depositAmount !== undefined) {
    sets.push('deposit_amount = ?');
    values.push(updates.depositAmount);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }
  
  if (sets.length === 0) return;
  
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  db.run(
    `UPDATE additional_revenue_items SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  
  saveDatabase();
}

export function deleteAdditionalRevenueItem(id: string) {
  if (!db) throw new Error('Database not initialized');
  
  db.run('DELETE FROM additional_revenue_items WHERE id = ? AND is_default = 0', [id]);
  saveDatabase();
}

// Rental Transactions operations
export function createRentalTransaction(rental: {
  lockerLogId: string;
  itemId: string;
  itemName: string;
  lockerNumber: number;
  rentalTime: string | Date;
  returnTime: string | Date | null;
  businessDay: string;
  rentalFee: number;
  depositAmount: number;
  paymentMethod: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  depositStatus: 'received' | 'refunded' | 'forfeited' | 'none';
  revenue: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  
  const rentalTimeStr = rental.rentalTime instanceof Date ? rental.rentalTime.toISOString() : rental.rentalTime;
  const returnTimeStr = rental.returnTime ? (rental.returnTime instanceof Date ? rental.returnTime.toISOString() : rental.returnTime) : null;
  
  db.run(
    `INSERT INTO rental_transactions 
     (id, locker_log_id, item_id, item_name, locker_number, rental_time, return_time, business_day,
      rental_fee, deposit_amount, payment_method, payment_cash, payment_card, payment_transfer, 
      deposit_status, revenue, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      rental.lockerLogId,
      rental.itemId,
      rental.itemName,
      rental.lockerNumber,
      rentalTimeStr,
      returnTimeStr,
      rental.businessDay,
      rental.rentalFee,
      rental.depositAmount,
      rental.paymentMethod,
      rental.paymentCash || null,
      rental.paymentCard || null,
      rental.paymentTransfer || null,
      rental.depositStatus,
      rental.revenue,
      now,
      now
    ]
  );
  
  saveDatabase();
  return id;
}

export function updateRentalTransaction(id: string, updates: {
  depositStatus?: 'received' | 'refunded' | 'forfeited' | 'none';
  returnTime?: Date;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  businessDay?: string;
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  revenue?: number;
}) {
  if (!db) throw new Error('Database not initialized');
  
  // Get settings for business day calculation
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour || 10;
  
  // Get current transaction to calculate new revenue and prepare updates
  const result = db.exec('SELECT rental_fee, deposit_amount, deposit_status, return_time, payment_method, business_day, payment_cash, payment_card, payment_transfer, rental_time, item_name, locker_number FROM rental_transactions WHERE id = ?', [id]);
  
  if (result.length === 0 || result[0].values.length === 0) return;
  
  const rentalFee = result[0].values[0][0] as number;
  const depositAmount = result[0].values[0][1] as number;
  const currentDepositStatus = result[0].values[0][2] as string;
  const currentReturnTime = result[0].values[0][3];
  const currentPaymentMethod = result[0].values[0][4];
  const currentBusinessDay = result[0].values[0][5];
  const currentPaymentCash = result[0].values[0][6];
  const currentPaymentCard = result[0].values[0][7];
  const currentPaymentTransfer = result[0].values[0][8];
  const rentalTime = result[0].values[0][9] as string;
  const itemName = result[0].values[0][10] as string;
  const lockerNumber = result[0].values[0][11] as number;
  
  // Determine final values
  const finalDepositStatus = updates.depositStatus || currentDepositStatus;
  const finalReturnTime = updates.returnTime ? updates.returnTime.toISOString() : currentReturnTime;
  const finalPaymentMethod = updates.paymentMethod || currentPaymentMethod;
  const finalBusinessDay = updates.businessDay || currentBusinessDay;
  const finalPaymentCash = updates.paymentCash !== undefined ? updates.paymentCash : currentPaymentCash;
  const finalPaymentCard = updates.paymentCard !== undefined ? updates.paymentCard : currentPaymentCard;
  const finalPaymentTransfer = updates.paymentTransfer !== undefined ? updates.paymentTransfer : currentPaymentTransfer;
  
  // Calculate business days for rental and return times
  const rentalBusinessDay = getBusinessDay(new Date(rentalTime as string), businessDayStartHour);
  const returnBusinessDay = finalReturnTime ? getBusinessDay(new Date(finalReturnTime as string), businessDayStartHour) : rentalBusinessDay;
  
  // Calculate revenue based on deposit status
  let revenue = updates.revenue !== undefined ? updates.revenue : rentalFee;
  let adjustedPaymentCash = finalPaymentCash;
  let adjustedPaymentCard = finalPaymentCard;
  let adjustedPaymentTransfer = finalPaymentTransfer;
  
  // Calculate target revenue if not provided
  if (updates.revenue === undefined) {
    if (finalDepositStatus === 'received') {
      revenue += depositAmount; // 대여 시: 렌탈비 + 보증금
    } else if (finalDepositStatus === 'forfeited') {
      // 몰수 시 영업일 비교 (rental_time과 return_time의 영업일 비교)
      if (rentalBusinessDay === returnBusinessDay) {
        revenue += depositAmount; // 같은 영업일: 렌탈비 + 보증금
      }
      // 다른 영업일: 렌탈비만 (보증금은 이미 대여일 매출)
    }
    // refunded: 렌탈비만
  }
  
  // Always adjust payment amounts proportionally to match revenue exactly
  // (revenue가 명시적으로 전달되어도 payment* 필드 조정)
  const cashNum = Number(currentPaymentCash) || 0;
  const cardNum = Number(currentPaymentCard) || 0;
  const transferNum = Number(currentPaymentTransfer) || 0;
  const originalTotal = cashNum + cardNum + transferNum;
  
  if (originalTotal > 0 && revenue !== originalTotal) {
    const ratio = revenue / originalTotal;
    // Floor all channels first
    adjustedPaymentCash = Math.floor(cashNum * ratio);
    adjustedPaymentCard = Math.floor(cardNum * ratio);
    adjustedPaymentTransfer = Math.floor(transferNum * ratio);
    
    // Calculate remainder and assign to channel with largest original amount
    const remainder = revenue - adjustedPaymentCash - adjustedPaymentCard - adjustedPaymentTransfer;
    if (remainder !== 0) {
      const amounts = [
        { value: cashNum, index: 'cash' as const },
        { value: cardNum, index: 'card' as const },
        { value: transferNum, index: 'transfer' as const }
      ];
      const largest = amounts.reduce((max, curr) => curr.value > max.value ? curr : max);
      
      if (largest.index === 'cash') adjustedPaymentCash += remainder;
      else if (largest.index === 'card') adjustedPaymentCard += remainder;
      else adjustedPaymentTransfer += remainder;
    }
  }
  
  // Create expense for cross-day refunds (다른 영업일 환급 시 지출 생성)
  const isRefunding = currentDepositStatus !== 'refunded' && finalDepositStatus === 'refunded';
  const isCrossDay = rentalBusinessDay !== returnBusinessDay;
  
  if (isRefunding && isCrossDay && depositAmount > 0 && finalReturnTime) {
    // 보증금환급 카테고리 찾기
    const categories = getExpenseCategories();
    const refundCategory = categories.find(c => c.name === '보증금환급');
    
    if (refundCategory) {
      const refundTime = new Date(finalReturnTime as string);
      const timeStr = refundTime.toTimeString().slice(0, 5); // HH:MM
      const paymentMethodForExpense = (finalPaymentMethod as 'cash' | 'card' | 'transfer') || 'cash';
      
      // 지출 자동 생성
      createExpense({
        date: returnBusinessDay,
        time: timeStr,
        category: refundCategory.name,
        amount: depositAmount,
        quantity: 1,
        paymentMethod: paymentMethodForExpense,
        paymentCash: paymentMethodForExpense === 'cash' ? depositAmount : undefined,
        paymentCard: paymentMethodForExpense === 'card' ? depositAmount : undefined,
        paymentTransfer: paymentMethodForExpense === 'transfer' ? depositAmount : undefined,
        businessDay: returnBusinessDay,
        notes: `${itemName} 보증금 환급 (락커 ${lockerNumber})`,
      });
    }
  }
  
  db.run(
    `UPDATE rental_transactions 
     SET deposit_status = ?, revenue = ?, return_time = ?, payment_method = ?, business_day = ?, 
         payment_cash = ?, payment_card = ?, payment_transfer = ?, updated_at = ?
     WHERE id = ?`,
    [finalDepositStatus, revenue, finalReturnTime, finalPaymentMethod, finalBusinessDay, 
     adjustedPaymentCash, adjustedPaymentCard, adjustedPaymentTransfer, new Date().toISOString(), id]
  );
  
  saveDatabase();
}

export function getRentalTransactionsByLockerLog(lockerLogId: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM rental_transactions WHERE locker_log_id = ? ORDER BY created_at DESC`,
    [lockerLogId]
  );
  
  if (result.length === 0) return [];
  
  return rowsToObjects(result[0]);
}

/**
 * 날짜 범위로 렌탈 거래 조회 (rental_time 기준)
 * 입출기록 페이지의 날짜 필터링용 - 해당 기간에 대여한 거래만 반환
 */
export function getRentalTransactionsByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Convert dates to datetime range in local timezone, then to ISO for storage comparison
  const startDateTime = new Date(startDate + 'T00:00:00').toISOString();
  const endDateTime = new Date(endDate + 'T23:59:59.999').toISOString();
  
  const result = db.exec(
    `SELECT * FROM rental_transactions 
     WHERE rental_time >= ? AND rental_time <= ?
     ORDER BY rental_time DESC`,
    [startDateTime, endDateTime]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

/**
 * 시간 범위로 렌탈 거래 조회 (rental_time 기준)
 * 입출기록 페이지의 시간 필터링용 - 해당 시간대에 대여한 거래만 반환
 */
export function getRentalTransactionsByDateTimeRange(startDateTime: string, endDateTime: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM rental_transactions 
     WHERE rental_time >= ? AND rental_time <= ?
     ORDER BY rental_time DESC`,
    [startDateTime, endDateTime]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

/**
 * 특정 비즈니스 데이의 모든 렌탈 거래 조회
 * @param businessDay YYYY-MM-DD 형식의 비즈니스 데이
 * @param businessDayStartHour 비즈니스 데이 시작 시각 (기본값: 10)
 */
/**
 * 모든 렌탈 거래 조회 (전체)
 */
export function getAllRentalTransactions() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec('SELECT * FROM rental_transactions ORDER BY rental_time DESC');
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

export function getRentalTransactionsByBusinessDayRange(businessDay: string, businessDayStartHour: number = 10) {
  if (!db) throw new Error('Database not initialized');
  
  // 비즈니스 데이 범위 계산 - Add T12:00:00 to avoid timezone parsing issues
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T12:00:00'), businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  const result = db.exec(
    `SELECT * FROM rental_transactions 
     WHERE strftime('%s', rental_time) >= ? AND strftime('%s', rental_time) <= ?
     ORDER BY rental_time DESC`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    lockerLogId: row[1],
    itemId: row[2],
    itemName: row[3],
    lockerNumber: row[4],
    rentalTime: row[5],
    returnTime: row[6],
    businessDay: row[7],
    rentalFee: row[8],
    depositAmount: row[9],
    paymentMethod: row[10],
    paymentCash: row[11],
    paymentCard: row[12],
    paymentTransfer: row[13],
    depositStatus: row[14],
    revenue: row[15],
  }));
}

// ============================================
// Expenses (지출) Functions
// ============================================

export function createExpense(data: {
  date: string;
  time: string;
  category: string;
  amount: number;
  quantity?: number;
  paymentMethod: 'card' | 'cash' | 'transfer';
  paymentCash?: number;
  paymentCard?: number;
  paymentTransfer?: number;
  businessDay: string;
  notes?: string;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO expenses (id, date, time, category, amount, quantity, payment_method, 
     payment_cash, payment_card, payment_transfer, business_day, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.date,
      data.time,
      data.category,
      data.amount,
      data.quantity || 1,
      data.paymentMethod,
      data.paymentCash || null,
      data.paymentCard || null,
      data.paymentTransfer || null,
      data.businessDay,
      data.notes || null,
      now
    ]
  );
  
  saveDatabase();
  return id;
}

export function getExpenses() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(`SELECT * FROM expenses ORDER BY date DESC, time DESC`);
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    date: row[1],
    time: row[2],
    category: row[3],
    amount: row[4],
    quantity: row[5],
    paymentMethod: row[6],
    businessDay: row[7],
    notes: row[8],
    createdAt: row[9],
  }));
}

export function getExpensesByDateRange(startDate: string, endDate: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM expenses 
     WHERE date >= ? AND date <= ?
     ORDER BY date DESC, time DESC`,
    [startDate, endDate]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    date: row[1],
    time: row[2],
    category: row[3],
    amount: row[4],
    quantity: row[5],
    paymentMethod: row[6],
    businessDay: row[7],
    notes: row[8],
    createdAt: row[9],
  }));
}

export function getExpensesByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM expenses WHERE business_day = ? ORDER BY date DESC, time DESC`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    date: row[1],
    time: row[2],
    category: row[3],
    amount: row[4],
    quantity: row[5],
    paymentMethod: row[6],
    businessDay: row[7],
    notes: row[8],
    createdAt: row[9],
  }));
}

export function getExpenseSummaryByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT 
       SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_total,
       SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END) as card_total,
       SUM(CASE WHEN payment_method = 'transfer' THEN amount ELSE 0 END) as transfer_total,
       SUM(amount) as total
     FROM expenses 
     WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return { cashTotal: 0, cardTotal: 0, transferTotal: 0, total: 0 };
  }
  
  const row = result[0].values[0];
  return {
    cashTotal: row[0] || 0,
    cardTotal: row[1] || 0,
    transferTotal: row[2] || 0,
    total: row[3] || 0,
  };
}

export function updateExpense(id: string, updates: {
  date?: string;
  time?: string;
  category?: string;
  amount?: number;
  quantity?: number;
  paymentMethod?: 'card' | 'cash' | 'transfer';
  businessDay?: string;
  notes?: string;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.date !== undefined) {
    fields.push('date = ?');
    values.push(updates.date);
  }
  if (updates.time !== undefined) {
    fields.push('time = ?');
    values.push(updates.time);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.amount !== undefined) {
    fields.push('amount = ?');
    values.push(updates.amount);
  }
  if (updates.quantity !== undefined) {
    fields.push('quantity = ?');
    values.push(updates.quantity);
  }
  if (updates.paymentMethod !== undefined) {
    fields.push('payment_method = ?');
    values.push(updates.paymentMethod);
  }
  if (updates.businessDay !== undefined) {
    fields.push('business_day = ?');
    values.push(updates.businessDay);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  
  db.run(
    `UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  
  saveDatabase();
}

export function deleteExpense(id: string) {
  if (!db) throw new Error('Database not initialized');
  
  db.run('DELETE FROM expenses WHERE id = ?', [id]);
  saveDatabase();
}

// ============================================
// Closing Days (정산) Functions
// ============================================

export function createClosingDay(data: {
  businessDay: string;
  startTime: string;
  endTime: string;
  openingFloat: number;
  targetFloat: number;
  actualCash?: number;
  expectedCash?: number;
  discrepancy?: number;
  bankDeposit?: number;
  notes?: string;
  memo?: string;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO closing_days 
     (id, business_day, start_time, end_time, opening_float, target_float, 
      actual_cash, expected_cash, discrepancy, bank_deposit, notes, memo, is_confirmed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      data.businessDay,
      data.startTime,
      data.endTime,
      data.openingFloat,
      data.targetFloat,
      data.actualCash || null,
      data.expectedCash || null,
      data.discrepancy || 0,
      data.bankDeposit || null,
      data.notes || null,
      data.memo || null,
      now,
      now
    ]
  );
  
  saveDatabase();
  return id;
}

export function getClosingDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM closing_days WHERE business_day = ?`,
    [businessDay]
  );
  
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const row = result[0].values[0];
  return {
    id: row[0],
    businessDay: row[1],
    startTime: row[2],
    endTime: row[3],
    openingFloat: row[4],
    targetFloat: row[5],
    actualCash: row[6],
    expectedCash: row[7],
    discrepancy: row[8],
    bankDeposit: row[9],
    notes: row[10],
    memo: row[11],
    isConfirmed: row[12] === 1,
    confirmedAt: row[13],
    createdAt: row[14],
    updatedAt: row[15],
  };
}

export function getClosingDays() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(`SELECT * FROM closing_days ORDER BY business_day DESC`);
  
  if (result.length === 0 || result[0].values.length === 0) return [];
  
  return result[0].values.map((row: any) => ({
    id: row[0],
    businessDay: row[1],
    startTime: row[2],
    endTime: row[3],
    openingFloat: row[4],
    targetFloat: row[5],
    actualCash: row[6],
    expectedCash: row[7],
    discrepancy: row[8],
    bankDeposit: row[9],
    notes: row[10],
    isConfirmed: row[11] === 1,
    confirmedAt: row[12],
    createdAt: row[13],
    updatedAt: row[14],
  }));
}

export function getLatestClosingDay() {
  if (!db) throw new Error('Database not initialized');
  
  const result = db.exec(
    `SELECT * FROM closing_days ORDER BY business_day DESC LIMIT 1`
  );
  
  if (result.length === 0 || result[0].values.length === 0) return null;
  
  const row = result[0].values[0];
  return {
    id: row[0],
    businessDay: row[1],
    startTime: row[2],
    endTime: row[3],
    openingFloat: row[4],
    targetFloat: row[5],
    actualCash: row[6],
    expectedCash: row[7],
    discrepancy: row[8],
    bankDeposit: row[9],
    notes: row[10],
    memo: row[11],
    isConfirmed: row[12] === 1,
    confirmedAt: row[13],
    createdAt: row[14],
    updatedAt: row[15],
  };
}

export function updateClosingDay(businessDay: string, updates: {
  openingFloat?: number;
  targetFloat?: number;
  actualCash?: number;
  expectedCash?: number;
  discrepancy?: number;
  bankDeposit?: number;
  notes?: string;
  memo?: string;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.openingFloat !== undefined) {
    fields.push('opening_float = ?');
    values.push(updates.openingFloat);
  }
  if (updates.targetFloat !== undefined) {
    fields.push('target_float = ?');
    values.push(updates.targetFloat);
  }
  if (updates.actualCash !== undefined) {
    fields.push('actual_cash = ?');
    values.push(updates.actualCash);
  }
  if (updates.expectedCash !== undefined) {
    fields.push('expected_cash = ?');
    values.push(updates.expectedCash);
  }
  if (updates.discrepancy !== undefined) {
    fields.push('discrepancy = ?');
    values.push(updates.discrepancy);
  }
  if (updates.bankDeposit !== undefined) {
    fields.push('bank_deposit = ?');
    values.push(updates.bankDeposit);
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.memo !== undefined) {
    fields.push('memo = ?');
    values.push(updates.memo);
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  
  values.push(businessDay);
  
  db.run(
    `UPDATE closing_days SET ${fields.join(', ')} WHERE business_day = ?`,
    values
  );
  
  saveDatabase();
}

export function confirmClosingDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  const now = new Date().toISOString();
  
  db.run(
    `UPDATE closing_days 
     SET is_confirmed = 1, confirmed_at = ?, updated_at = ?
     WHERE business_day = ?`,
    [now, now, businessDay]
  );
  
  saveDatabase();
}

// Get detailed sales breakdown by business day (using business day RANGE for accurate aggregation)
export function getDetailedSalesByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Get UTC start/end timestamps for the business day range
  const settings = getSettings();
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T12:00:00'), settings.businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Get base entry sales (입실 기본요금) - filter by entry_time within business day range
  const entryResult = db.exec(
    `SELECT 
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer_total
     FROM locker_logs
     WHERE strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const entrySales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (entryResult.length > 0 && entryResult[0].values.length > 0) {
    const row = entryResult[0].values[0];
    entrySales.cash = row[0] as number || 0;
    entrySales.card = row[1] as number || 0;
    entrySales.transfer = row[2] as number || 0;
    entrySales.total = entrySales.cash + entrySales.card + entrySales.transfer;
  }
  
  // Get additional fee sales (추가요금) - filter by checkout_time within business day range
  const additionalResult = db.exec(
    `SELECT 
      COALESCE(SUM(COALESCE(payment_cash, 0)), 0) as cash_total,
      COALESCE(SUM(COALESCE(payment_card, 0)), 0) as card_total,
      COALESCE(SUM(COALESCE(payment_transfer, 0)), 0) as transfer_total
     FROM additional_fee_events
     WHERE strftime('%s', checkout_time) >= ? AND strftime('%s', checkout_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const additionalSales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (additionalResult.length > 0 && additionalResult[0].values.length > 0) {
    const row = additionalResult[0].values[0];
    additionalSales.cash = row[0] as number || 0;
    additionalSales.card = row[1] as number || 0;
    additionalSales.transfer = row[2] as number || 0;
    additionalSales.total = additionalSales.cash + additionalSales.card + additionalSales.transfer;
  }
  
  return {
    entrySales,
    additionalSales,
    totalEntrySales: {
      cash: entrySales.cash + additionalSales.cash,
      card: entrySales.card + additionalSales.card,
      transfer: entrySales.transfer + additionalSales.transfer,
      total: entrySales.total + additionalSales.total
    }
  };
}

// Get rental revenue breakdown by business day
export function getRentalRevenueBreakdownByBusinessDay(businessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Get all rental items
  const items = getAdditionalRevenueItems();
  
  const breakdown: {
    [itemName: string]: {
      rentalFee: { cash: number; card: number; transfer: number; total: number };
      depositForfeited: { cash: number; card: number; transfer: number; total: number };
      depositAmount: number;
    }
  } = {};
  
  items.forEach(item => {
    breakdown[item.name] = {
      rentalFee: { cash: 0, card: 0, transfer: 0, total: 0 },
      depositForfeited: { cash: 0, card: 0, transfer: 0, total: 0 },
      depositAmount: 0  // Will be set to the max deposit amount found in transactions
    };
  });
  
  // Get UTC start/end timestamps for the business day range
  const settings = getSettings();
  const { start, end } = getBusinessDayRange(new Date(businessDay + 'T12:00:00'), settings.businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(start.getTime() / 1000);
  const endUnix = Math.floor(end.getTime() / 1000);
  
  // Get rental transactions for this business day - filter by rental_time within business day range
  const result = db.exec(
    `SELECT 
      item_name,
      rental_fee,
      deposit_amount,
      deposit_status,
      COALESCE(payment_cash, 0) as payment_cash,
      COALESCE(payment_card, 0) as payment_card,
      COALESCE(payment_transfer, 0) as payment_transfer,
      payment_method,
      rental_time,
      return_time,
      business_day
     FROM rental_transactions
     WHERE strftime('%s', rental_time) >= ? AND strftime('%s', rental_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  if (result.length > 0 && result[0].values.length > 0) {
    result[0].values.forEach((row: any) => {
      const itemName = row[0] as string;
      const rentalFee = row[1] as number;
      const depositAmount = row[2] as number;
      const depositStatus = row[3] as string;
      const paymentCash = row[4] as number;
      const paymentCard = row[5] as number;
      const paymentTransfer = row[6] as number;
      const paymentMethod = row[7] as string | null;
      const rentalTime = row[8] as string;
      const returnTime = row[9] as string | null;
      const rentalBusinessDay = row[10] as string;
      
      if (!breakdown[itemName]) {
        breakdown[itemName] = {
          rentalFee: { cash: 0, card: 0, transfer: 0, total: 0 },
          depositForfeited: { cash: 0, card: 0, transfer: 0, total: 0 },
          depositAmount: depositAmount
        };
      } else {
        // Update depositAmount to the maximum found (for display purposes)
        if (depositAmount > breakdown[itemName].depositAmount) {
          breakdown[itemName].depositAmount = depositAmount;
        }
      }
      
      // Calculate total revenue for this transaction
      let totalRevenue = rentalFee;
      if (depositStatus === 'received') {
        // 대여 시: 렌탈비 + 보증금
        totalRevenue += depositAmount;
      } else if (depositStatus === 'forfeited' && returnTime) {
        // 몰수 시: 영업일 비교
        const returnBusinessDay = getBusinessDay(new Date(returnTime), settings.businessDayStartHour);
        if (rentalBusinessDay === returnBusinessDay) {
          // 같은 영업일: 렌탈비 + 보증금
          totalRevenue += depositAmount;
        }
        // 다른 영업일: 렌탈비만 (보증금은 이미 대여일 매출)
      }
      
      // For refunded deposits, exclude deposit from payment calculation
      // payment_cash/card/transfer may include deposit that was refunded, so we need to subtract it
      let effectivePaymentCash = paymentCash;
      let effectivePaymentCard = paymentCard;
      let effectivePaymentTransfer = paymentTransfer;
      
      if (depositStatus === 'refunded') {
        // Original payment included deposit, but it was refunded
        // So we need to subtract deposit from the total payment to get only rental fee payment
        const totalPayment = paymentCash + paymentCard + paymentTransfer;
        if (totalPayment > 0 && depositAmount > 0) {
          // Proportionally reduce each payment method by deposit amount
          const depositRatio = depositAmount / totalPayment;
          effectivePaymentCash = Math.round(paymentCash * (1 - depositRatio));
          effectivePaymentCard = Math.round(paymentCard * (1 - depositRatio));
          effectivePaymentTransfer = Math.round(paymentTransfer * (1 - depositRatio));
        }
      }
      
      const totalPayment = effectivePaymentCash + effectivePaymentCard + effectivePaymentTransfer;
      
      if (totalRevenue > 0 && totalPayment > 0) {
        // Calculate rental fee portion
        const rentalFeeRatio = rentalFee / totalRevenue;
        breakdown[itemName].rentalFee.cash += Math.round(effectivePaymentCash * rentalFeeRatio);
        breakdown[itemName].rentalFee.card += Math.round(effectivePaymentCard * rentalFeeRatio);
        breakdown[itemName].rentalFee.transfer += Math.round(effectivePaymentTransfer * rentalFeeRatio);
        breakdown[itemName].rentalFee.total += rentalFee;
        
        // Calculate deposit portion (only when included in totalRevenue)
        const depositIncluded = (depositStatus === 'received') || 
          (depositStatus === 'forfeited' && returnTime && rentalBusinessDay === getBusinessDay(new Date(returnTime), settings.businessDayStartHour));
        
        if (depositIncluded && totalRevenue > rentalFee) {
          const depositRatio = depositAmount / totalRevenue;
          breakdown[itemName].depositForfeited.cash += Math.round(effectivePaymentCash * depositRatio);
          breakdown[itemName].depositForfeited.card += Math.round(effectivePaymentCard * depositRatio);
          breakdown[itemName].depositForfeited.transfer += Math.round(effectivePaymentTransfer * depositRatio);
          breakdown[itemName].depositForfeited.total += depositAmount;
        }
      } else if (totalRevenue > 0 && paymentMethod) {
        // Legacy data fallback: Use payment_method to allocate revenue
        // This handles old data where payment_cash/card/transfer weren't populated
        const depositIncluded = (depositStatus === 'received') || 
          (depositStatus === 'forfeited' && returnTime && rentalBusinessDay === getBusinessDay(new Date(returnTime), settings.businessDayStartHour));
        
        if (paymentMethod === 'cash') {
          breakdown[itemName].rentalFee.cash += rentalFee;
          if (depositIncluded) {
            breakdown[itemName].depositForfeited.cash += depositAmount;
          }
        } else if (paymentMethod === 'card') {
          breakdown[itemName].rentalFee.card += rentalFee;
          if (depositIncluded) {
            breakdown[itemName].depositForfeited.card += depositAmount;
          }
        } else if (paymentMethod === 'transfer') {
          breakdown[itemName].rentalFee.transfer += rentalFee;
          if (depositIncluded) {
            breakdown[itemName].depositForfeited.transfer += depositAmount;
          }
        }
        breakdown[itemName].rentalFee.total += rentalFee;
        if (depositIncluded) {
          breakdown[itemName].depositForfeited.total += depositAmount;
        }
      } else {
        // Last resort fallback: just add totals without payment method breakdown
        const depositIncluded = (depositStatus === 'received') || 
          (depositStatus === 'forfeited' && returnTime && rentalBusinessDay === getBusinessDay(new Date(returnTime), settings.businessDayStartHour));
        
        breakdown[itemName].rentalFee.total += rentalFee;
        if (depositIncluded) {
          breakdown[itemName].depositForfeited.total += depositAmount;
        }
      }
    });
  }
  
  // Calculate totals
  const totals = {
    rentalFee: { cash: 0, card: 0, transfer: 0, total: 0 },
    depositForfeited: { cash: 0, card: 0, transfer: 0, total: 0 },
    grandTotal: { cash: 0, card: 0, transfer: 0, total: 0 }
  };
  
  Object.values(breakdown).forEach(item => {
    totals.rentalFee.cash += item.rentalFee.cash;
    totals.rentalFee.card += item.rentalFee.card;
    totals.rentalFee.transfer += item.rentalFee.transfer;
    totals.rentalFee.total += item.rentalFee.total;
    
    totals.depositForfeited.cash += item.depositForfeited.cash;
    totals.depositForfeited.card += item.depositForfeited.card;
    totals.depositForfeited.transfer += item.depositForfeited.transfer;
    totals.depositForfeited.total += item.depositForfeited.total;
  });
  
  totals.grandTotal.cash = totals.rentalFee.cash + totals.depositForfeited.cash;
  totals.grandTotal.card = totals.rentalFee.card + totals.depositForfeited.card;
  totals.grandTotal.transfer = totals.rentalFee.transfer + totals.depositForfeited.transfer;
  totals.grandTotal.total = totals.rentalFee.total + totals.depositForfeited.total;
  
  return {
    breakdown,
    totals
  };
}

// Get detailed sales summary for a range of business days
export function getDetailedSalesByBusinessDayRange(startBusinessDay: string, endBusinessDay: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Get UTC start/end timestamps for the business day range
  const settings = getSettings();
  const startDate = new Date(startBusinessDay + 'T12:00:00');
  const endDate = new Date(endBusinessDay + 'T12:00:00');
  
  const { start: rangeStart } = getBusinessDayRange(startDate, settings.businessDayStartHour);
  const { end: rangeEnd } = getBusinessDayRange(endDate, settings.businessDayStartHour);
  
  // Convert to Unix timestamps (seconds) for reliable numeric comparison
  const startUnix = Math.floor(rangeStart.getTime() / 1000);
  const endUnix = Math.floor(rangeEnd.getTime() / 1000);
  
  // Get base entry sales (입실 기본요금) - filter by entry_time within range
  const entryResult = db.exec(
    `SELECT 
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card_total,
      COALESCE(SUM(CASE WHEN status != 'cancelled' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer_total
     FROM locker_logs
     WHERE strftime('%s', entry_time) >= ? AND strftime('%s', entry_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const entrySales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (entryResult.length > 0 && entryResult[0].values.length > 0) {
    const row = entryResult[0].values[0];
    entrySales.cash = row[0] as number;
    entrySales.card = row[1] as number;
    entrySales.transfer = row[2] as number;
    entrySales.total = entrySales.cash + entrySales.card + entrySales.transfer;
  }
  
  // Get additional fee sales (추가요금) - filter by checkout_time within range
  const additionalResult = db.exec(
    `SELECT 
      COALESCE(SUM(COALESCE(payment_cash, 0)), 0) as cash_total,
      COALESCE(SUM(COALESCE(payment_card, 0)), 0) as card_total,
      COALESCE(SUM(COALESCE(payment_transfer, 0)), 0) as transfer_total
     FROM additional_fee_events
     WHERE strftime('%s', checkout_time) >= ? AND strftime('%s', checkout_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const additionalSales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (additionalResult.length > 0 && additionalResult[0].values.length > 0) {
    const row = additionalResult[0].values[0];
    additionalSales.cash = row[0] as number;
    additionalSales.card = row[1] as number;
    additionalSales.transfer = row[2] as number;
    additionalSales.total = additionalSales.cash + additionalSales.card + additionalSales.transfer;
  }
  
  // Get rental sales (대여물품 매출) - filter by rental_time within range
  const rentalResult = db.exec(
    `SELECT 
      COALESCE(SUM(CASE WHEN deposit_status = 'received' OR deposit_status = 'refunded' THEN COALESCE(payment_cash, 0) ELSE 0 END), 0) as cash_total,
      COALESCE(SUM(CASE WHEN deposit_status = 'received' OR deposit_status = 'refunded' THEN COALESCE(payment_card, 0) ELSE 0 END), 0) as card_total,
      COALESCE(SUM(CASE WHEN deposit_status = 'received' OR deposit_status = 'refunded' THEN COALESCE(payment_transfer, 0) ELSE 0 END), 0) as transfer_total
     FROM rental_transactions
     WHERE strftime('%s', rental_time) >= ? AND strftime('%s', rental_time) <= ?`,
    [startUnix.toString(), endUnix.toString()]
  );
  
  const rentalSales = {
    cash: 0,
    card: 0,
    transfer: 0,
    total: 0
  };
  
  if (rentalResult.length > 0 && rentalResult[0].values.length > 0) {
    const row = rentalResult[0].values[0];
    rentalSales.cash = row[0] as number;
    rentalSales.card = row[1] as number;
    rentalSales.transfer = row[2] as number;
    rentalSales.total = rentalSales.cash + rentalSales.card + rentalSales.transfer;
  }
  
  return {
    entrySales,
    additionalSales,
    rentalSales,
    totalEntrySales: {
      cash: entrySales.cash + additionalSales.cash,
      card: entrySales.card + additionalSales.card,
      transfer: entrySales.transfer + additionalSales.transfer,
      total: entrySales.total + additionalSales.total
    }
  };
}

// Expense Categories operations
export function getExpenseCategories() {
  if (!db) throw new Error('Database not initialized');
  
  // Ensure expense_categories table exists
  ensureExpenseCategoriesTable();
  
  const result = db.exec('SELECT * FROM expense_categories ORDER BY sort_order ASC, name ASC');
  
  if (result.length === 0) return [];
  
  return rowsToObjects(result[0]);
}

// Helper function to ensure expense_categories table exists
function ensureExpenseCategoriesTable() {
  if (!db) return;
  
  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 999,
      created_at TEXT NOT NULL
    )
  `);
  
  // Check if table has any records
  const countResult = db.exec(`SELECT COUNT(*) FROM expense_categories`);
  const categoryCount = countResult.length > 0 && countResult[0].values.length > 0 ? countResult[0].values[0][0] : 0;
  
  // Initialize default categories if empty
  if (categoryCount === 0) {
    const now = new Date().toISOString();
    const defaultCategories = [
      { name: '인건비', sortOrder: 0 },
      { name: '공과금', sortOrder: 1 },
      { name: '식자재', sortOrder: 2 },
      { name: '소모품', sortOrder: 3 },
      { name: '수리비', sortOrder: 4 },
      { name: '통신비', sortOrder: 5 },
      { name: '보증금환급', sortOrder: 6 },
      { name: '기타', sortOrder: 999 }
    ];
    
    for (const category of defaultCategories) {
      const id = crypto.randomUUID();
      db.run(`
        INSERT INTO expense_categories (id, name, is_default, sort_order, created_at)
        VALUES (?, ?, 1, ?, ?)
      `, [id, category.name, category.sortOrder, now]);
    }
    
    saveDatabase();
  }
}

export function createExpenseCategory(category: {
  name: string;
  sortOrder?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = generateId();
  const now = new Date().toISOString();
  const sortOrder = category.sortOrder ?? 999;
  
  db.run(
    `INSERT INTO expense_categories (id, name, is_default, sort_order, created_at)
     VALUES (?, ?, 0, ?, ?)`,
    [id, category.name, sortOrder, now]
  );
  
  saveDatabase();
  return id;
}

export function deleteExpenseCategory(id: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Only allow deletion of non-default categories
  db.run('DELETE FROM expense_categories WHERE id = ? AND is_default = 0', [id]);
  saveDatabase();
}

export function updateExpenseCategory(id: string, updates: {
  name?: string;
  sortOrder?: number;
}) {
  if (!db) throw new Error('Database not initialized');
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }
  
  if (sets.length === 0) return;
  
  values.push(id);
  
  db.run(
    `UPDATE expense_categories SET ${sets.join(', ')} WHERE id = ?`,
    values
  );
  
  saveDatabase();
}

// Recalculate business_day for all existing records
export function recalculateAllBusinessDays() {
  if (!db) throw new Error('Database not initialized');
  
  const settings = getSettings();
  const businessDayStartHour = settings.businessDayStartHour;
  
  // Import getBusinessDay from shared module
  const { getBusinessDay } = require('@shared/businessDay');
  
  let updatedCount = 0;
  
  // 1. Update locker_logs based on entry_time
  const lockerLogs = db.exec('SELECT id, entry_time FROM locker_logs');
  if (lockerLogs.length > 0 && lockerLogs[0].values.length > 0) {
    lockerLogs[0].values.forEach((row: any) => {
      const id = row[0];
      const entryTime = new Date(row[1]);
      const correctBusinessDay = getBusinessDay(entryTime, businessDayStartHour);
      
      db!.run(
        'UPDATE locker_logs SET business_day = ? WHERE id = ?',
        [correctBusinessDay, id]
      );
      updatedCount++;
    });
  }
  
  // 2. Update rental_transactions based on rental_time
  const rentalTransactions = db.exec('SELECT id, rental_time FROM rental_transactions');
  if (rentalTransactions.length > 0 && rentalTransactions[0].values.length > 0) {
    rentalTransactions[0].values.forEach((row: any) => {
      const id = row[0];
      const rentalTime = new Date(row[1]);
      const correctBusinessDay = getBusinessDay(rentalTime, businessDayStartHour);
      
      db!.run(
        'UPDATE rental_transactions SET business_day = ? WHERE id = ?',
        [correctBusinessDay, id]
      );
      updatedCount++;
    });
  }
  
  // 3. Update additional_fee_events based on checkout_time
  const additionalFeeEvents = db.exec('SELECT id, checkout_time FROM additional_fee_events');
  if (additionalFeeEvents.length > 0 && additionalFeeEvents[0].values.length > 0) {
    additionalFeeEvents[0].values.forEach((row: any) => {
      const id = row[0];
      const checkoutTime = new Date(row[1]);
      const correctBusinessDay = getBusinessDay(checkoutTime, businessDayStartHour);
      
      db!.run(
        'UPDATE additional_fee_events SET business_day = ? WHERE id = ?',
        [correctBusinessDay, id]
      );
      updatedCount++;
    });
  }
  
  // 4. Recalculate all daily summaries
  const allBusinessDays = new Set<string>();
  
  // Get all unique business days from locker_logs
  const businessDaysResult = db.exec('SELECT DISTINCT business_day FROM locker_logs');
  if (businessDaysResult.length > 0 && businessDaysResult[0].values.length > 0) {
    businessDaysResult[0].values.forEach((row: any) => {
      allBusinessDays.add(row[0]);
    });
  }
  
  // Recalculate summary for each business day
  allBusinessDays.forEach(businessDay => {
    updateDailySummary(businessDay);
  });
  
  saveDatabase();
  
  return updatedCount;
}
