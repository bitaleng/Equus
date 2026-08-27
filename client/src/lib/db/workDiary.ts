import { db, saveDatabaseDebounced } from './core';

// ============================================
// 근무다이어리: 파트타임 스케줄 · 요일별 시급 · 주급지급일 · 날짜별 대체근무 · 지급완료 기록
// ============================================

export interface PartTimeTemplate {
  id: string;
  staffId: string;
  daysOfWeek: number[]; // 0=일 ~ 6=토
  startTime: string; // HH:mm
  endTime: string;   // HH:mm (자정을 넘기면 endTime < startTime)
  label: string;
  isActive: boolean;
  createdAt: string;
  groupId: string; // 같은 파트타임(요일·시간)에 근무자가 여러 명이면 같은 groupId를 공유 — 근무자별로 한 행
}

/** 같은 groupId를 공유하는 파트타임 행들을 하나의 "파트타임(근무자 여러 명)"으로 묶은 뷰 */
export interface TemplateGroup {
  groupId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  label: string;
  isActive: boolean;
  members: { templateId: string; staffId: string }[];
}

export interface WageTier {
  id: string;
  name: string;
  daysOfWeek: number[];
  includeHolidays: boolean;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  sortOrder: number;
  createdAt: string;
}

export interface StaffPayday {
  id: string;
  staffId: string;
  dayOfWeek: number;
  time: string; // HH:mm
  isEnabled: boolean;
  createdAt: string;
}

export interface StaffScheduleOverride {
  id: string;
  scheduleDate: string; // YYYY-MM-DD
  templateId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPaydayCompletion {
  id: string;
  staffId: string;
  weekStartDate: string; // YYYY-MM-DD (해당 주의 기준 시작일)
  completedAt: string;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function daysToStr(days: number[]): string {
  return Array.from(new Set(days)).sort((a, b) => a - b).join(',');
}
function strToDays(s: string): number[] {
  if (!s) return [];
  return s.split(',').map(Number).filter(n => !Number.isNaN(n));
}

// ── 파트타임 설정 ──────────────────────────────────────────────

function rowToTemplate(r: any[]): PartTimeTemplate {
  return {
    id: r[0], staffId: r[1], daysOfWeek: strToDays(r[2]), startTime: r[3] || '',
    endTime: r[4] || '', label: r[5] || '', isActive: r[6] === 1, createdAt: r[7] || '',
    groupId: r[8] || r[0],
  };
}

const TEMPLATE_SELECT = `SELECT id, staff_id, days_of_week, start_time, end_time, label, is_active, created_at, group_id FROM part_time_templates`;

/** 새 파트타임 그룹(요일·시간 슬롯)을 만들며 첫 근무자를 등록. groupId를 생략하면 새 그룹을 생성한다. */
export function createPartTimeTemplate(data: Omit<PartTimeTemplate, 'id' | 'createdAt' | 'groupId'> & { groupId?: string }): string {
  if (!db) return '';
  const id = newId('ptt');
  const groupId = data.groupId || newId('grp');
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO part_time_templates (id, staff_id, days_of_week, start_time, end_time, label, is_active, created_at, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.staffId, daysToStr(data.daysOfWeek), data.startTime, data.endTime, data.label || '', data.isActive ? 1 : 0, now, groupId]
  );
  saveDatabaseDebounced();
  return id;
}

/** 이미 있는 파트타임 그룹에 근무자를 한 명 더 추가 (요일·시간·라벨은 그룹의 기존 값을 그대로 복사) */
export function addStaffToGroup(groupId: string, staffId: string): string {
  if (!db) return '';
  const rows = db.exec(
    `SELECT days_of_week, start_time, end_time, label, is_active FROM part_time_templates WHERE group_id = ? LIMIT 1`,
    [groupId]
  );
  if (!rows.length || !rows[0].values.length) return '';
  const [daysOfWeekStr, startTime, endTime, label, isActive] = rows[0].values[0];
  const id = newId('ptt');
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO part_time_templates (id, staff_id, days_of_week, start_time, end_time, label, is_active, created_at, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, staffId, daysOfWeekStr, startTime, endTime, label, isActive, now, groupId]
  );
  saveDatabaseDebounced();
  return id;
}

export function getAllPartTimeTemplates(activeOnly = true): PartTimeTemplate[] {
  if (!db) return [];
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  const rows = db.exec(`${TEMPLATE_SELECT} ${where} ORDER BY created_at ASC`);
  if (!rows.length) return [];
  return rows[0].values.map(rowToTemplate);
}

/** groupId 기준으로 묶은 뷰 — 같은 요일·시간 슬롯에 등록된 근무자 목록을 한 번에 보여줄 때 사용 */
export function getTemplateGroups(activeOnly = false): TemplateGroup[] {
  const templates = getAllPartTimeTemplates(activeOnly);
  const map = new Map<string, TemplateGroup>();
  for (const t of templates) {
    let g = map.get(t.groupId);
    if (!g) {
      g = { groupId: t.groupId, daysOfWeek: t.daysOfWeek, startTime: t.startTime, endTime: t.endTime, label: t.label, isActive: t.isActive, members: [] };
      map.set(t.groupId, g);
    }
    g.members.push({ templateId: t.id, staffId: t.staffId });
  }
  return Array.from(map.values());
}

export function updatePartTimeTemplate(id: string, data: Partial<Omit<PartTimeTemplate, 'id' | 'createdAt' | 'groupId'>>): boolean {
  if (!db) return false;
  const sets: string[] = [];
  const values: any[] = [];
  if (data.staffId !== undefined) { sets.push('staff_id = ?'); values.push(data.staffId); }
  if (data.daysOfWeek !== undefined) { sets.push('days_of_week = ?'); values.push(daysToStr(data.daysOfWeek)); }
  if (data.startTime !== undefined) { sets.push('start_time = ?'); values.push(data.startTime); }
  if (data.endTime !== undefined) { sets.push('end_time = ?'); values.push(data.endTime); }
  if (data.label !== undefined) { sets.push('label = ?'); values.push(data.label); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
  if (!sets.length) return false;
  values.push(id);
  db.run(`UPDATE part_time_templates SET ${sets.join(', ')} WHERE id = ?`, values);
  saveDatabaseDebounced();
  return true;
}

/** 그룹 전체(요일·시간·라벨)를 한 번에 수정 — 그룹에 속한 모든 근무자 행에 반영 */
export function updateTemplateGroup(groupId: string, data: Partial<Pick<PartTimeTemplate, 'daysOfWeek' | 'startTime' | 'endTime' | 'label' | 'isActive'>>): boolean {
  if (!db) return false;
  const sets: string[] = [];
  const values: any[] = [];
  if (data.daysOfWeek !== undefined) { sets.push('days_of_week = ?'); values.push(daysToStr(data.daysOfWeek)); }
  if (data.startTime !== undefined) { sets.push('start_time = ?'); values.push(data.startTime); }
  if (data.endTime !== undefined) { sets.push('end_time = ?'); values.push(data.endTime); }
  if (data.label !== undefined) { sets.push('label = ?'); values.push(data.label); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
  if (!sets.length) return false;
  values.push(groupId);
  db.run(`UPDATE part_time_templates SET ${sets.join(', ')} WHERE group_id = ?`, values);
  saveDatabaseDebounced();
  return true;
}

/** 그룹 내 근무자 한 명만 제거 (해당 근무자의 대체근무 기록도 함께 삭제) */
export function deletePartTimeTemplate(id: string): boolean {
  if (!db) return false;
  db.run('DELETE FROM part_time_templates WHERE id = ?', [id]);
  db.run('DELETE FROM staff_schedule_overrides WHERE template_id = ?', [id]);
  saveDatabaseDebounced();
  return true;
}

/** 그룹 전체(그 요일·시간 슬롯에 속한 근무자 전원)를 삭제 */
export function deleteTemplateGroup(groupId: string): boolean {
  if (!db) return false;
  const rows = db.exec(`SELECT id FROM part_time_templates WHERE group_id = ?`, [groupId]);
  const ids = rows.length ? rows[0].values.map(v => v[0] as string) : [];
  db.run('DELETE FROM part_time_templates WHERE group_id = ?', [groupId]);
  for (const id of ids) {
    db.run('DELETE FROM staff_schedule_overrides WHERE template_id = ?', [id]);
  }
  saveDatabaseDebounced();
  return true;
}

// ── 요일·시간별 시급 (wage tiers) ─────────────────────────────

function rowToTier(r: any[]): WageTier {
  return {
    id: r[0], name: r[1], daysOfWeek: strToDays(r[2]), includeHolidays: r[3] === 1,
    startTime: r[4] || '', endTime: r[5] || '', hourlyRate: r[6] || 0, sortOrder: r[7] || 0, createdAt: r[8] || '',
  };
}

const TIER_SELECT = `SELECT id, name, days_of_week, include_holidays, start_time, end_time, hourly_rate, sort_order, created_at FROM wage_tiers`;

export function createWageTier(data: Omit<WageTier, 'id' | 'createdAt' | 'sortOrder'>): string {
  if (!db) return '';
  const id = newId('tier');
  const now = new Date().toISOString();
  const maxOrderRows = db.exec(`SELECT COALESCE(MAX(sort_order), -1) FROM wage_tiers`);
  const nextOrder = ((maxOrderRows[0]?.values[0]?.[0] as number) ?? -1) + 1;
  db.run(
    `INSERT INTO wage_tiers (id, name, days_of_week, include_holidays, start_time, end_time, hourly_rate, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, daysToStr(data.daysOfWeek), data.includeHolidays ? 1 : 0, data.startTime, data.endTime, data.hourlyRate, nextOrder, now]
  );
  saveDatabaseDebounced();
  return id;
}

export function getAllWageTiers(): WageTier[] {
  if (!db) return [];
  const rows = db.exec(`${TIER_SELECT} ORDER BY sort_order ASC`);
  if (!rows.length) return [];
  return rows[0].values.map(rowToTier);
}

export function updateWageTier(id: string, data: Partial<Omit<WageTier, 'id' | 'createdAt'>>): boolean {
  if (!db) return false;
  const sets: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
  if (data.daysOfWeek !== undefined) { sets.push('days_of_week = ?'); values.push(daysToStr(data.daysOfWeek)); }
  if (data.includeHolidays !== undefined) { sets.push('include_holidays = ?'); values.push(data.includeHolidays ? 1 : 0); }
  if (data.startTime !== undefined) { sets.push('start_time = ?'); values.push(data.startTime); }
  if (data.endTime !== undefined) { sets.push('end_time = ?'); values.push(data.endTime); }
  if (data.hourlyRate !== undefined) { sets.push('hourly_rate = ?'); values.push(data.hourlyRate); }
  if (data.sortOrder !== undefined) { sets.push('sort_order = ?'); values.push(data.sortOrder); }
  if (!sets.length) return false;
  values.push(id);
  db.run(`UPDATE wage_tiers SET ${sets.join(', ')} WHERE id = ?`, values);
  saveDatabaseDebounced();
  return true;
}

export function deleteWageTier(id: string): boolean {
  if (!db) return false;
  db.run('DELETE FROM wage_tiers WHERE id = ?', [id]);
  saveDatabaseDebounced();
  return true;
}

/** 두 tier의 sort_order를 맞바꿔 우선순위 위/아래 이동 */
export function swapWageTierOrder(idA: string, idB: string): boolean {
  if (!db) return false;
  const rows = db.exec(`SELECT id, sort_order FROM wage_tiers WHERE id IN (?, ?)`, [idA, idB]);
  if (!rows.length || rows[0].values.length !== 2) return false;
  const [a, b] = rows[0].values;
  db.run(`UPDATE wage_tiers SET sort_order = ? WHERE id = ?`, [b[1], a[0]]);
  db.run(`UPDATE wage_tiers SET sort_order = ? WHERE id = ?`, [a[1], b[0]]);
  saveDatabaseDebounced();
  return true;
}

// ── 근무자별 주급지급일 ────────────────────────────────────────

function rowToPayday(r: any[]): StaffPayday {
  return { id: r[0], staffId: r[1], dayOfWeek: r[2], time: r[3] || '', isEnabled: r[4] === 1, createdAt: r[5] || '' };
}

const PAYDAY_SELECT = `SELECT id, staff_id, day_of_week, time, is_enabled, created_at FROM staff_paydays`;

export function upsertStaffPayday(data: Omit<StaffPayday, 'id' | 'createdAt'>): string {
  if (!db) return '';
  const existing = db.exec(`SELECT id FROM staff_paydays WHERE staff_id = ?`, [data.staffId]);
  if (existing.length && existing[0].values.length) {
    const id = existing[0].values[0][0] as string;
    db.run(`UPDATE staff_paydays SET day_of_week = ?, time = ?, is_enabled = ? WHERE id = ?`,
      [data.dayOfWeek, data.time, data.isEnabled ? 1 : 0, id]);
    saveDatabaseDebounced();
    return id;
  }
  const id = newId('payday');
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO staff_paydays (id, staff_id, day_of_week, time, is_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.staffId, data.dayOfWeek, data.time, data.isEnabled ? 1 : 0, now]
  );
  saveDatabaseDebounced();
  return id;
}

export function getAllStaffPaydays(): StaffPayday[] {
  if (!db) return [];
  const rows = db.exec(`${PAYDAY_SELECT} ORDER BY created_at ASC`);
  if (!rows.length) return [];
  return rows[0].values.map(rowToPayday);
}

export function getStaffPayday(staffId: string): StaffPayday | null {
  if (!db) return null;
  const rows = db.exec(`${PAYDAY_SELECT} WHERE staff_id = ? LIMIT 1`, [staffId]);
  if (!rows.length || !rows[0].values.length) return null;
  return rowToPayday(rows[0].values[0]);
}

// ── 날짜별 대체근무(스케줄 override) ────────────────────────────

function rowToOverride(r: any[]): StaffScheduleOverride {
  return {
    id: r[0], scheduleDate: r[1], templateId: r[2], staffId: r[3],
    startTime: r[4] || '', endTime: r[5] || '', createdAt: r[6] || '', updatedAt: r[7] || '',
  };
}

const OVERRIDE_SELECT = `SELECT id, schedule_date, template_id, staff_id, start_time, end_time, created_at, updated_at FROM staff_schedule_overrides`;

/** 특정 날짜의 특정 템플릿 슬롯을 다른 근무자/시간으로 대체 — 있으면 갱신, 없으면 생성 */
export function upsertScheduleOverride(data: Omit<StaffScheduleOverride, 'id' | 'createdAt' | 'updatedAt'>): string {
  if (!db) return '';
  const existing = db.exec(
    `SELECT id FROM staff_schedule_overrides WHERE schedule_date = ? AND template_id = ?`,
    [data.scheduleDate, data.templateId]
  );
  const now = new Date().toISOString();
  if (existing.length && existing[0].values.length) {
    const id = existing[0].values[0][0] as string;
    db.run(
      `UPDATE staff_schedule_overrides SET staff_id = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?`,
      [data.staffId, data.startTime, data.endTime, now, id]
    );
    saveDatabaseDebounced();
    return id;
  }
  const id = newId('sov');
  db.run(
    `INSERT INTO staff_schedule_overrides (id, schedule_date, template_id, staff_id, start_time, end_time, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.scheduleDate, data.templateId, data.staffId, data.startTime, data.endTime, now, now]
  );
  saveDatabaseDebounced();
  return id;
}

export function getScheduleOverridesForDate(date: string): StaffScheduleOverride[] {
  if (!db) return [];
  const rows = db.exec(`${OVERRIDE_SELECT} WHERE schedule_date = ?`, [date]);
  if (!rows.length) return [];
  return rows[0].values.map(rowToOverride);
}

export function getScheduleOverridesForRange(start: string, end: string): StaffScheduleOverride[] {
  if (!db) return [];
  const rows = db.exec(`${OVERRIDE_SELECT} WHERE schedule_date >= ? AND schedule_date <= ?`, [start, end]);
  if (!rows.length) return [];
  return rows[0].values.map(rowToOverride);
}

export function deleteScheduleOverride(id: string): boolean {
  if (!db) return false;
  db.run('DELETE FROM staff_schedule_overrides WHERE id = ?', [id]);
  saveDatabaseDebounced();
  return true;
}

// ── 주급지급완료 기록 ───────────────────────────────────────────

function rowToCompletion(r: any[]): StaffPaydayCompletion {
  return { id: r[0], staffId: r[1], weekStartDate: r[2], completedAt: r[3] || '' };
}

export function markPaydayCompleted(staffId: string, weekStartDate: string): string {
  if (!db) return '';
  const existing = db.exec(
    `SELECT id FROM staff_payday_completions WHERE staff_id = ? AND week_start_date = ?`,
    [staffId, weekStartDate]
  );
  if (existing.length && existing[0].values.length) return existing[0].values[0][0] as string;
  const id = newId('paidwk');
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO staff_payday_completions (id, staff_id, week_start_date, completed_at) VALUES (?, ?, ?, ?)`,
    [id, staffId, weekStartDate, now]
  );
  saveDatabaseDebounced();
  return id;
}

export function isPaydayCompleted(staffId: string, weekStartDate: string): boolean {
  if (!db) return false;
  const rows = db.exec(
    `SELECT id FROM staff_payday_completions WHERE staff_id = ? AND week_start_date = ? LIMIT 1`,
    [staffId, weekStartDate]
  );
  return !!(rows.length && rows[0].values.length);
}

export function getAllPaydayCompletions(): StaffPaydayCompletion[] {
  if (!db) return [];
  const rows = db.exec(`SELECT id, staff_id, week_start_date, completed_at FROM staff_payday_completions ORDER BY completed_at DESC`);
  if (!rows.length) return [];
  return rows[0].values.map(rowToCompletion);
}
