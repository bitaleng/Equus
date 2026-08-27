import { useState, useEffect, useMemo, useRef } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, isSameMonth, isSameDay, getDay,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Users, Clock, Wallet, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TimePickerButton } from "@/components/TimePickerButton";
import { useToast } from "@/hooks/use-toast";
import * as localDb from "@/lib/localDb";
import type { Staff, PartTimeTemplate, StaffScheduleOverride, StaffPayday, WageTier } from "@/lib/localDb";
import {
  resolveScheduleForDate, calculateDailyPay, calculateWeeklyPay,
  formatKoreanTimeRange, type ResolvedScheduleSlot,
} from "@/lib/workDiaryPay";

const TZ = "Asia/Seoul";
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getKstNow() { return toZonedTime(new Date(), TZ); }
function toDateStr(d: Date) { return format(d, "yyyy-MM-dd"); }
function toWeekStart(d: Date) { return toDateStr(startOfWeek(d, { weekStartsOn: 1 })); }

function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

function timeToMin(t: string): number {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
// 절대 분(0~) -> "14" 또는 "14:30" 같은 짧은 표기. 자정을 넘긴 시각(>=1440분)은
// 24, 25...로 이어서 표시해 시작시간보다 작아 보이는 걸 방지 (예: 22시~다음날6시 = "22~30")
function minToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
}

interface DisplayBlock {
  key: string;
  startMin: number;
  endMin: number; // startMin보다 크거나 같음. 자정을 넘기면 1440 이상
  members: { staffId: string; isOverridden: boolean }[];
}

/** 달력 칸 요약용 — 같은 시작·종료 시간의 슬롯끼리 하나로 묶고(근무자 이름을 함께 표시),
 * 시간대가 다른 슬롯끼리 겹치는 구간(같이 근무하는 시간)을 계산한다. */
function buildDisplayBlocks(slots: ResolvedScheduleSlot[]): { blocks: DisplayBlock[]; overlaps: { startMin: number; endMin: number }[] } {
  const blockMap = new Map<string, DisplayBlock>();
  for (const s of slots) {
    const startMin = timeToMin(s.startTime);
    let endMin = timeToMin(s.endTime);
    if (endMin <= startMin) endMin += 1440;
    const key = `${startMin}-${endMin}`;
    let b = blockMap.get(key);
    if (!b) {
      b = { key, startMin, endMin, members: [] };
      blockMap.set(key, b);
    }
    b.members.push({ staffId: s.staffId, isOverridden: s.isOverridden });
  }
  const blocks = Array.from(blockMap.values()).sort((a, b) => a.startMin - b.startMin);

  // 서로 다른 시간대가 2개 이상 겹치는 구간을 sweep line으로 계산
  const events: { t: number; delta: number }[] = [];
  blocks.forEach(b => {
    events.push({ t: b.startMin, delta: 1 });
    events.push({ t: b.endMin, delta: -1 });
  });
  events.sort((a, b) => a.t - b.t || a.delta - b.delta); // 같은 시각이면 끝나는 쪽(-1)을 먼저 처리 — 바로 이어지는 경우는 겹침이 아님
  const overlaps: { startMin: number; endMin: number }[] = [];
  let count = 0;
  let overlapStart: number | null = null;
  for (const ev of events) {
    const prevCount = count;
    count += ev.delta;
    if (prevCount < 2 && count >= 2) {
      overlapStart = ev.t;
    } else if (prevCount >= 2 && count < 2 && overlapStart !== null) {
      overlaps.push({ startMin: overlapStart, endMin: ev.t });
      overlapStart = null;
    }
  }
  return { blocks, overlaps };
}

// 좌측 스크롤용: 이전 6개월 ~ 이후 3개월
const MONTH_RANGE = { before: 6, after: 3 };

function MiniMonth({ month, isSelected, onSelect, innerRef }: { month: Date; isSelected: boolean; onSelect: () => void; innerRef?: (el: HTMLButtonElement | null) => void }) {
  const days = monthGrid(month);
  const today = getKstNow();
  return (
    <button
      ref={innerRef}
      onClick={onSelect}
      className={`w-full text-left rounded-md border p-3 mb-2.5 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
      data-testid={`button-select-month-${format(month, "yyyy-MM")}`}
    >
      <p className={`text-sm font-semibold mb-1.5 ${isSelected ? "text-primary" : ""}`}>{format(month, "yyyy년 M월")}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => (
          <div
            key={i}
            className={`text-[11px] text-center leading-5 rounded-sm ${
              !isSameMonth(d, month) ? "text-muted-foreground/30" :
              isSameDay(d, today) ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
            }`}
          >
            {format(d, "d")}
          </div>
        ))}
      </div>
    </button>
  );
}

interface WorkDiaryProps {
  staffList: Staff[];
}

export function WorkDiary({ staffList }: WorkDiaryProps) {
  const { toast } = useToast();
  const today = getKstNow();
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(toDateStr(today));

  const [templates, setTemplates] = useState<PartTimeTemplate[]>([]);
  const [tiers, setTiers] = useState<WageTier[]>([]);
  const [overrides, setOverrides] = useState<StaffScheduleOverride[]>([]);
  const [paydays, setPaydays] = useState<StaffPayday[]>([]);
  const [paydayVersion, setPaydayVersion] = useState(0); // 지급완료 처리 후 재조회 트리거

  const [staffChangeSlot, setStaffChangeSlot] = useState<ResolvedScheduleSlot | null>(null);
  const [timeChangeSlot, setTimeChangeSlot] = useState<ResolvedScheduleSlot | null>(null);
  const [timeChangeStart, setTimeChangeStart] = useState("");
  const [timeChangeEnd, setTimeChangeEnd] = useState("");

  useEffect(() => {
    setTemplates(localDb.getAllPartTimeTemplates());
    setTiers(localDb.getAllWageTiers());
    setPaydays(localDb.getAllStaffPaydays());
  }, []);

  useEffect(() => {
    // 선택된 날짜가 속한 달 전체 구간의 override를 불러온다
    const rangeStart = toDateStr(subMonths(selectedMonth, 1));
    const rangeEnd = toDateStr(addMonths(selectedMonth, 1));
    setOverrides(localDb.getScheduleOverridesForRange(rangeStart, rangeEnd));
  }, [selectedMonth]);

  const months = useMemo(() => {
    const list: Date[] = [];
    for (let i = -MONTH_RANGE.before; i <= MONTH_RANGE.after; i++) {
      list.push(addMonths(startOfMonth(today), i));
    }
    return list;
  }, [today]);

  // 좌측 미니 달력 스크롤 목록 — 처음 열렸을 때 이번 달이 보이는 위치로 스크롤
  const monthItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const hasAutoScrolled = useRef(false);
  useEffect(() => {
    if (hasAutoScrolled.current) return;
    const key = format(startOfMonth(today), "yyyy-MM");
    const el = monthItemRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ block: "center" });
      hasAutoScrolled.current = true;
    }
  }, [today]);

  const bigGrid = useMemo(() => monthGrid(selectedMonth), [selectedMonth]);
  const bigWeeks: Date[][] = [];
  for (let i = 0; i < bigGrid.length; i += 7) bigWeeks.push(bigGrid.slice(i, i + 7));

  const staffMap = useMemo(() => new Map(staffList.map(s => [s.id, s])), [staffList]);

  const slots = useMemo(
    () => resolveScheduleForDate(selectedDate, templates, overrides),
    [selectedDate, templates, overrides]
  );

  // 달력 칸에 바로 보여줄 날짜별 요약 (근무자·시간대별로 묶은 블록, 겹치는 시간대, 주급지급완료 여부)
  const daySummaries = useMemo(() => {
    const map = new Map<string, { blocks: DisplayBlock[]; overlaps: { startMin: number; endMin: number }[]; paydayStaffIds: string[] }>();
    bigGrid.forEach(d => {
      const dStr = toDateStr(d);
      const dow = getDay(d);
      const wStart = toWeekStart(d);
      const paydayStaffIds = paydays
        .filter(p => p.isEnabled && p.dayOfWeek === dow && localDb.isPaydayCompleted(p.staffId, wStart))
        .map(p => p.staffId);
      const { blocks, overlaps } = buildDisplayBlocks(resolveScheduleForDate(dStr, templates, overrides));
      map.set(dStr, { blocks, overlaps, paydayStaffIds });
    });
    return map;
  }, [bigGrid, templates, overrides, paydays, paydayVersion]);

  const handleSaveStaffChange = (newStaffId: string) => {
    if (!staffChangeSlot) return;
    localDb.upsertScheduleOverride({
      scheduleDate: selectedDate,
      templateId: staffChangeSlot.templateId,
      staffId: newStaffId,
      startTime: staffChangeSlot.startTime,
      endTime: staffChangeSlot.endTime,
    });
    setOverrides(localDb.getScheduleOverridesForRange(toDateStr(subMonths(selectedMonth, 1)), toDateStr(addMonths(selectedMonth, 1))));
    setStaffChangeSlot(null);
    toast({ title: "근무자가 변경되었습니다", description: `${selectedDate} · ${staffMap.get(newStaffId)?.name ?? ""}` });
  };

  const openTimeChange = (slot: ResolvedScheduleSlot) => {
    setTimeChangeSlot(slot);
    setTimeChangeStart(slot.startTime);
    setTimeChangeEnd(slot.endTime);
  };

  const handleSaveTimeChange = () => {
    if (!timeChangeSlot) return;
    if (!timeChangeStart || !timeChangeEnd) {
      toast({ title: "시작·종료 시간을 모두 선택해주세요.", variant: "destructive" });
      return;
    }
    localDb.upsertScheduleOverride({
      scheduleDate: selectedDate,
      templateId: timeChangeSlot.templateId,
      staffId: timeChangeSlot.staffId,
      startTime: timeChangeStart,
      endTime: timeChangeEnd,
    });
    setOverrides(localDb.getScheduleOverridesForRange(toDateStr(subMonths(selectedMonth, 1)), toDateStr(addMonths(selectedMonth, 1))));
    setTimeChangeSlot(null);
    toast({ title: "근무시간이 변경되었습니다", description: `${selectedDate} · ${formatKoreanTimeRange(timeChangeStart, timeChangeEnd)}` });
  };

  const handleMarkPaydayCompleted = (slot: ResolvedScheduleSlot) => {
    const weekStart = toWeekStart(new Date(selectedDate + "T00:00:00"));
    const weekly = calculateWeeklyPay(slot.staffId, weekStart, templates, overrides, tiers);
    localDb.markPaydayCompleted(slot.staffId, weekStart);
    setPaydayVersion(v => v + 1);
    toast({
      title: "주급 지급 완료 처리됨",
      description: `${staffMap.get(slot.staffId)?.name ?? ""} · 이번 주 합계 ₩${weekly.totalPay.toLocaleString()}`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-col lg:flex-row">
        {/* 좌측: 이전/다음 달 스크롤 목록 — 화면 크기에 따라 유동적으로 늘어남 */}
        <div
          className="lg:w-64 xl:w-72 shrink-0 h-72 lg:h-auto lg:self-stretch lg:max-h-[min(46rem,80vh)] overflow-y-auto border rounded-md p-2.5 bg-muted/10"
          data-testid="scroll-month-list"
        >
          {months.map(m => (
            <MiniMonth
              key={format(m, "yyyy-MM")}
              month={m}
              isSelected={isSameMonth(m, selectedMonth)}
              onSelect={() => setSelectedMonth(startOfMonth(m))}
              innerRef={(el) => {
                const key = format(m, "yyyy-MM");
                if (el) monthItemRefs.current.set(key, el);
                else monthItemRefs.current.delete(key);
              }}
            />
          ))}
        </div>

        {/* 우측: 선택된 달 큰 달력 — 매출달력과 동일한 형태로 날짜칸에 근무 요약을 바로 표시 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-base font-bold" data-testid="text-diary-month">{format(selectedMonth, "yyyy년 M월")}</p>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/50">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className={`py-1.5 text-center font-medium text-xs border-b ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>
                  {d}
                </div>
              ))}
            </div>
            {bigWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map((d, di) => {
                  const dStr = toDateStr(d);
                  const isCurrentMonth = isSameMonth(d, selectedMonth);
                  const isSelected = dStr === selectedDate;
                  const isToday = isSameDay(d, today);
                  const dayOfWeek = getDay(d);
                  const summary = daySummaries.get(dStr);
                  return (
                    <div
                      key={di}
                      onClick={() => setSelectedDate(dStr)}
                      data-testid={`button-diary-date-${dStr}`}
                      className={`min-h-[88px] p-1.5 border-r last:border-r-0 cursor-pointer transition-colors ${
                        !isCurrentMonth ? "bg-muted/30" :
                        isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary" :
                        isToday ? "bg-blue-50 dark:bg-blue-900/20" :
                        "hover:bg-accent/60"
                      }`}
                    >
                      <div className={`text-xs font-semibold ${
                        !isCurrentMonth ? "text-muted-foreground/30" :
                        dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : ""
                      }`}>
                        {format(d, "d")}
                      </div>
                      {isCurrentMonth && summary && (summary.blocks.length > 0 || summary.paydayStaffIds.length > 0) && (
                        <div className="mt-1 space-y-0.5">
                          {summary.blocks.map(b => {
                            const names = b.members.map(m => staffMap.get(m.staffId)?.name ?? "?").join("·");
                            const hasOverride = b.members.some(m => m.isOverridden);
                            return (
                              <div
                                key={b.key}
                                className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                                  hasOverride
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                    : "bg-primary/10 text-primary"
                                }`}
                              >
                                {minToLabel(b.startMin)}~{minToLabel(b.endMin)} {names}
                              </div>
                            );
                          })}
                          {summary.overlaps.map((o, i) => (
                            <div
                              key={`ov-${i}`}
                              className="text-[10px] leading-tight truncate rounded px-1 py-0.5 bg-orange-500/15 text-orange-700 dark:text-orange-400 font-medium"
                            >
                              ⏱ {minToLabel(o.startMin)}~{minToLabel(o.endMin)} 겹침
                            </div>
                          ))}
                          {summary.paydayStaffIds.map(staffId => (
                            <div
                              key={staffId}
                              className="text-[10px] leading-tight truncate rounded px-1 py-0.5 bg-green-600/15 text-green-700 dark:text-green-400 font-medium flex items-center gap-0.5"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                              {staffMap.get(staffId)?.name ?? ""} 주급완료
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 스케줄 패널 */}
      <div className="border rounded-md p-3 bg-muted/10 space-y-3">
        <p className="text-sm font-semibold" data-testid="text-schedule-panel-date">
          {selectedDate} ({DAY_NAMES[getDay(new Date(selectedDate + "T00:00:00"))]}요일) 스케줄
        </p>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            이 날짜에 등록된 파트타임 스케줄이 없습니다.<br />
            <span className="text-xs">시스템설정 &gt; 직원관리에서 파트타임을 등록해주세요.</span>
          </p>
        ) : (
          <div className="space-y-3">
            {slots.map(slot => {
              const staff = staffMap.get(slot.staffId);
              const pay = calculateDailyPay(selectedDate, slot.startTime, slot.endTime, tiers);
              const payday = localDb.getStaffPayday(slot.staffId);
              const dow = getDay(new Date(selectedDate + "T00:00:00"));
              const showPaydayButton = !!payday?.isEnabled && payday.dayOfWeek === dow;
              const weekStart = toWeekStart(new Date(selectedDate + "T00:00:00"));
              const isCompleted = showPaydayButton && localDb.isPaydayCompleted(slot.staffId, weekStart);
              void paydayVersion; // 지급완료 처리 후 재렌더 트리거용 참조

              return (
                <div key={slot.templateId} className="rounded-lg border bg-card p-3 space-y-2">
                  {slot.isOverridden && (
                    <Badge variant="outline" className="text-[10px] border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                      대체근무로 변경됨
                    </Badge>
                  )}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">근무자 :</span>
                      <span className="font-semibold">{staff?.name ?? "(삭제된 직원)"}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setStaffChangeSlot(slot)} data-testid={`button-change-staff-${slot.templateId}`}>
                      근무자변경
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">근무시간 :</span>
                      <span className="font-semibold font-mono">{formatKoreanTimeRange(slot.startTime, slot.endTime)}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openTimeChange(slot)} data-testid={`button-change-time-${slot.templateId}`}>
                      근무시간변경
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm pt-1 border-t">
                    <span className="text-muted-foreground">총 근무시간 :</span>
                    <span className="font-semibold">{(pay.totalMinutes / 60).toFixed(1)}시간</span>
                    <span className="text-muted-foreground ml-2">예상 일급 :</span>
                    <span className="font-bold text-primary">₩{pay.totalPay.toLocaleString()}</span>
                  </div>
                  {pay.segments.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {pay.segments.map((s, i) => (
                        <span key={i}>{i > 0 && " + "}{s.tierName} {(s.minutes / 60).toFixed(1)}h×₩{s.hourlyRate.toLocaleString()}</span>
                      ))}
                    </p>
                  )}
                  {showPaydayButton && (
                    isCompleted ? (
                      <Badge className="bg-green-600 hover:bg-green-600 text-white gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> 이번 주 주급지급완료
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleMarkPaydayCompleted(slot)}
                        data-testid={`button-payday-complete-${slot.templateId}`}
                      >
                        <Wallet className="h-4 w-4 mr-1" />
                        주급지급완료
                      </Button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 근무자 변경 다이얼로그 */}
      <Dialog open={!!staffChangeSlot} onOpenChange={(o) => !o && setStaffChangeSlot(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>근무자 변경 — {selectedDate}</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select onValueChange={handleSaveStaffChange} defaultValue={staffChangeSlot?.staffId}>
              <SelectTrigger data-testid="select-change-staff"><SelectValue placeholder="근무자 선택" /></SelectTrigger>
              <SelectContent>
                {staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStaffChangeSlot(null)}>취소</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 근무시간 변경 다이얼로그 */}
      <Dialog open={!!timeChangeSlot} onOpenChange={(o) => !o && setTimeChangeSlot(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>근무시간 변경 — {selectedDate}</DialogTitle></DialogHeader>
          <div className="py-2 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">시작 시간</p>
              <TimePickerButton value={timeChangeStart} onChange={setTimeChangeStart} label="시작 시간" testId="input-diary-time-start" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">종료 시간</p>
              <TimePickerButton value={timeChangeEnd} onChange={setTimeChangeEnd} label="종료 시간" testId="input-diary-time-end" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimeChangeSlot(null)}>취소</Button>
            <Button onClick={handleSaveTimeChange} data-testid="button-save-time-change">저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
