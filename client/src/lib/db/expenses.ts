import { db, generateId, rowsToObjects, saveDatabaseDebounced } from './core';


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
  
  saveDatabaseDebounced();
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
  
  saveDatabaseDebounced();
}

export function deleteExpense(id: string) {
  if (!db) throw new Error('Database not initialized');
  
  db.run('DELETE FROM expenses WHERE id = ?', [id]);
  saveDatabaseDebounced();
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
    
    saveDatabaseDebounced();
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
  
  saveDatabaseDebounced();
  return id;
}

export function deleteExpenseCategory(id: string) {
  if (!db) throw new Error('Database not initialized');
  
  // Only allow deletion of non-default categories
  db.run('DELETE FROM expense_categories WHERE id = ? AND is_default = 0', [id]);
  saveDatabaseDebounced();
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
  
  saveDatabaseDebounced();
}

