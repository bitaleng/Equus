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
import type { Staff, PartTimeTemplate, StaffScheduleOverride, WageTier } from "@/lib/localDb";
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

// 좌측 스크롤용: 이전 6개월 ~ 이후 3개월
const MONTH_RANGE = { before: 6, after: 3 };

function MiniMonth({ month, isSelected, onSelect, innerRef }: { month: Date; isSelected: boolean; onSelect: () => void; innerRef?: (el: HTMLButtonElement | null) => void }) {
  const days = monthGrid(month);
  const today = getKstNow();
  return (
    <button
      ref={innerRef}
      onClick={onSelect}
      className={`w-full text-left rounded-md border p-2 mb-2 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
      data-testid={`button-select-month-${format(month, "yyyy-MM")}`}
    >
      <p className={`text-xs font-semibold mb-1 ${isSelected ? "text-primary" : ""}`}>{format(month, "yyyy년 M월")}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => (
          <div
            key={i}
            className={`text-[9px] text-center leading-3 rounded-sm ${
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
  const [paydayVersion, setPaydayVersion] = useState(0); // 지급완료 처리 후 재조회 트리거

  const [staffChangeSlot, setStaffChangeSlot] = useState<ResolvedScheduleSlot | null>(null);
  const [timeChangeSlot, setTimeChangeSlot] = useState<ResolvedScheduleSlot | null>(null);
  const [timeChangeStart, setTimeChangeStart] = useState("");
  const [timeChangeEnd, setTimeChangeEnd] = useState("");

  useEffect(() => {
    setTemplates(localDb.getAllPartTimeTemplates());
    setTiers(localDb.getAllWageTiers());
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

  const datesWithSchedule = useMemo(() => {
    const set = new Set<string>();
    bigGrid.forEach(d => {
      if (resolveScheduleForDate(toDateStr(d), templates, overrides).length > 0) set.add(toDateStr(d));
    });
    return set;
  }, [bigGrid, templates, overrides]);

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
      <div className="flex gap-3 flex-col sm:flex-row">
        {/* 좌측: 이전/다음 달 스크롤 목록 */}
        <div className="sm:w-36 shrink-0 h-64 overflow-y-auto border rounded-md p-2 bg-muted/10" data-testid="scroll-month-list">
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

        {/* 우측: 선택된 달 큰 달력 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-base font-bold" data-testid="text-diary-month">{format(selectedMonth, "yyyy년 M월")}</p>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}>{d}</div>
            ))}
          </div>
          <div className="space-y-1">
            {bigWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((d, di) => {
                  const dStr = toDateStr(d);
                  const isCurrentMonth = isSameMonth(d, selectedMonth);
                  const isSelected = dStr === selectedDate;
                  const isToday = isSameDay(d, today);
                  const hasSchedule = datesWithSchedule.has(dStr);
                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDate(dStr)}
                      data-testid={`button-diary-date-${dStr}`}
                      className={`aspect-square rounded-md text-sm flex flex-col items-center justify-center gap-0.5 transition-colors ${
                        !isCurrentMonth ? "text-muted-foreground/30" :
                        isSelected ? "bg-primary text-primary-foreground font-bold" :
                        isToday ? "bg-primary/10 text-primary font-semibold" :
                        "hover-elevate"
                      }`}
                    >
                      <span>{format(d, "d")}</span>
                      {hasSchedule && isCurrentMonth && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
                      )}
                    </button>
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
