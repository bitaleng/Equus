import { db, saveDatabaseDebounced } from './core';

export interface Staff {
  id: string;
  name: string;
  phone: string;
  address: string;
  hireDate: string;
  hourlyPay: number;
  partTimeHours: number;
  pin: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  photo: string;
}

export type PayType = '주간' | '야간' | '주말' | '공휴일';

export interface StaffWorkLog {
  id: string;
  staffId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workMinutes: number;
  dailyPay: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  agreedStartTime: string;
  agreedEndTime: string;
  payType: PayType;
  segmentPay: number;
  hourlyRate: number;
}

export type StaffRatingValue = '훌륭' | '좋음' | '태만' | '경고';

export interface StaffRating {
  id: string;
  staffId: string;
  ratingDate: string;
  rating: StaffRatingValue;
  note: string;
  createdAt: string;
}

function rowToStaff(r: any[]): Staff {
  return {
    id: r[0], name: r[1], phone: r[2] || '', address: r[3] || '',
    hireDate: r[4] || '', hourlyPay: r[5] || 0, partTimeHours: r[6] || 0,
    pin: r[7] || '', isActive: r[8] === 1, notes: r[9] || '', createdAt: r[10] || '',
    photo: r[11] || '',
  };
}

function rowToWorkLog(r: any[]): StaffWorkLog {
  return {
    id: r[0], staffId: r[1], workDate: r[2], startTime: r[3] || '',
    endTime: r[4] || '', breakMinutes: r[5] || 0, workMinutes: r[6] || 0,
    dailyPay: r[7] || 0, notes: r[8] || '', createdAt: r[9] || '', updatedAt: r[10] || '',
    agreedStartTime: r[11] || '', agreedEndTime: r[12] || '',
    payType: (r[13] as PayType) || '주간', segmentPay: r[14] || 0, hourlyRate: r[15] || 0,
  };
}

export function createStaff(data: Omit<Staff, 'id' | 'createdAt'>): string {
  if (!db) return '';
  const id = `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO staff (id, name, phone, address, hire_date, hourly_pay, part_time_hours, pin, is_active, notes, created_at, photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.phone || '', data.address || '', data.hireDate || '',
     data.hourlyPay || 0, data.partTimeHours || 0, data.pin || '',
     data.isActive ? 1 : 0, data.notes || '', now, data.photo || '']
  );
  saveDatabaseDebounced();
  return id;
}

export function getAllStaff(activeOnly = false): Staff[] {
  if (!db) return [];
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  const rows = db.exec(`SELECT id, name, phone, address, hire_date, hourly_pay, part_time_hours, pin, is_active, notes, created_at, photo FROM staff ${where} ORDER BY name ASC`);
  if (!rows.length) return [];
  return rows[0].values.map(rowToStaff);
}

export function getStaffById(id: string): Staff | null {
  if (!db) return null;
  const rows = db.exec(`SELECT id, name, phone, address, hire_date, hourly_pay, part_time_hours, pin, is_active, notes, created_at, photo FROM staff WHERE id = ? LIMIT 1`, [id]);
  if (!rows.length || !rows[0].values.length) return null;
  return rowToStaff(rows[0].values[0]);
}

export function updateStaff(id: string, data: Partial<Omit<Staff, 'id' | 'createdAt'>>): boolean {
  if (!db) return false;
  const sets: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.phone !== undefined) { sets.push('phone = ?'); values.push(data.phone); }
  if (data.address !== undefined) { sets.push('address = ?'); values.push(data.address); }
  if (data.hireDate !== undefined) { sets.push('hire_date = ?'); values.push(data.hireDate); }
  if (data.hourlyPay !== undefined) { sets.push('hourly_pay = ?'); values.push(data.hourlyPay); }
  if (data.partTimeHours !== undefined) { sets.push('part_time_hours = ?'); values.push(data.partTimeHours); }
  if (data.pin !== undefined) { sets.push('pin = ?'); values.push(data.pin); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
  if (data.notes !== undefined) { sets.push('notes = ?'); values.push(data.notes); }
  if (data.photo !== undefined) { sets.push('photo = ?'); values.push(data.photo); }
  if (!sets.length) return false;
  values.push(id);
  db.run(`UPDATE staff SET ${sets.join(', ')} WHERE id = ?`, values);
  saveDatabaseDebounced();
  return true;
}

export function deleteStaff(id: string): boolean {
  if (!db) return false;
  db.run('DELETE FROM staff WHERE id = ?', [id]);
  db.run('DELETE FROM staff_work_logs WHERE staff_id = ?', [id]);
  db.run('DELETE FROM staff_ratings WHERE staff_id = ?', [id]);
  saveDatabaseDebounced();
  return true;
}

const WORK_LOG_SELECT = `SELECT id, staff_id, work_date, start_time, end_time, break_minutes, work_minutes, daily_pay, notes, created_at, updated_at, agreed_start_time, agreed_end_time, pay_type, segment_pay, hourly_rate FROM staff_work_logs`;

export function createWorkLog(data: Omit<StaffWorkLog, 'id' | 'createdAt' | 'updatedAt'>): string {
  if (!db) return '';
  const id = `wlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO staff_work_logs (id, staff_id, work_date, start_time, end_time, break_minutes, work_minutes, daily_pay, notes, created_at, updated_at, agreed_start_time, agreed_end_time, pay_type, segment_pay, hourly_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.staffId, data.workDate, data.startTime || '', data.endTime || '',
     data.breakMinutes || 0, data.workMinutes || 0, data.dailyPay || 0, data.notes || '', now, now,
     data.agreedStartTime || '', data.agreedEndTime || '',
     data.payType || '주간', data.segmentPay || 0, data.hourlyRate || 0]
  );
  saveDatabaseDebounced();
  return id;
}

export function getWorkLogs(staffId?: string, from?: string, to?: string): StaffWorkLog[] {
  if (!db) return [];
  const conditions: string[] = [];
  const params: any[] = [];
  if (staffId) { conditions.push('staff_id = ?'); params.push(staffId); }
  if (from) { conditions.push('work_date >= ?'); params.push(from); }
  if (to) { conditions.push('work_date <= ?'); params.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.exec(`${WORK_LOG_SELECT} ${where} ORDER BY work_date DESC, created_at ASC`, params);
  if (!rows.length) return [];
  return rows[0].values.map(rowToWorkLog);
}

export function getTodayWorkLog(staffId: string, date: string): StaffWorkLog | null {
  if (!db) return null;
  const rows = db.exec(`${WORK_LOG_SELECT} WHERE staff_id = ? AND work_date = ? ORDER BY created_at ASC LIMIT 1`, [staffId, date]);
  if (!rows.length || !rows[0].values.length) return null;
  return rowToWorkLog(rows[0].values[0]);
}

export function getTodayWorkLogs(staffId: string, date: string): StaffWorkLog[] {
  if (!db) return [];
  const rows = db.exec(`${WORK_LOG_SELECT} WHERE staff_id = ? AND work_date = ? ORDER BY created_at ASC`, [staffId, date]);
  if (!rows.length) return [];
  return rows[0].values.map(rowToWorkLog);
}

export function updateWorkLog(id: string, data: Partial<Pick<StaffWorkLog, 'startTime' | 'endTime' | 'breakMinutes' | 'workMinutes' | 'dailyPay' | 'notes' | 'agreedStartTime' | 'agreedEndTime' | 'payType' | 'segmentPay'>>): boolean {
  if (!db) return false;
  const sets: string[] = [];
  const values: any[] = [];
  if (data.startTime !== undefined) { sets.push('start_time = ?'); values.push(data.startTime); }
  if (data.endTime !== undefined) { sets.push('end_time = ?'); values.push(data.endTime); }
  if (data.breakMinutes !== undefined) { sets.push('break_minutes = ?'); values.push(data.breakMinutes); }
  if (data.workMinutes !== undefined) { sets.push('work_minutes = ?'); values.push(data.workMinutes); }
  if (data.dailyPay !== undefined) { sets.push('daily_pay = ?'); values.push(data.dailyPay); }
  if (data.notes !== undefined) { sets.push('notes = ?'); values.push(data.notes); }
  if (data.agreedStartTime !== undefined) { sets.push('agreed_start_time = ?'); values.push(data.agreedStartTime); }
  if (data.agreedEndTime !== undefined) { sets.push('agreed_end_time = ?'); values.push(data.agreedEndTime); }
  if (data.payType !== undefined) { sets.push('pay_type = ?'); values.push(data.payType); }
  if (data.segmentPay !== undefined) { sets.push('segment_pay = ?'); values.push(data.segmentPay); }
  if (data.hourlyRate !== undefined) { sets.push('hourly_rate = ?'); values.push(data.hourlyRate); }
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  db.run(`UPDATE staff_work_logs SET ${sets.join(', ')} WHERE id = ?`, values);
  saveDatabaseDebounced();
  return true;
}

export function deleteWorkLog(id: string): boolean {
  if (!db) return false;
  db.run('DELETE FROM staff_work_logs WHERE id = ?', [id]);
  saveDatabaseDebounced();
  return true;
}

export function createStaffRating(data: Omit<StaffRating, 'id' | 'createdAt'>): string {
  if (!db) return '';
  const id = `rating_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO staff_ratings (id, staff_id, rating_date, rating, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.staffId, data.ratingDate, data.rating, data.note || '', now]
  );
  saveDatabaseDebounced();
  return id;
}

export function getStaffRatings(staffId?: string): StaffRating[] {
  if (!db) return [];
  const where = staffId ? `WHERE staff_id = ?` : '';
  const params = staffId ? [staffId] : [];
  const rows = db.exec(
    `SELECT id, staff_id, rating_date, rating, note, created_at FROM staff_ratings ${where} ORDER BY rating_date DESC`,
    params
  );
  if (!rows.length) return [];
  return rows[0].values.map((r: any) => ({
    id: r[0], staffId: r[1], ratingDate: r[2], rating: r[3] as StaffRatingValue, note: r[4] || '', createdAt: r[5] || '',
  }));
}

export function deleteStaffRating(id: string): boolean {
  if (!db) return false;
  db.run('DELETE FROM staff_ratings WHERE id = ?', [id]);
  saveDatabaseDebounced();
  return true;
}
