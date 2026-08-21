import { db, saveDatabaseDebounced } from './core';

// =========================================
// Pricing Options CRUD Operations
// =========================================

export interface PricingOption {
  id: string;
  name: string;
  optionType: 'discount' | 'surcharge' | 'fixed';
  amount: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function getPricingOptions(): PricingOption[] {
  if (!db) return [];
  
  try {
    const result = db.exec(`
      SELECT id, name, option_type, amount, sort_order, is_active, created_at, updated_at
      FROM pricing_options
      ORDER BY sort_order ASC, created_at ASC
    `);
    
    if (result.length === 0) return [];
    
    return result[0].values.map(row => ({
      id: row[0] as string,
      name: row[1] as string,
      optionType: row[2] as 'discount' | 'surcharge' | 'fixed',
      amount: row[3] as number,
      sortOrder: row[4] as number,
      isActive: (row[5] as number) === 1,
      createdAt: row[6] as string,
      updatedAt: row[7] as string,
    }));
  } catch (error) {
    console.error('Error getting pricing options:', error);
    return [];
  }
}

export function getActivePricingOptions(): PricingOption[] {
  return getPricingOptions().filter(opt => opt.isActive);
}

export function createPricingOption(option: {
  name: string;
  optionType: 'discount' | 'surcharge' | 'fixed';
  amount: number;
  sortOrder?: number;
}): string {
  if (!db) throw new Error('Database not initialized');
  
  const id = `pricing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  const sortOrder = option.sortOrder ?? 0;
  
  db.run(
    `INSERT INTO pricing_options (id, name, option_type, amount, sort_order, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, option.name, option.optionType, option.amount, sortOrder, now, now]
  );
  
  saveDatabaseDebounced();
  return id;
}

export function updatePricingOption(id: string, updates: {
  name?: string;
  optionType?: 'discount' | 'surcharge' | 'fixed';
  amount?: number;
  sortOrder?: number;
  isActive?: boolean;
}): boolean {
  if (!db) return false;
  
  const sets: string[] = [];
  const values: any[] = [];
  
  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.optionType !== undefined) {
    sets.push('option_type = ?');
    values.push(updates.optionType);
  }
  if (updates.amount !== undefined) {
    sets.push('amount = ?');
    values.push(updates.amount);
  }
  if (updates.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sortOrder);
  }
  if (updates.isActive !== undefined) {
    sets.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  
  if (sets.length === 0) return false;
  
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  try {
    db.run(`UPDATE pricing_options SET ${sets.join(', ')} WHERE id = ?`, values);
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error updating pricing option:', error);
    return false;
  }
}

export function deletePricingOption(id: string): boolean {
  if (!db) return false;
  
  try {
    db.run('DELETE FROM pricing_options WHERE id = ?', [id]);
    saveDatabaseDebounced();
    return true;
  } catch (error) {
    console.error('Error deleting pricing option:', error);
    return false;
  }
}

export function calculatePriceWithOption(basePrice: number, option: PricingOption): number {
  switch (option.optionType) {
    case 'discount':
      return Math.max(0, basePrice - option.amount);
    case 'surcharge':
      return basePrice + option.amount;
    case 'fixed':
      return option.amount;
    default:
      return basePrice;
  }
}

// ============================================================
// STAFF MANAGEMENT (직원관리)
// ============================================================

