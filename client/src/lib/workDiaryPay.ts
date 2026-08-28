import { isKoreanHoliday } from "@shared/businessDay";
import type { PartTimeTemplate, StaffScheduleOverride, WageTier, PaydayDateSpec } from "@/lib/localDb";

/**
 * 근무다이어리 급여 계산 엔진 — 순수 함수만 모아둠(DB 접근 없음).
 * 페이는 "근무자" 단위가 아니라 "그 사람이 일한 요일·시간대" 단위로 계산한다:
 * 한 근무 구간이 시급 tier 경계(예: 오후10시)를 걸치면 그 지점에서 나눠서 각각 계산 후 합산.
 */

function timeToMinutes(t: string): number {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 근무 시작일(자정 기준)로부터 minuteOffset(자정 넘기면 1440 이상)만큼 지난 실제 시각에
 * 적용되는 시급 tier를 찾는다 — 요일·공휴일 매칭은 그 순간이 "실제로 속한 달력 날짜" 기준.
 * tiers 배열의 순서가 우선순위(먼저 매칭되는 항목이 적용)다. */
function resolveTierAt(baseDate: Date, minuteOffset: number, tiers: WageTier[]): WageTier | null {
  const actualDate = new Date(baseDate);
  actualDate.setDate(actualDate.getDate() + Math.floor(minuteOffset / 1440));
  const minuteOfDay = ((minuteOffset % 1440) + 1440) % 1440;
  const dow = actualDate.getDay();
  const holiday = isKoreanHoliday(actualDate);

  for (const tier of tiers) {
    const dayMatch = tier.daysOfWeek.includes(dow) || (tier.includeHolidays && holiday);
    if (!dayMatch) continue;
    const tStart = timeToMinutes(tier.startTime);
    let tEnd = timeToMinutes(tier.endTime);
    if (tEnd <= tStart) tEnd += 1440; // 자정을 넘기는 tier
    let m = minuteOfDay;
    if (m < tStart) m += 1440;
    if (m >= tStart && m < tEnd) return tier;
  }
  return null;
}

export interface PaySegment {
  tierId: string | null;
  tierName: string;
  hourlyRate: number;
  minutes: number;
  pay: number;
}

export interface DailyPayResult {
  segments: PaySegment[];
  totalMinutes: number;
  totalPay: number;
}

const EMPTY_RESULT: DailyPayResult = { segments: [], totalMinutes: 0, totalPay: 0 };

/**
 * 근무 구간(baseDate 기준 startTime~endTime, 자정을 넘기면 endTime<=startTime)을
 * 시급 tier 경계마다 잘라 각 구간의 시급×시간을 계산해 합산한다.
 * 분 단위로 순회하되(최대 1440분) tier가 바뀌는 지점만 구간으로 묶어 반올림 오차를 최소화한다.
 */
export function calculateShiftPay(baseDate: Date, startTime: string, endTime: string, tiers: WageTier[]): DailyPayResult {
  if (!startTime || !endTime || tiers.length === 0) return EMPTY_RESULT;
  const startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) endMin += 1440;
  const totalMinutes = endMin - startMin;
  if (totalMinutes <= 0) return EMPTY_RESULT;

  const raw: { tier: WageTier | null; minutes: number }[] = [];
  let current: WageTier | null | undefined = undefined;
  let currentMinutes = 0;

  for (let i = 0; i < totalMinutes; i++) {
    const tier = resolveTierAt(baseDate, startMin + i, tiers);
    if (current === undefined) {
      current = tier;
      currentMinutes = 1;
    } else if (tier?.id === current?.id) {
      currentMinutes++;
    } else {
      raw.push({ tier: current, minutes: currentMinutes });
      current = tier;
      currentMinutes = 1;
    }
  }
  if (currentMinutes > 0) raw.push({ tier: current ?? null, minutes: currentMinutes });

  const segments: PaySegment[] = raw.map(seg => {
    const rate = seg.tier?.hourlyRate ?? 0;
    const pay = Math.round((seg.minutes / 60) * rate);
    return { tierId: seg.tier?.id ?? null, tierName: seg.tier?.name ?? "미지정 시급", hourlyRate: rate, minutes: seg.minutes, pay };
  });
  const totalPay = segments.reduce((s, x) => s + x.pay, 0);

  return { segments, totalMinutes, totalPay };
}

/** YYYY-MM-DD 문자열 기준으로 하루치 급여 계산 */
export function calculateDailyPay(dateStr: string, startTime: string, endTime: string, tiers: WageTier[]): DailyPayResult {
  const baseDate = new Date(dateStr + "T00:00:00");
  return calculateShiftPay(baseDate, startTime, endTime, tiers);
}

export interface ResolvedScheduleSlot {
  templateId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  label: string;
  isOverridden: boolean;
}

/** 재직 기간 판정에 필요한 최소 정보 — Staff 전체를 넘겨도 되고 이 모양만 맞으면 됨 */
export interface StaffEmploymentInfo {
  id: string;
  hireDate?: string;   // YYYY-MM-DD, 없으면 제한 없음
  resignDate?: string; // YYYY-MM-DD, 없으면 아직 재직 중
}

/** 그 날짜에 해당 근무자가 재직 중이었는지 — 입사일 이전·퇴사일 이후는 근무로 치지 않는다.
 * 근무 스케줄뿐 아니라 주급지급일 표시 등 재직 기간 판정이 필요한 다른 곳에서도 재사용한다. */
export function isEmployedOn(dateStr: string, staffId: string, staffList?: StaffEmploymentInfo[]): boolean {
  if (!staffList) return true;
  const staff = staffList.find(s => s.id === staffId);
  if (!staff) return true; // 목록에 없으면(삭제된 직원 등) 걸러내지 않음 — 화면에서 별도 표시
  if (staff.hireDate && dateStr < staff.hireDate) return false;
  if (staff.resignDate && dateStr > staff.resignDate) return false;
  return true;
}

/** 특정 날짜에 적용되는 스케줄(파트타임 템플릿 + 그 날짜의 override)을 계산.
 * staffList를 넘기면 입사일 이전·퇴사일 이후 근무자는 결과에서 제외한다. */
export function resolveScheduleForDate(
  dateStr: string,
  templates: PartTimeTemplate[],
  overrides: StaffScheduleOverride[],
  staffList?: StaffEmploymentInfo[]
): ResolvedScheduleSlot[] {
  const date = new Date(dateStr + "T00:00:00");
  const dow = date.getDay();
  const dayTemplates = templates.filter(t => t.isActive && t.daysOfWeek.includes(dow));

  const slots = dayTemplates.map(t => {
    const override = overrides.find(o => o.scheduleDate === dateStr && o.templateId === t.id);
    if (override) {
      return {
        templateId: t.id,
        staffId: override.staffId,
        startTime: override.startTime,
        endTime: override.endTime,
        label: t.label,
        isOverridden: true,
      };
    }
    return {
      templateId: t.id,
      staffId: t.staffId,
      startTime: t.startTime,
      endTime: t.endTime,
      label: t.label,
      isOverridden: false,
    };
  });

  return slots.filter(s => isEmployedOn(dateStr, s.staffId, staffList));
}

/** 특정 날짜의 특정 근무자 급여(그 날 여러 슬롯이 있으면 합산) */
export function calculateDailyPayForStaff(
  dateStr: string,
  staffId: string,
  templates: PartTimeTemplate[],
  overrides: StaffScheduleOverride[],
  tiers: WageTier[],
  staffList?: StaffEmploymentInfo[]
): DailyPayResult {
  const slots = resolveScheduleForDate(dateStr, templates, overrides, staffList).filter(s => s.staffId === staffId);
  const results = slots.map(s => calculateDailyPay(dateStr, s.startTime, s.endTime, tiers));
  const segments = results.flatMap(r => r.segments);
  const totalMinutes = results.reduce((s, r) => s + r.totalMinutes, 0);
  const totalPay = results.reduce((s, r) => s + r.totalPay, 0);
  return { segments, totalMinutes, totalPay };
}

/** weekStartDate(YYYY-MM-DD)부터 7일간의 근무자별 일급을 계산해 합산 → 주급 */
export function calculateWeeklyPay(
  staffId: string,
  weekStartDate: string,
  templates: PartTimeTemplate[],
  overrides: StaffScheduleOverride[],
  tiers: WageTier[],
  staffList?: StaffEmploymentInfo[]
): { days: { date: string; result: DailyPayResult }[]; totalPay: number; totalMinutes: number } {
  const start = new Date(weekStartDate + "T00:00:00");
  const days: { date: string; result: DailyPayResult }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ date: dateStr, result: calculateDailyPayForStaff(dateStr, staffId, templates, overrides, tiers, staffList) });
  }
  const totalPay = days.reduce((s, d) => s + d.result.totalPay, 0);
  const totalMinutes = days.reduce((s, d) => s + d.result.totalMinutes, 0);
  return { days, totalPay, totalMinutes };
}

/** HH:mm → "오후2시" 같은 한국어 12시간제 표기 */
export function formatKoreanHour(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const period = h < 12 ? "오전" : "오후";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${period}${h12}시` : `${period}${h12}시${m}분`;
}

export function formatKoreanTimeRange(start: string, end: string): string {
  return `${formatKoreanHour(start)}~${formatKoreanHour(end)}`;
}

/** 월급 지급일 스펙(고정 날짜 또는 '말일')을 실제 연·월의 날짜(YYYY-MM-DD)로 변환.
 * 고정 날짜가 그 달에 없으면(예: 31일 지정 + 2월) 그 달의 마지막 날로 당겨준다. */
export function resolvePaydayDateSpec(year: number, month0: number, spec: PaydayDateSpec): string {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const day = spec === "last" ? lastDay : Math.min(Math.max(1, spec), lastDay);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface ResolvedMonthlyPayday {
  date: string;  // YYYY-MM-DD
  index: number; // 1부터 시작하는 회차 번호
  total: number; // 총 회차 수
  amount: number; // 그 회차의 실제 지급액
}

/** 근무자의 월급 지급일 스펙 배열을 해당 연·월의 실제 날짜들로 변환 — 회차 번호(index/total)·지급액 포함.
 * 분할지급(총 회차 2개 이상)이면 splitAmounts[i]를 그대로 그 회차의 금액으로 쓴다(균등분할 아님 — 회차마다 직접 지정한 금액).
 * 비분할(회차 1개)이면 nonSplitAmount(월 총액)를 그대로 쓴다. */
export function resolveMonthlyPaydayDates(
  year: number, month0: number, dates: PaydayDateSpec[], splitAmounts: number[], nonSplitAmount: number
): ResolvedMonthlyPayday[] {
  const total = dates.length;
  return dates.map((spec, i) => ({
    date: resolvePaydayDateSpec(year, month0, spec),
    index: i + 1,
    total,
    amount: total > 1 ? (splitAmounts[i] ?? 0) : nonSplitAmount,
  }));
}
