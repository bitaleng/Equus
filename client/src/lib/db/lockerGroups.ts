import { db, generateId, rowsToObjects, saveDatabaseDebounced } from './core';

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

  saveDatabaseDebounced();
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
    saveDatabaseDebounced();
  }
}

export function deleteLockerGroup(id: string) {
  if (!db) throw new Error('Database not initialized');

  db.run('DELETE FROM locker_groups WHERE id = ?', [id]);
  saveDatabaseDebounced();
}

