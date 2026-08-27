import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import LZString from 'lz-string';
import { isDemoBuild } from '@/lib/demoMode';
import { LICENSE_STORAGE_KEY } from '@/lib/licenseValidation';
import { getCachedStoreProfile } from '@/lib/storeProfile';

export let SQL: SqlJsStatic | null = null;
export let db: Database | null = null;

const DB_NAME = 'rest_hotel_db';

// 앱 식별자 — 매장 구분 없는 단일 빌드라 매장마다 다르게 두지 않는다. 백업 파일의 appName
// 필드에 쓰이며 importDatabase()의 validAppNames 검증과 짝을 이룬다 — 이 문자열을 바꾸면
// backup.ts의 validAppNames도 같이 맞춰야 기존 백업 파일 가져오기가 안 깨진다.
export const APP_SYSTEM_NAME = isDemoBuild() ? 'Demo Hotel Management System' : 'Locker Manager System';
// 백업 파일명 접두어는 매장 이름(storeId)이 있으면 그걸 쓰고, 없으면 일반 이름으로 폴백한다.
export const BACKUP_PREFIX = isDemoBuild() ? 'demo' : (getCachedStoreProfile()?.storeId ?? 'locker');

// ── IndexedDB 설정 (메인 저장소: 비동기, 압축 불필요, UI 블로킹 없음) ──
const IDB_NAME = 'hotel_idb';
const IDB_VERSION = 2;
const IDB_STORE = 'database';
const IDB_META_STORE = 'meta';
const IDB_KEY = 'main';

function _openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(IDB_STORE)) {
        database.createObjectStore(IDB_STORE);
      }
      if (!database.objectStoreNames.contains(IDB_META_STORE)) {
        database.createObjectStore(IDB_META_STORE);
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

/** 앱 세션 메타(라이선스·로그인 등) — DB와 같은 IDB에 보관해 PWA 재실행 시 유지 */
export async function saveAppMeta(key: string, value: string): Promise<void> {
  await saveIdbMetaValue(key, value);
}

/** IndexedDB meta 저장 (문자열·디렉터리 핸들 등 structured clone 가능 값) */
export async function saveIdbMetaValue(key: string, value: unknown): Promise<void> {
  try {
    const idb = await _openIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_META_STORE, 'readwrite');
      tx.objectStore(IDB_META_STORE).put(value, key);
      tx.oncomplete = () => { idb.close(); resolve(); };
      tx.onerror = () => { idb.close(); reject(tx.error); };
    });
  } catch (err) {
    console.warn('saveIdbMetaValue failed', key, err);
  }
}

export async function loadIdbMetaValue<T = unknown>(key: string): Promise<T | null> {
  try {
    const idb = await _openIDB();
    return await new Promise((resolve) => {
      try {
        if (!idb.objectStoreNames.contains(IDB_META_STORE)) {
          idb.close();
          resolve(null);
          return;
        }
        const tx = idb.transaction(IDB_META_STORE, 'readonly');
        const req = tx.objectStore(IDB_META_STORE).get(key);
        req.onsuccess = () => {
          idb.close();
          resolve((req.result as T) ?? null);
        };
        req.onerror = () => { idb.close(); resolve(null); };
      } catch {
        try { idb.close(); } catch {}
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function loadAppMeta(key: string): Promise<string | null> {
  try {
    const idb = await _openIDB();
    return await new Promise((resolve) => {
      try {
        if (!idb.objectStoreNames.contains(IDB_META_STORE)) {
          idb.close();
          resolve(null);
          return;
        }
        const tx = idb.transaction(IDB_META_STORE, 'readonly');
        const req = tx.objectStore(IDB_META_STORE).get(key);
        req.onsuccess = () => {
          idb.close();
          resolve(typeof req.result === 'string' ? req.result : null);
        };
        req.onerror = () => { idb.close(); resolve(null); };
      } catch {
        try { idb.close(); } catch {}
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function deleteAppMeta(key: string): Promise<void> {
  try {
    const idb = await _openIDB();
    await new Promise<void>((resolve) => {
      try {
        if (!idb.objectStoreNames.contains(IDB_META_STORE)) {
          idb.close();
          resolve();
          return;
        }
        const tx = idb.transaction(IDB_META_STORE, 'readwrite');
        tx.objectStore(IDB_META_STORE).delete(key);
        tx.oncomplete = () => { idb.close(); resolve(); };
        tx.onerror = () => { idb.close(); resolve(); };
      } catch {
        try { idb.close(); } catch {}
        resolve();
      }
    });
  } catch {
    // ignore
  }
}

export function getSystemMeta(key: string): string | null {
  if (!db) return null;
  try {
    const result = db.exec(`SELECT value FROM system_metadata WHERE key = ?`, [key]);
    if (result.length > 0 && result[0].values.length > 0) {
      return String(result[0].values[0][0]);
    }
  } catch (err) {
    console.warn('getSystemMeta failed', key, err);
  }
  return null;
}

export function setSystemMeta(key: string, value: string): void {
  if (!db) return;
  try {
    db.run(
      `INSERT OR REPLACE INTO system_metadata (key, value) VALUES (?, ?)`,
      [key, value]
    );
    saveDatabase();
  } catch (err) {
    console.warn('setSystemMeta failed', key, err);
  }
}

export function deleteSystemMeta(key: string): void {
  if (!db) return;
  try {
    db.run(`DELETE FROM system_metadata WHERE key = ?`, [key]);
    saveDatabase();
  } catch (err) {
    console.warn('deleteSystemMeta failed', key, err);
  }
}

/** SQLite에 저장된 라이선스·로그인을 localStorage로 복구 (PWA 재실행 유지) */
export function restoreSessionFromDatabase(): void {
  if (!db) return;
  try {
    const license = getSystemMeta('app_license_key');
    if (license) {
      try {
        localStorage.setItem(LICENSE_STORAGE_KEY, license.toUpperCase());
      } catch {}
      void saveAppMeta('app_license_key', license.toUpperCase());
    } else {
      // localStorage에만 있으면 DB로 승격
      try {
        const fromLs = localStorage.getItem(LICENSE_STORAGE_KEY);
        if (fromLs) setSystemMeta('app_license_key', fromLs.toUpperCase());
      } catch {}
    }

    const auth = getSystemMeta('app_authenticated');
    if (auth === 'true') {
      try {
        localStorage.setItem('authenticated', 'true');
      } catch {}
      void saveAppMeta('app_authenticated', 'true');
    } else {
      try {
        if (localStorage.getItem('authenticated') === 'true') {
          setSystemMeta('app_authenticated', 'true');
        }
      } catch {}
    }
  } catch (err) {
    console.warn('restoreSessionFromDatabase failed', err);
  }
}

export function persistLicenseToDatabase(licenseKey: string | null): void {
  if (licenseKey) {
    setSystemMeta('app_license_key', licenseKey.toUpperCase());
    void saveAppMeta('app_license_key', licenseKey.toUpperCase());
  } else {
    deleteSystemMeta('app_license_key');
    void deleteAppMeta('app_license_key');
  }
}

export function persistAuthToDatabase(authenticated: boolean): void {
  if (authenticated) {
    setSystemMeta('app_authenticated', 'true');
    void saveAppMeta('app_authenticated', 'true');
  } else {
    deleteSystemMeta('app_authenticated');
    void deleteAppMeta('app_authenticated');
  }
}

const DB_META_KEY = 'rest_hotel_db_meta';
const SAVE_DEBOUNCE_MS = 350;
/** localStorage 전체 백업은 소용량일 때만 (대용량 base64는 UI 멈춤 원인) */
const LS_FULL_BACKUP_MAX_BYTES = 350_000;

let _allowDbShrink = false;
let _persistedBytes = 0;
let _saveChain: Promise<void> = Promise.resolve();
let _saveDebouncedTimer: ReturnType<typeof setTimeout> | null = null;
let _persistRequested = false;
let _persistScheduled = false;

function _readPersistMetaSize(): number {
  try {
    const raw = localStorage.getItem(DB_META_KEY);
    if (!raw) return 0;
    const m = JSON.parse(raw);
    return typeof m?.size === 'number' && m.size > 0 ? m.size : 0;
  } catch {
    return 0;
  }
}

function _writePersistMeta(size: number) {
  _persistedBytes = size;
  try {
    localStorage.setItem(DB_META_KEY, JSON.stringify({ size, ts: Date.now() }));
  } catch {}
}

async function _saveToIDB(data: Uint8Array): Promise<void> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const idb = await _openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(copy, IDB_KEY);
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => { idb.close(); reject(tx.error); };
  });
}

async function _loadFromIDB(): Promise<Uint8Array | null> {
  try {
    const idb = await _openIDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        idb.close();
        const result = req.result;
        if (!result) { resolve(null); return; }
        if (result instanceof Uint8Array) { resolve(result); return; }
        if (result instanceof ArrayBuffer) { resolve(new Uint8Array(result)); return; }
        if (result && typeof result === 'object' && 'buffer' in result && (result as ArrayBufferView).buffer instanceof ArrayBuffer) {
          const view = result as ArrayBufferView;
          resolve(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
          return;
        }
        resolve(null);
      };
      req.onerror = () => { idb.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

async function _idbHasMain(): Promise<boolean> {
  try {
    const idb = await _openIDB();
    return await new Promise((resolve) => {
      try {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => {
          const v = req.result;
          idb.close();
          if (!v) resolve(false);
          else if (v instanceof Uint8Array) resolve(v.byteLength > 0);
          else if (v instanceof ArrayBuffer) resolve(v.byteLength > 0);
          else resolve(!!v);
        };
        req.onerror = () => { idb.close(); resolve(false); };
      } catch {
        try { idb.close(); } catch {}
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/** 구버전(OPFS) 데이터가 있으면 1회만 읽어 IDB로 이관 */
async function _loadFromOPFSOnce(): Promise<Uint8Array | null> {
  try {
    const storage = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (!storage?.getDirectory) return null;
    const root = await storage.getDirectory();
    const fh = await root.getFileHandle('rest_hotel.sqlite');
    const file = await fh.getFile();
    if (!file || file.size <= 0) return null;
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function _saveDatabaseToLocalStorage(data: Uint8Array): boolean {
  if (data.length > LS_FULL_BACKUP_MAX_BYTES) {
    try { localStorage.removeItem(DB_NAME); } catch {}
    return false;
  }
  const chunkSize = 65535;
  let binary = '';
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  const base64 = btoa(binary);
  try {
    const compressed = LZString.compressToUTF16(base64);
    localStorage.setItem(DB_NAME, compressed);
    return true;
  } catch {
    try {
      localStorage.setItem(DB_NAME, base64);
      return true;
    } catch {
      return false;
    }
  }
}

function _decodeLocalStorageDb(savedDb: string): Uint8Array | null {
  try {
    let base64: string;
    try {
      const decompressed = LZString.decompressFromUTF16(savedDb);
      base64 = decompressed || savedDb;
    } catch {
      base64 = savedDb;
    }
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function _shouldBlockShrink(nextSize: number): boolean {
  if (_allowDbShrink) return false;
  const known = Math.max(_persistedBytes, _readPersistMetaSize());
  if (known > 20000 && nextSize < known * 0.25) return true;
  if (known > 8000 && nextSize < 4500) return true;
  return false;
}

/** 메인 저장: IndexedDB만. LS는 IDB 실패 + 소용량일 때만. */
async function _persistAll(data: Uint8Array): Promise<void> {
  if (_shouldBlockShrink(data.length)) {
    console.error('[DB] Blocked shrink overwrite', {
      known: Math.max(_persistedBytes, _readPersistMetaSize()),
      next: data.length,
    });
    return;
  }

  try {
    await _saveToIDB(data);
    _writePersistMeta(data.length);
    _allowDbShrink = false;
    return;
  } catch (err) {
    console.warn('[DB] IndexedDB save failed, trying localStorage fallback', err);
  }

  if (_saveDatabaseToLocalStorage(data)) {
    _writePersistMeta(data.length);
    _allowDbShrink = false;
  } else {
    console.error('[DB] Persist failed');
  }
}

function _openFromBytes(buf: Uint8Array): Database {
  const opened = new SQL!.Database(buf);
  db = opened;
  _persistedBytes = Math.max(_persistedBytes, buf.length, _readPersistMetaSize());
  migrateDatabase();
  return opened;
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => '/' + file
    });
  }

  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {}

  _persistedBytes = _readPersistMetaSize();
  const idbHadData = await _idbHasMain();

  // 1) IndexedDB
  try {
    const idbData = await _loadFromIDB();
    if (idbData && idbData.length > 0) {
      return _openFromBytes(idbData);
    }
  } catch (err) {
    console.error('[DB] IndexedDB open failed', err);
  }

  // 2) 구버전 OPFS → IDB 이관 (이후 OPFS 미사용)
  try {
    const opfsData = await _loadFromOPFSOnce();
    if (opfsData && opfsData.length > 0) {
      console.log('[DB] migrating OPFS → IndexedDB', opfsData.length);
      const opened = _openFromBytes(opfsData);
      void _saveToIDB(opfsData).then(() => _writePersistMeta(opfsData.length));
      return opened;
    }
  } catch {}

  // 3) 예전 localStorage 백업
  const lsRaw = localStorage.getItem(DB_NAME);
  if (lsRaw) {
    const buf = _decodeLocalStorageDb(lsRaw);
    if (buf && buf.length > 0) {
      try {
        const opened = _openFromBytes(buf);
        void _persistAll(buf);
        return opened;
      } catch (err) {
        console.error('[DB] localStorage DB open failed', err);
      }
    }
  }

  if (idbHadData) {
    throw new Error(
      '저장된 입실 데이터베이스를 열 수 없습니다. 앱을 다시 열어주세요.'
    );
  }

  _allowDbShrink = true;
  db = new SQL.Database();
  createTables();
  return db;
}

export function saveDatabaseDebounced() {
  if (_saveDebouncedTimer) clearTimeout(_saveDebouncedTimer);
  _saveDebouncedTimer = setTimeout(() => {
    _saveDebouncedTimer = null;
    saveDatabase();
  }, SAVE_DEBOUNCE_MS);
}

/** 앱 숨김 시 pending 저장 flush */
export function flushDatabaseSync() {
  if (_saveDebouncedTimer) {
    clearTimeout(_saveDebouncedTimer);
    _saveDebouncedTimer = null;
  }
  if (!db) return;
  try {
    const data = db.export();
    if (_shouldBlockShrink(data.length)) return;
    _writePersistMeta(data.length);
    void _saveToIDB(data).catch((err) => console.warn('[DB] flush IDB failed', err));
  } catch (err) {
    console.warn('[DB] flushDatabaseSync failed', err);
  }
}

if (typeof window !== 'undefined') {
  const onHide = () => flushDatabaseSync();
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
}

export function saveDatabase() {
  if (!db) return;
  _persistRequested = true;
  if (_persistScheduled) return;
  _persistScheduled = true;
  _saveChain = _saveChain
    .then(async () => {
      try {
        while (_persistRequested && db) {
          _persistRequested = false;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          if (!db) return;
          const data = db.export();
          await _persistAll(data);
        }
      } finally {
        _persistScheduled = false;
        if (_persistRequested) saveDatabase();
      }
    })
    .catch((err) => {
      console.warn('[DB] save chain error', err);
    });
}

export async function saveDatabaseAsync(): Promise<void> {
  if (!db) return;
  if (_saveDebouncedTimer) {
    clearTimeout(_saveDebouncedTimer);
    _saveDebouncedTimer = null;
  }
  saveDatabase();
  await _saveChain;
}

export function allowDatabaseShrink(): void {
  _allowDbShrink = true;
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
      
      // Check if 'direct_price', 'transfer', 'customer_memo', and 'free' are already in the CHECK constraints
      const needsMigration = !createSql.includes('direct_price') || !createSql.includes('transfer') || !createSql.includes('customer_memo') || !createSql.includes("'free'");
      
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
              option_type TEXT NOT NULL CHECK(option_type IN ('none', 'discount', 'custom', 'foreigner', 'direct_price', 'free')),
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
              additional_fees INTEGER DEFAULT 0,
              additional_fee_paid INTEGER DEFAULT 0,
              additional_fee_paid_amount INTEGER DEFAULT 0,
              parent_locker INTEGER,
              deferred_payment INTEGER DEFAULT 0,
              customer_memo TEXT
            )
          `);
          
          // Copy data back (explicitly map columns to handle schema changes)
          db.run(`INSERT INTO locker_logs (id, locker_number, entry_time, exit_time, business_day, time_type, base_price, option_type, option_amount, final_price, status, cancelled, notes, payment_method, payment_cash, payment_card, payment_transfer, rental_items, additional_fees, additional_fee_paid, additional_fee_paid_amount, parent_locker, deferred_payment, customer_memo) 
            SELECT id, locker_number, entry_time, exit_time, business_day, time_type, base_price, option_type, option_amount, final_price, status, cancelled, notes, payment_method, 
              COALESCE(payment_cash, 0), COALESCE(payment_card, 0), COALESCE(payment_transfer, 0), rental_items, COALESCE(additional_fees, 0), 0, 0, parent_locker, COALESCE(deferred_payment, 0), customer_memo 
            FROM locker_logs_backup`);
          
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
    
    // Step 4.6.1: Add additional_fee_paid column to locker_logs (for tracking if additional fee was paid before checkout)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN additional_fee_paid INTEGER DEFAULT 0`);
      console.log('Added additional_fee_paid column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 4.6.2: Add additional_fee_paid_amount column to locker_logs (cumulative paid amount for tracking new accruals)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN additional_fee_paid_amount INTEGER DEFAULT 0`);
      console.log('Added additional_fee_paid_amount column to locker_logs');
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
    try {
      db.run(`ALTER TABLE rental_transactions ADD COLUMN return_completed INTEGER DEFAULT 0`);
      console.log('Added return_completed column to rental_transactions');
    } catch (e) {}
    try {
      db.run(`ALTER TABLE rental_transactions ADD COLUMN quantity INTEGER DEFAULT 1`);
      console.log('Added quantity column to rental_transactions');
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
        billing_type TEXT NOT NULL DEFAULT 'rental' CHECK(billing_type IN ('rental', 'simple')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Add billing_type column if it doesn't exist (migration for existing tables)
    try {
      db.run(`ALTER TABLE additional_revenue_items ADD COLUMN billing_type TEXT NOT NULL DEFAULT 'rental' CHECK(billing_type IN ('rental', 'simple'))`);
      console.log('Added billing_type column to additional_revenue_items');
    } catch (e) {
      // Column already exists, ignore
    }
    
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
    
    // Step 8: No default rental items - user will add their own items in settings
    
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
    
    // Step 12: Add parent_locker column to locker_logs for locker linking
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN parent_locker INTEGER`);
      console.log('Added parent_locker column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 13: Create barcode_mappings table if not exists
    db.run(`
      CREATE TABLE IF NOT EXISTS barcode_mappings (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL UNIQUE,
        locker_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Step 14: Create scan_logs table for tracking all barcode scans
    db.run(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id TEXT PRIMARY KEY,
        locker_number INTEGER NOT NULL,
        scan_time TEXT NOT NULL,
        business_day TEXT NOT NULL,
        processed INTEGER NOT NULL DEFAULT 0
      )
    `);
    
    // Step 15: Create rfid_mappings table for RFID tag mappings
    db.run(`
      CREATE TABLE IF NOT EXISTS rfid_mappings (
        id TEXT PRIMARY KEY,
        rfid_uid TEXT NOT NULL UNIQUE,
        locker_number INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Step 16: Add deferred_payment column to locker_logs (후불결제 여부)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN deferred_payment INTEGER DEFAULT 0`);
      console.log('Added deferred_payment column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 17: Add customer_memo column to locker_logs (손님 메모)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN customer_memo TEXT`);
      console.log('Added customer_memo column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 18: Clean up invalid daily summaries with NULL or empty business_day
    try {
      const invalidResult = db.exec(`SELECT COUNT(*) FROM locker_daily_summaries WHERE business_day IS NULL OR business_day = ''`);
      const invalidCount = invalidResult.length > 0 ? invalidResult[0].values[0][0] : 0;
      if (invalidCount && Number(invalidCount) > 0) {
        db.run(`DELETE FROM locker_daily_summaries WHERE business_day IS NULL OR business_day = ''`);
        console.log(`Cleaned up ${invalidCount} invalid daily summary records with NULL business_day`);
      }
    } catch (e) {
      console.error('Failed to cleanup invalid daily summaries:', e);
    }
    
    // Step 19: Create pricing_options table for customizable pricing options
    db.run(`
      CREATE TABLE IF NOT EXISTS pricing_options (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        option_type TEXT NOT NULL CHECK(option_type IN ('discount', 'surcharge', 'fixed')),
        amount INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    
    // Step 20: Add no_additional_fee column to locker_logs (무료입장 손님 추가요금 면제)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN no_additional_fee INTEGER DEFAULT 0`);
      console.log('Added no_additional_fee column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 21: Add prepaid_additional_fee column to locker_logs (추가요금 선지급)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN prepaid_additional_fee INTEGER DEFAULT 0`);
      console.log('Added prepaid_additional_fee column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 22: Add is_cash_receipt column to locker_logs (현금영수증 발행 여부)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN is_cash_receipt INTEGER DEFAULT 0`);
      console.log('Added is_cash_receipt column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Step 23: Add additional_fee_payment_method column to locker_logs (추가요금 결제방식)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN additional_fee_payment_method TEXT CHECK(additional_fee_payment_method IN ('card', 'cash', 'transfer'))`);
      console.log('Added additional_fee_payment_method column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }

    // Step 24: Add refund columns to locker_logs (환불 처리)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN refund_amount INTEGER DEFAULT 0`);
      console.log('Added refund_amount column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN refund_note TEXT`);
      console.log('Added refund_note column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN refund_time TEXT`);
      console.log('Added refund_time column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }

    // Step 25: Add refund_method column to locker_logs (환불 결제수단)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN refund_method TEXT DEFAULT 'cash'`);
      console.log('Added refund_method column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }

    // Step 26: Add is_outing column to locker_logs (외출 중 여부)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN is_outing INTEGER DEFAULT 0`);
      console.log('Added is_outing column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }

    // Step 27: Add is_staff column to locker_logs (직원 입실 여부)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN is_staff INTEGER DEFAULT 0`);
      console.log('Added is_staff column to locker_logs');
    } catch (e) {
      // Column already exists, ignore
    }

    // Step 28: Create performance indexes (IF NOT EXISTS → 기존 DB에도 안전하게 적용)
    // 쿼리 속도 최적화: 기존 DB에 인덱스가 없으면 매 쿼리마다 전체 테이블 스캔 발생
    try {
      db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_status ON locker_logs(status)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_business_day ON locker_logs(business_day)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_entry_time ON locker_logs(entry_time)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_locker_number ON locker_logs(locker_number)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_scan_logs_business_day ON scan_logs(business_day)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_scan_logs_scan_time ON scan_logs(scan_time)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_additional_fee_events_business_day ON additional_fee_events(business_day)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_additional_fee_events_locker_log_id ON additional_fee_events(locker_log_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_rental_transactions_business_day ON rental_transactions(business_day)`);
      console.log('Created performance indexes (Step 28)');
    } catch (e) {
      // Ignore errors (table may not exist yet)
    }

    // Step 28 후처리: VACUUM으로 DB 크기 축소 후 즉시 저장
    // 최초 1회만 실행 (매 시작마다 VACUUM 방지 → localStorage 플래그 사용)
    const vacuumDone = localStorage.getItem('db_vacuum_step28');
    if (!vacuumDone) {
      try {
        db.run('VACUUM');
        localStorage.setItem('db_vacuum_step28', '1');
        console.log('VACUUM completed after Step 28 migration (one-time)');
      } catch (e) {
        // VACUUM 실패해도 계속 진행
      }
    }
    // 저장은 마이그레이션 끝에서 1회만 (대용량 DB에서 부팅 이중 export 방지)

    // Step 29: 직원관리 테이블 추가 (staff, staff_work_logs, staff_ratings)
    try {
      db.run(`CREATE TABLE IF NOT EXISTS staff (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        address TEXT DEFAULT '',
        hire_date TEXT DEFAULT '',
        hourly_pay INTEGER DEFAULT 0,
        part_time_hours REAL DEFAULT 0,
        pin TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT ''
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS staff_work_logs (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL,
        work_date TEXT NOT NULL,
        start_time TEXT DEFAULT '',
        end_time TEXT DEFAULT '',
        break_minutes INTEGER DEFAULT 0,
        work_minutes INTEGER DEFAULT 0,
        daily_pay INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS staff_ratings (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL,
        rating_date TEXT NOT NULL,
        rating TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT ''
      )`);
      console.log('Created staff management tables (Step 29)');
    } catch (e) {
      // 이미 존재하면 무시
    }

    // Step 30: 직원 사진 및 합의 근무시간 컬럼 추가
    try {
      db.run(`ALTER TABLE staff ADD COLUMN photo TEXT DEFAULT ''`);
      console.log('Added photo column to staff (Step 30)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE staff_work_logs ADD COLUMN agreed_start_time TEXT DEFAULT ''`);
      console.log('Added agreed_start_time column to staff_work_logs (Step 30)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE staff_work_logs ADD COLUMN agreed_end_time TEXT DEFAULT ''`);
      console.log('Added agreed_end_time column to staff_work_logs (Step 30)');
    } catch (e) { /* 이미 존재하면 무시 */ }

    // Step 31: 근무구간 페이타입 및 직접입력 금액 컬럼 추가
    try {
      db.run(`ALTER TABLE staff_work_logs ADD COLUMN pay_type TEXT DEFAULT '주간'`);
      console.log('Added pay_type column to staff_work_logs (Step 31)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE staff_work_logs ADD COLUMN segment_pay INTEGER DEFAULT 0`);
      console.log('Added segment_pay column to staff_work_logs (Step 31)');
    } catch (e) { /* 이미 존재하면 무시 */ }

    // Step 32: 시간당 페이 컬럼 추가 (총액 역산 없이 원래 입력값 보존)
    try {
      db.run(`ALTER TABLE staff_work_logs ADD COLUMN hourly_rate INTEGER DEFAULT 0`);
      console.log('Added hourly_rate column to staff_work_logs (Step 32)');
    } catch (e) { /* 이미 존재하면 무시 */ }

    // Step 33: 장기투숙 필드
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN is_long_term INTEGER DEFAULT 0`);
      console.log('Added is_long_term column to locker_logs (Step 33)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN planned_checkout_at TEXT`);
      console.log('Added planned_checkout_at column to locker_logs (Step 33)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN long_term_daily_fee INTEGER DEFAULT 0`);
      console.log('Added long_term_daily_fee column to locker_logs (Step 33)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN long_term_discount INTEGER DEFAULT 0`);
      console.log('Added long_term_discount column to locker_logs (Step 33)');
    } catch (e) { /* 이미 존재하면 무시 */ }
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN long_term_days INTEGER DEFAULT 0`);
      console.log('Added long_term_days column to locker_logs (Step 33)');
    } catch (e) { /* 이미 존재하면 무시 */ }

    // Step 34: 추가요금 할인액 (수정저장 후 재오픈·퇴실 시 반영)
    try {
      db.run(`ALTER TABLE locker_logs ADD COLUMN additional_fee_discount INTEGER DEFAULT 0`);
      console.log('Added additional_fee_discount column to locker_logs (Step 34)');
    } catch (e) { /* 이미 존재하면 무시 */ }

    // Step 35: 자동 백업 후에도 매출리포트용 일별 집계 스냅샷
    db.run(`
      CREATE TABLE IF NOT EXISTS report_daily_snapshots (
        business_day TEXT PRIMARY KEY,
        total_visitors INTEGER NOT NULL DEFAULT 0,
        total_sales INTEGER NOT NULL DEFAULT 0,
        cancellations INTEGER NOT NULL DEFAULT 0,
        total_discount INTEGER NOT NULL DEFAULT 0,
        foreigner_count INTEGER NOT NULL DEFAULT 0,
        foreigner_sales INTEGER NOT NULL DEFAULT 0,
        day_visitors INTEGER NOT NULL DEFAULT 0,
        night_visitors INTEGER NOT NULL DEFAULT 0,
        actual_visitors INTEGER NOT NULL DEFAULT 0,
        cancelled_visitors INTEGER NOT NULL DEFAULT 0,
        free_visitors INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT NOT NULL
      )
    `);
    console.log('Ensured report_daily_snapshots table (Step 35)');

    // Step 36: 근무다이어리 테이블 추가 (파트타임 스케줄·시급구간·주급지급일·날짜별 대체근무·지급완료 기록)
    try {
      db.run(`CREATE TABLE IF NOT EXISTS part_time_templates (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL,
        days_of_week TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        label TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ''
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS wage_tiers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        days_of_week TEXT NOT NULL,
        include_holidays INTEGER DEFAULT 0,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        hourly_rate INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT ''
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS staff_paydays (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        time TEXT NOT NULL,
        is_enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ''
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS staff_schedule_overrides (
        id TEXT PRIMARY KEY,
        schedule_date TEXT NOT NULL,
        template_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT ''
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS staff_payday_completions (
        id TEXT PRIMARY KEY,
        staff_id TEXT NOT NULL,
        week_start_date TEXT NOT NULL,
        completed_at TEXT DEFAULT ''
      )`);
      console.log('Created work diary tables (Step 36)');
    } catch (e) {
      // 이미 존재하면 무시
    }

    // Step 37: part_time_templates에 group_id 추가 — 같은 파트타임(요일·시간)에
    // 근무자를 여러 명 묶어서 등록할 수 있도록 그룹 단위 식별자 도입
    try {
      db.run(`ALTER TABLE part_time_templates ADD COLUMN group_id TEXT`);
    } catch (e) {
      // 이미 컬럼이 있으면 무시
    }
    try {
      db.run(`UPDATE part_time_templates SET group_id = id WHERE group_id IS NULL OR group_id = ''`);
      console.log('Backfilled part_time_templates.group_id (Step 37)');
    } catch (e) {
      // 무시
    }

    saveDatabase();

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
      option_type TEXT NOT NULL CHECK(option_type IN ('none', 'discount', 'custom', 'foreigner', 'direct_price', 'free')),
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
      additional_fees INTEGER DEFAULT 0,
      additional_fee_paid INTEGER DEFAULT 0,
      additional_fee_paid_amount INTEGER DEFAULT 0,
      parent_locker INTEGER,
      deferred_payment INTEGER DEFAULT 0,
      customer_memo TEXT,
      no_additional_fee INTEGER DEFAULT 0,
      prepaid_additional_fee INTEGER DEFAULT 0,
      is_cash_receipt INTEGER DEFAULT 0,
      additional_fee_payment_method TEXT CHECK(additional_fee_payment_method IN ('card', 'cash', 'transfer')),
      refund_amount INTEGER DEFAULT 0,
      refund_note TEXT,
      refund_time TEXT,
      refund_method TEXT DEFAULT 'cash',
      is_outing INTEGER DEFAULT 0,
      is_staff INTEGER DEFAULT 0,
      is_long_term INTEGER DEFAULT 0,
      planned_checkout_at TEXT,
      long_term_daily_fee INTEGER DEFAULT 0,
      long_term_discount INTEGER DEFAULT 0,
      long_term_days INTEGER DEFAULT 0,
      additional_fee_discount INTEGER DEFAULT 0
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

  db.run(`
    CREATE TABLE IF NOT EXISTS report_daily_snapshots (
      business_day TEXT PRIMARY KEY,
      total_visitors INTEGER NOT NULL DEFAULT 0,
      total_sales INTEGER NOT NULL DEFAULT 0,
      cancellations INTEGER NOT NULL DEFAULT 0,
      total_discount INTEGER NOT NULL DEFAULT 0,
      foreigner_count INTEGER NOT NULL DEFAULT 0,
      foreigner_sales INTEGER NOT NULL DEFAULT 0,
      day_visitors INTEGER NOT NULL DEFAULT 0,
      night_visitors INTEGER NOT NULL DEFAULT 0,
      actual_visitors INTEGER NOT NULL DEFAULT 0,
      cancelled_visitors INTEGER NOT NULL DEFAULT 0,
      free_visitors INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT NOT NULL
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
      billing_type TEXT NOT NULL DEFAULT 'rental' CHECK(billing_type IN ('rental', 'simple')),
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
      return_completed INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 1,
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

  // Barcode mappings table (바코드 매핑: 락카키 바코드 ↔ 락카번호)
  db.run(`
    CREATE TABLE IF NOT EXISTS barcode_mappings (
      id TEXT PRIMARY KEY,
      barcode TEXT NOT NULL UNIQUE,
      locker_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // RFID mappings table (RFID 매핑: 락카키 RFID ↔ 락카번호)
  db.run(`
    CREATE TABLE IF NOT EXISTS rfid_mappings (
      id TEXT PRIMARY KEY,
      rfid_uid TEXT NOT NULL UNIQUE,
      locker_number INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Scan logs table (바코드/RFID 스캔 기록 추적)
  db.run(`
    CREATE TABLE IF NOT EXISTS scan_logs (
      id TEXT PRIMARY KEY,
      locker_number INTEGER NOT NULL,
      scan_time TEXT NOT NULL,
      business_day TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Pricing options table (요금옵션: 할인/할증/지정)
  db.run(`
    CREATE TABLE IF NOT EXISTS pricing_options (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      option_type TEXT NOT NULL CHECK(option_type IN ('discount', 'surcharge', 'fixed')),
      amount INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Staff management tables (직원관리)
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    hire_date TEXT DEFAULT '',
    hourly_pay INTEGER DEFAULT 0,
    part_time_hours REAL DEFAULT 0,
    pin TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    photo TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_work_logs (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    work_date TEXT NOT NULL,
    start_time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    break_minutes INTEGER DEFAULT 0,
    work_minutes INTEGER DEFAULT 0,
    daily_pay INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT '',
    agreed_start_time TEXT DEFAULT '',
    agreed_end_time TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_ratings (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    rating_date TEXT NOT NULL,
    rating TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT ''
  )`);

  // 근무다이어리 테이블 (파트타임 스케줄·시급구간·주급지급일·날짜별 대체근무·지급완료 기록)
  // group_id: 같은 파트타임(요일·시간)에 근무자가 여러 명이면 같은 group_id를 공유 (근무자별로 한 행씩)
  db.run(`CREATE TABLE IF NOT EXISTS part_time_templates (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    days_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    label TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT '',
    group_id TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS wage_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    days_of_week TEXT NOT NULL,
    include_holidays INTEGER DEFAULT 0,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    hourly_rate INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_paydays (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    time TEXT NOT NULL,
    is_enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_schedule_overrides (
    id TEXT PRIMARY KEY,
    schedule_date TEXT NOT NULL,
    template_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS staff_payday_completions (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    completed_at TEXT DEFAULT ''
  )`);

  // 성능 인덱스: 자주 사용되는 쿼리 최적화
  db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_status ON locker_logs(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_business_day ON locker_logs(business_day)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_entry_time ON locker_logs(entry_time)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_locker_logs_locker_number ON locker_logs(locker_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_scan_logs_business_day ON scan_logs(business_day)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_scan_logs_scan_time ON scan_logs(scan_time)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_additional_fee_events_business_day ON additional_fee_events(business_day)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rental_transactions_business_day ON rental_transactions(business_day)`);

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
    allowDatabaseShrink();
    
    // Drop all existing tables
    const tables = ['locker_logs', 'locker_daily_summaries', 'locker_groups', 
                   'system_metadata', 'additional_fee_events', 'additional_revenue_items', 
                   'rental_transactions', 'expenses', 'closing_days', 'barcode_mappings', 
                   'rfid_mappings', 'scan_logs', 'pricing_options'];
    
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
    
    // No default rental items - user will add their own items in settings
    
    // VACUUM: 삭제된 페이지 공간 회수 → saveDatabase() 크기/속도 정상화
    db!.run('VACUUM');
    console.log('[Force Regenerate] Database regeneration completed successfully');
    saveDatabase();
    return true;
  } catch (error) {
    console.error('[Force Regenerate] Error during database regeneration:', error);
    return false;
  }
}

// Generate UUID
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
// Helper function to convert SQL result rows to objects
export function rowsToObjects(result: { columns: string[]; values: any[][] }): any[] {
  return result.values.map(row => {
    const obj: any = {};
    result.columns.forEach((col, idx) => {
      let value = row[idx];
      
      // Convert camelCase column names
      const camelCol = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      
      // Convert numeric strings to numbers where appropriate
      // Exclude columns ending with _method (text values like 'cash', 'card', 'transfer')
      const isMethodColumn = col.endsWith('_method');
      if (!isMethodColumn && (col.includes('number') || col.includes('price') || col.includes('amount') || col.includes('count') || col.includes('visitors') || col.includes('sales') || col.includes('order') || col.includes('fee') || col.includes('revenue'))) {
        value = typeof value === 'number' ? value : (value ? parseInt(value as string) : value);
      }
      
      // Convert boolean fields
      if (col === 'cancelled' || col === 'deferred_payment' || col === 'no_additional_fee' || col === 'is_cash_receipt' || col === 'is_outing' || col === 'is_staff' || col === 'is_long_term') {
        value = value === 1;
      }
      
      obj[camelCol] = value;
    });
    return obj;
  });
}
/** YYYY-MM-DD 형식 검사 */
export function _isBusinessDay(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

