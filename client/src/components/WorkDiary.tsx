import { useState, useEffect, useMemo, useRef } from "react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, isSameMonth, isSameDay, getDay,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Users, Clock, Wallet, CheckCircle2, ChevronDown, FileDown, ImageIcon } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toJpeg } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TimePickerButton } from "@/components/TimePickerButton";
import { useToast } from "@/hooks/use-toast";
import * as localDb from "@/lib/localDb";
import type { Staff, PartTimeTemplate, StaffScheduleOverride, StaffPayday, WageTier } from "@/lib/localDb";
import {
  resolveScheduleForDate, calculateDailyPay, calculateWeeklyPay, isEmployedOn,
  formatKoreanTimeRange, resolveMonthlyPaydayDates, type ResolvedScheduleSlot,
} from "@/lib/workDiaryPay";
import { getStaffColor, multiplyBlendAll } from "@/lib/staffColors";

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

// PDF 내보내기용 — jsPDF 기본 폰트는 한글을 지원하지 않아 NotoSansKR을 등록해서 사용 (매출리포트·정산보고서와 동일한 방식)
async function loadKoreanFont(doc: jsPDF): Promise<string | null> {
  try {
    const fontResponse = await fetch('/fonts/NotoSansKR-Regular.ttf');
    if (fontResponse.ok) {
      const fontArrayBuffer = await fontResponse.arrayBuffer();
      const fontBytes = new Uint8Array(fontArrayBuffer);
      let fontBase64 = '';
      for (let i = 0; i < fontBytes.length; i++) fontBase64 += String.fromCharCode(fontBytes[i]);
      fontBase64 = btoa(fontBase64);
      doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
      doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
      doc.setFont('NotoSansKR', 'normal');
      return 'NotoSansKR';
    }
  } catch (e) {
    console.warn('폰트 로드 실패:', e);
  }
  return null;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 화면에 보이는 디자인 그대로 JPEG로 내보내기 — 가로 1920px 정도(72ppi 웹 해상도)로 스케일.
// html2canvas는 CSS를 자체적으로 다시 그려서(재구현) 글자 크기가 실제 화면과 미묘하게 달라지는
// 문제가 있어, 브라우저가 직접 렌더링한 결과를 그대로 이미지로 옮기는 html-to-image(SVG
// foreignObject 방식)를 사용 — 실제 화면(스크린샷)과 픽셀 단위로 훨씬 가깝게 나온다.
async function exportElementAsJPEG(el: HTMLElement, filename: string) {
  const targetWidth = 1920;
  const scale = Math.min(3, Math.max(1, targetWidth / el.offsetWidth));
  const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
  const dataUrl = await toJpeg(el, {
    quality: 0.95,
    pixelRatio: scale,
    backgroundColor: bg,
    filter: (node) => !(node instanceof HTMLElement && node.getAttribute('data-html2canvas-ignore') === 'true'),
  });
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
// 자정을 넘긴 종료시각(>=1440분)도 24시간으로 다시 감아서 "익일 6시"를 그냥 "6"으로 표시
// (30처럼 이어서 표시하면 오히려 헷갈려 보여 일반적인 12/24시간 표기로 되돌림)
function minToLabel(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
}

interface DisplayBlock {
  key: string;
  startMin: number;
  endMin: number; // startMin보다 크거나 같음. 자정을 넘기면 1440 이상
  members: { staffId: string; isOverridden: boolean }[];
}

/** 급여지급일 항목의 표시 라벨 — 주급/월급/월급(분할) 각각 "OO일/OO완료/OO미납" 형태 */
function paydayItemLabel(item: PaydayCellItem): string {
  if (item.payType === "weekly") {
    return item.status === "completed" ? "주급완료" : item.status === "overdue" ? "주급미납" : "주급일";
  }
  const base = item.status === "completed" ? "월급완료" : item.status === "overdue" ? "월급미납" : "월급지급";
  if (item.isSplit && item.index && item.total) return `${base}(${item.index}/${item.total})`;
  return item.status === "completed" ? "월급완료" : item.status === "overdue" ? "월급미납" : "월급일";
}

/** 달력 칸·스케줄 패널에서 쓰는 급여지급일 항목 — 주급/월급(분할 포함) 공통 표현.
 * periodKey는 지급완료 기록(staff_payday_completions)의 키: 주급=주 시작일, 월급=그 회차의 실제 지급 날짜. */
interface PaydayCellItem {
  staffId: string;
  status: "due" | "completed" | "overdue";
  payType: "weekly" | "monthly";
  periodKey: string;
  isSplit?: boolean;
  index?: number;
  total?: number;
  amount?: number; // monthly 전용(분할 시 회차 금액); weekly는 필요할 때 calculateWeeklyPay로 별도 계산
}

/** 근무자 한 명 또는 여러 명(같은 시간대 묶음)을 대표하는 색 — 감산혼합으로 섞음 */
function blockColor(members: { staffId: string }[], staffList: Staff[]): string {
  const colors = members.map(m => {
    const idx = staffList.findIndex(s => s.id === m.staffId);
    return getStaffColor(idx >= 0 ? idx : 0);
  });
  return multiplyBlendAll(colors);
}

/** 달력 칸 요약용 — 같은 시작·종료 시간의 슬롯끼리 하나로 묶어 이름을 함께 표시한다 */
function buildDisplayBlocks(slots: ResolvedScheduleSlot[]): DisplayBlock[] {
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
  return Array.from(blockMap.values()).sort((a, b) => a.startMin - b.startMin);
}

// 그래프의 기본 표시 범위 — 전날 22시(-120분)부터 다음날 6시(1800분)까지를 기본 틀로 삼는다
const TIMELINE_DEFAULT_START = -120;
const TIMELINE_DEFAULT_END = 1800;

// 축 위 시각 표시 — 그날(0~1439분) 범위를 벗어나면 "전날"/"익일"을 붙여 헷갈리지 않게 함
function dayRelLabel(min: number): string {
  if (min < 0) return `전날 ${minToLabel(min)}시`;
  if (min >= 1440) return `익일 ${minToLabel(min)}시`;
  return minToLabel(min) === "0" ? "자정" : `${minToLabel(min)}시`;
}

// 시계열 그래프의 왼쪽 이름 칸 너비 — 눈금선·구간 계산 모두 이 폭을 기준으로 맞춘다
const TIMELINE_LABEL_WIDTH = "3.5rem";

/** 날짜별 스케줄 패널에 쓰는 시계열 그래프 — 근무자마다 자기 행(레인)을 따로 두고 얇은 막대로
 * 근무시간을 표시한다. 같은 시간대에 다른 사람의 막대가 바로 위/아래 행에 나란히 보이므로
 * 색을 섞지 않아도 겹치는 시간을 한눈에 알 수 있다. 상단에는 전날/오늘/익일 구간을 치수선처럼
 * 구분해 보여주고, 눈금은 고정 간격이 아니라 각 근무 시작·종료 시각에만 표시한다. */
function DayTimeline({ slots, staffList }: { slots: ResolvedScheduleSlot[]; staffList: Staff[] }) {
  if (slots.length === 0) return null;
  const withMin = slots.map(s => {
    const startMin = timeToMin(s.startTime);
    let endMin = timeToMin(s.endTime);
    if (endMin <= startMin) endMin += 1440;
    return { ...s, startMin, endMin };
  });
  const axisStart = Math.min(TIMELINE_DEFAULT_START, ...withMin.map(s => s.startMin));
  const axisEnd = Math.max(TIMELINE_DEFAULT_END, ...withMin.map(s => s.endMin));
  const totalRange = axisEnd - axisStart;
  const posPct = (t: number) => ((t - axisStart) / totalRange) * 100;

  // 눈금 = 축의 시작·끝(전날/익일 표시용) + 각 근무의 시작·종료 시각
  const tickSet = new Set<number>([axisStart, axisEnd]);
  withMin.forEach(s => { tickSet.add(s.startMin); tickSet.add(s.endMin); });
  const ticks = Array.from(tickSet).sort((a, b) => a - b);

  const nameOf = (id: string) => staffList.find(st => st.id === id)?.name ?? "?";

  // 근무자별로 한 행씩 — 그 사람의 모든 구간을 같은 행에 묶는다(분리 근무면 막대가 여러 개)
  const rowMap = new Map<string, typeof withMin>();
  withMin.forEach(s => {
    if (!rowMap.has(s.staffId)) rowMap.set(s.staffId, []);
    rowMap.get(s.staffId)!.push(s);
  });
  const rows = Array.from(rowMap.entries())
    .map(([staffId, segs]) => ({ staffId, segs, firstStart: Math.min(...segs.map(x => x.startMin)) }))
    .sort((a, b) => a.firstStart - b.firstStart);

  return (
    <div className="space-y-1.5">
      {/* 전날 / 오늘 / 익일 구간 — 치수선 스타일 */}
      <div className="relative h-5 text-[10px] text-muted-foreground" style={{ marginLeft: TIMELINE_LABEL_WIDTH }}>
        {[
          { from: axisStart, to: 0, label: "전날" },
          { from: 0, to: 1440, label: "오늘" },
          { from: 1440, to: axisEnd, label: "익일" },
        ].filter(z => z.to > z.from).map(z => (
          <div
            key={z.label}
            className="absolute inset-y-0 border-t border-b border-foreground/20 flex items-center justify-center font-medium"
            style={{ left: `${posPct(z.from)}%`, width: `${posPct(z.to) - posPct(z.from)}%` }}
          >
            {z.label}
          </div>
        ))}
        <div className="absolute inset-y-0 border-l border-foreground/30" style={{ left: `${posPct(0)}%` }} />
        {axisEnd > 1440 && <div className="absolute inset-y-0 border-l border-foreground/30" style={{ left: `${posPct(1440)}%` }} />}
      </div>

      <div className="relative rounded-md overflow-hidden border">
        {/* 근무 시작·종료 시각 눈금선 — 모든 행을 관통해 어느 행끼리 겹치는지 바로 대조할 수 있게 함 */}
        <div className="absolute inset-y-0 pointer-events-none" style={{ left: TIMELINE_LABEL_WIDTH, right: 0 }}>
          {ticks.map(t => (
            <div key={t} className="absolute inset-y-0 border-l border-border" style={{ left: `${posPct(t)}%` }} />
          ))}
        </div>
        <div className="divide-y divide-border relative">
          {rows.map(row => {
            const idx = staffList.findIndex(st => st.id === row.staffId);
            const color = getStaffColor(idx >= 0 ? idx : 0);
            return (
              <div key={row.staffId} className="flex items-stretch h-7">
                <div
                  className="shrink-0 flex items-center px-1.5 text-[11px] font-medium truncate border-r bg-muted/30"
                  style={{ width: TIMELINE_LABEL_WIDTH }}
                >
                  {nameOf(row.staffId)}
                </div>
                <div className="relative flex-1">
                  {row.segs.map(s => (
                    <div
                      key={s.templateId}
                      className="absolute inset-y-1.5 rounded-sm"
                      style={{ left: `${posPct(s.startMin)}%`, width: `${((s.endMin - s.startMin) / totalRange) * 100}%`, backgroundColor: color }}
                      title={`${nameOf(row.staffId)} ${s.startTime}~${s.endTime}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="relative h-4 text-[10px] text-muted-foreground" style={{ marginLeft: TIMELINE_LABEL_WIDTH }}>
        {ticks.map(t => (
          <span
            key={t}
            className={`absolute whitespace-nowrap ${t === axisStart ? "" : t === axisEnd ? "-translate-x-full" : "-translate-x-1/2"}`}
            style={{ left: `${posPct(t)}%` }}
          >
            {dayRelLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
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
  staffList: Staff[]; // 재직 중인 직원만 — 근무자변경 등 "새로 배정" 선택지에 사용
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

  // staffList prop은 재직 중인 직원만(근무자변경 등 "선택" 목적용) — 이름 조회·재직기간 판정·색상은
  // 퇴사한 직원의 과거 기록도 정확해야 하므로 전체 직원을 따로 불러와 쓴다
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  useEffect(() => { setAllStaff(localDb.getAllStaff()); }, []);

  const [staffChangeSlot, setStaffChangeSlot] = useState<ResolvedScheduleSlot | null>(null);
  const [timeChangeSlot, setTimeChangeSlot] = useState<ResolvedScheduleSlot | null>(null);
  const [timeChangeStart, setTimeChangeStart] = useState("");
  const [timeChangeEnd, setTimeChangeEnd] = useState("");

  // JPEG 내보내기 캡처 대상 (화면에 보이는 디자인 그대로 이미지로 저장)
  const monthCalendarRef = useRef<HTMLDivElement>(null);
  const schedulePanelRef = useRef<HTMLDivElement>(null);

  // 급여 지급 확인 (버튼 클릭 → "지급하셨습니까?" 확인 → 예 누르면 완료 처리) — 주급·월급 공통
  const [paydayConfirm, setPaydayConfirm] = useState<{ staffId: string; periodKey: string; amount: number; label: string } | null>(null);

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

  const staffMap = useMemo(() => new Map(allStaff.map(s => [s.id, s])), [allStaff]);
  // 근무자별 급여유형(주급/월급) — 월급 근무자는 근무시간×시급 자동계산을 화면에 표시하지 않는다
  const payTypeMap = useMemo(() => new Map(paydays.map(p => [p.staffId, p.payType])), [paydays]);

  const slots = useMemo(
    () => resolveScheduleForDate(selectedDate, templates, overrides, allStaff),
    [selectedDate, templates, overrides, allStaff]
  );

  // 달력 칸에 바로 보여줄 날짜별 요약 (근무자·시간대별로 묶은 블록, 급여지급일 상태)
  const daySummaries = useMemo(() => {
    const todayStr = toDateStr(today);
    const map = new Map<string, { blocks: DisplayBlock[]; paydayItems: PaydayCellItem[] }>();
    bigGrid.forEach(d => {
      const dStr = toDateStr(d);
      const dow = getDay(d);
      const wStart = toWeekStart(d);

      const weeklyItems: PaydayCellItem[] = paydays
        .filter(p => p.isEnabled && p.payType === "weekly" && p.dayOfWeek === dow && isEmployedOn(dStr, p.staffId, allStaff))
        .map(p => {
          const completed = localDb.isPaydayCompleted(p.staffId, wStart);
          const status: "due" | "completed" | "overdue" = completed ? "completed" : dStr < todayStr ? "overdue" : "due";
          return { staffId: p.staffId, status, payType: "weekly" as const, periodKey: wStart };
        });

      const monthlyItems: PaydayCellItem[] = paydays
        .filter(p => p.isEnabled && p.payType === "monthly" && isEmployedOn(dStr, p.staffId, allStaff))
        .flatMap(p => {
          const resolved = resolveMonthlyPaydayDates(d.getFullYear(), d.getMonth(), p.paydayDates, p.splitAmounts, p.monthlyAmount);
          const match = resolved.find(r => r.date === dStr);
          if (!match) return [];
          const completed = localDb.isPaydayCompleted(p.staffId, dStr);
          const status: "due" | "completed" | "overdue" = completed ? "completed" : dStr < todayStr ? "overdue" : "due";
          return [{ staffId: p.staffId, status, payType: "monthly" as const, periodKey: dStr, isSplit: p.isSplit, index: match.index, total: match.total, amount: match.amount }];
        });

      const blocks = buildDisplayBlocks(resolveScheduleForDate(dStr, templates, overrides, allStaff));
      map.set(dStr, { blocks, paydayItems: [...weeklyItems, ...monthlyItems] });
    });
    return map;
  }, [bigGrid, templates, overrides, paydays, paydayVersion, today, allStaff]);

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

  const handleConfirmPaydayPaid = () => {
    if (!paydayConfirm) return;
    localDb.markPaydayCompleted(paydayConfirm.staffId, paydayConfirm.periodKey);
    setPaydayVersion(v => v + 1);
    toast({
      title: "지급 완료 처리됨",
      description: `${staffMap.get(paydayConfirm.staffId)?.name ?? ""} · ${paydayConfirm.label} ₩${paydayConfirm.amount.toLocaleString()}`,
    });
    setPaydayConfirm(null);
  };

  // 월별 다이어리(달력) PDF 내보내기 — 매출달력과 같은 방식으로 달력 그리드를 직접 그린다
  const handleExportMonthPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    await loadKoreanFont(doc);

    const pageWidth = 420, pageHeight = 297, margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const headerHeight = 16, dayHeaderHeight = 10;
    const colCount = 7;
    const colWidth = contentWidth / colCount;
    const rowCount = bigWeeks.length;
    const availableHeight = pageHeight * 0.92 - margin - headerHeight - dayHeaderHeight;
    const rowHeight = availableHeight / rowCount;

    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(`${format(selectedMonth, "yyyy년 M월")} 근무다이어리`, pageWidth / 2, margin + 10, { align: "center" });

    const tableStartY = margin + headerHeight;
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, tableStartY, contentWidth, dayHeaderHeight, "F");
    doc.rect(margin, tableStartY, contentWidth, dayHeaderHeight, "S");
    doc.setFontSize(11);
    DAY_NAMES.forEach((d, idx) => {
      const x = margin + idx * colWidth + colWidth / 2;
      doc.setTextColor(idx === 0 ? 220 : idx === 6 ? 59 : 0, idx === 0 ? 38 : idx === 6 ? 130 : 0, idx === 0 ? 38 : idx === 6 ? 246 : 0);
      doc.text(d, x, tableStartY + dayHeaderHeight / 2 + 3.5, { align: "center" });
    });

    bigWeeks.forEach((week, wi) => {
      const rowY = tableStartY + dayHeaderHeight + wi * rowHeight;
      week.forEach((day, di) => {
        const dStr = toDateStr(day);
        const isCurrentMonth = isSameMonth(day, selectedMonth);
        const summary = daySummaries.get(dStr);
        const cellX = margin + di * colWidth;
        const padding = 2.5;
        if (!isCurrentMonth) {
          doc.setFillColor(245, 245, 245);
          doc.rect(cellX, rowY, colWidth, rowHeight, "F");
        }
        const dow = getDay(day);
        doc.setFontSize(10);
        doc.setTextColor(
          !isCurrentMonth ? 180 : dow === 0 ? 220 : dow === 6 ? 59 : 0,
          !isCurrentMonth ? 180 : dow === 0 ? 38 : dow === 6 ? 130 : 0,
          !isCurrentMonth ? 180 : dow === 0 ? 38 : dow === 6 ? 246 : 0
        );
        doc.text(format(day, "d"), cellX + padding, rowY + padding + 3.5);

        let textY = rowY + padding + 8;
        if (isCurrentMonth && summary) {
          doc.setFontSize(6.8);
          summary.blocks.forEach((b, bi) => {
            if (textY > rowY + rowHeight - 1.5) return;
            const names = b.members.map(m => staffMap.get(m.staffId)?.name ?? "?").join("·");
            doc.setTextColor(0, 0, 0);
            doc.text(`${minToLabel(b.startMin)}~${minToLabel(b.endMin)} ${names}`, cellX + padding, textY);
            textY += 3.2;
            const next = summary.blocks[bi + 1];
            if (next && b.endMin > next.startMin && textY <= rowY + rowHeight - 1.5) {
              const oStart = Math.max(b.startMin, next.startMin);
              const oEnd = Math.min(b.endMin, next.endMin);
              const oNames = [...b.members, ...next.members].map(m => (staffMap.get(m.staffId)?.name ?? "?").charAt(0)).join("+");
              doc.setTextColor(140, 140, 140);
              doc.text(`${minToLabel(oStart)}~${minToLabel(oEnd)} ${oNames}`, cellX + padding, textY);
              textY += 3.2;
            }
          });
          summary.paydayItems.forEach(item => {
            if (textY > rowY + rowHeight - 1.5) return;
            const name = staffMap.get(item.staffId)?.name ?? "";
            doc.setTextColor(90, 90, 90);
            doc.text(`${name} ${paydayItemLabel(item)}`, cellX + padding, textY);
            textY += 3.2;
          });
        }
      });
    });

    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    for (let i = 0; i <= colCount; i++) {
      const x = margin + i * colWidth;
      doc.line(x, tableStartY + dayHeaderHeight, x, tableStartY + dayHeaderHeight + rowCount * rowHeight);
    }
    for (let i = 0; i <= rowCount; i++) {
      const y = tableStartY + dayHeaderHeight + i * rowHeight;
      doc.line(margin, y, margin + contentWidth, y);
    }
    doc.line(margin, tableStartY, margin + contentWidth, tableStartY);

    doc.save(`근무다이어리_${format(selectedMonth, "yyyy-MM")}.pdf`);
    toast({ title: "PDF 내보내기 완료", description: `근무다이어리_${format(selectedMonth, "yyyy-MM")}.pdf` });
  };

  // 날짜별 스케줄 PDF 내보내기 — 화면의 근무자별 레인 그래프를 그대로 그리고, 아래에 근무자별 상세 표를 붙인다
  const handleExportDayPDF = async () => {
    if (slots.length === 0) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const koreanFont = await loadKoreanFont(doc);

    const pageWidth = 210, margin = 14;
    const contentWidth = pageWidth - margin * 2;

    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    const dow = DAY_NAMES[getDay(new Date(selectedDate + "T00:00:00"))];
    doc.text(`${selectedDate} (${dow}요일) 근무 스케줄`, margin, margin + 4);

    // ── 근무자별 레인 그래프 (화면의 시계열 그래프와 동일한 로직) ──
    const withMin = slots.map(s => {
      const startMin = timeToMin(s.startTime);
      let endMin = timeToMin(s.endTime);
      if (endMin <= startMin) endMin += 1440;
      return { ...s, startMin, endMin };
    });
    const axisStart = Math.min(TIMELINE_DEFAULT_START, ...withMin.map(s => s.startMin));
    const axisEnd = Math.max(TIMELINE_DEFAULT_END, ...withMin.map(s => s.endMin));
    const totalRange = axisEnd - axisStart;

    const rowMap = new Map<string, typeof withMin>();
    withMin.forEach(s => {
      if (!rowMap.has(s.staffId)) rowMap.set(s.staffId, []);
      rowMap.get(s.staffId)!.push(s);
    });
    const ganttRows = Array.from(rowMap.entries())
      .map(([staffId, segs]) => ({ staffId, segs, firstStart: Math.min(...segs.map(x => x.startMin)) }))
      .sort((a, b) => a.firstStart - b.firstStart);

    const labelWidth = 26;
    const ganttX = margin, ganttTop = margin + 12;
    const barAreaX = ganttX + labelWidth, barAreaWidth = contentWidth - labelWidth;
    const posX = (t: number) => barAreaX + ((t - axisStart) / totalRange) * barAreaWidth;

    // 전날/오늘/익일 구간 표시
    const bandY = ganttTop, bandHeight = 6;
    doc.setFontSize(8);
    ([{ from: axisStart, to: 0, label: "전날" }, { from: 0, to: 1440, label: "오늘" }, { from: 1440, to: axisEnd, label: "익일" }] as const)
      .filter(z => z.to > z.from)
      .forEach(z => {
        doc.setDrawColor(190, 190, 190);
        doc.rect(posX(z.from), bandY, posX(z.to) - posX(z.from), bandHeight, "S");
        doc.setTextColor(110, 110, 110);
        doc.text(z.label, (posX(z.from) + posX(z.to)) / 2, bandY + bandHeight / 2 + 1.2, { align: "center" });
      });

    const rowHeight = 7;
    const ganttRowsTop = bandY + bandHeight + 2;
    doc.setFontSize(8.5);
    ganttRows.forEach((row, ri) => {
      const rowY = ganttRowsTop + ri * rowHeight;
      const idx = allStaff.findIndex(st => st.id === row.staffId);
      const color = getStaffColor(idx >= 0 ? idx : 0);
      doc.setDrawColor(170, 170, 170);
      doc.rect(ganttX, rowY, labelWidth, rowHeight, "S");
      doc.setTextColor(0, 0, 0);
      doc.text(staffMap.get(row.staffId)?.name ?? "?", ganttX + 1.5, rowY + rowHeight / 2 + 1.2);
      doc.rect(barAreaX, rowY, barAreaWidth, rowHeight, "S");
      row.segs.forEach(s => {
        const [r, g, b] = hexToRgbTuple(color);
        doc.setFillColor(r, g, b);
        doc.rect(posX(s.startMin), rowY + 1, posX(s.endMin) - posX(s.startMin), rowHeight - 2, "F");
      });
    });

    // 눈금(근무 시작·종료 시각)
    const tickSet = new Set<number>([axisStart, axisEnd]);
    withMin.forEach(s => { tickSet.add(s.startMin); tickSet.add(s.endMin); });
    const ticks = Array.from(tickSet).sort((a, b) => a - b);
    const tickY = ganttRowsTop + ganttRows.length * rowHeight + 4;
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    ticks.forEach(t => {
      const align = t === axisStart ? "left" : t === axisEnd ? "right" : "center";
      doc.text(dayRelLabel(t), posX(t), tickY, { align });
    });

    // ── 근무자별 상세 표 ──
    const tableStartY = tickY + 8;
    const weekStart = toWeekStart(new Date(selectedDate + "T00:00:00"));
    const dowNum = getDay(new Date(selectedDate + "T00:00:00"));
    const selDate = new Date(selectedDate + "T00:00:00");
    const tableBody = slots.map(slot => {
      const staff = staffMap.get(slot.staffId);
      const pay = calculateDailyPay(selectedDate, slot.startTime, slot.endTime, tiers);
      const isMonthlyPay = payTypeMap.get(slot.staffId) === "monthly";
      const payday = localDb.getStaffPayday(slot.staffId);
      let showPayday = false, isCompleted = false;
      if (payday?.isEnabled && payday.payType === "weekly" && payday.dayOfWeek === dowNum) {
        showPayday = true;
        isCompleted = localDb.isPaydayCompleted(slot.staffId, weekStart);
      } else if (payday?.isEnabled && payday.payType === "monthly") {
        const match = resolveMonthlyPaydayDates(selDate.getFullYear(), selDate.getMonth(), payday.paydayDates, payday.splitAmounts, payday.monthlyAmount).find(r => r.date === selectedDate);
        if (match) { showPayday = true; isCompleted = localDb.isPaydayCompleted(slot.staffId, selectedDate); }
      }
      return [
        staff?.name ?? "(삭제된 직원)",
        formatKoreanTimeRange(slot.startTime, slot.endTime),
        `${(pay.totalMinutes / 60).toFixed(1)}시간`,
        isMonthlyPay ? "월급제" : `₩${pay.totalPay.toLocaleString()}`,
        slot.isOverridden ? "대체근무" : "",
        showPayday ? (isCompleted ? "지급완료" : "지급예정") : "-",
      ];
    });
    autoTable(doc, {
      head: [["근무자", "근무시간", "총 근무시간", "예상 일급", "비고", "급여"]],
      body: tableBody,
      startY: tableStartY,
      theme: "grid",
      styles: koreanFont ? { font: koreanFont, fontSize: 9 } : { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202], font: koreanFont || undefined, fontStyle: "normal" },
    });

    doc.save(`근무스케줄_${selectedDate}.pdf`);
    toast({ title: "PDF 내보내기 완료", description: `근무스케줄_${selectedDate}.pdf` });
  };

  const handleExportMonthJPEG = async () => {
    if (!monthCalendarRef.current) return;
    const filename = `근무다이어리_${format(selectedMonth, "yyyy-MM")}.jpg`;
    await exportElementAsJPEG(monthCalendarRef.current, filename);
    toast({ title: "JPEG 내보내기 완료", description: filename });
  };

  const handleExportDayJPEG = async () => {
    if (!schedulePanelRef.current) return;
    const filename = `근무스케줄_${selectedDate}.jpg`;
    await exportElementAsJPEG(schedulePanelRef.current, filename);
    toast({ title: "JPEG 내보내기 완료", description: filename });
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
        <div className="flex-1 min-w-0" ref={monthCalendarRef}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-base font-bold" data-testid="text-diary-month">{format(selectedMonth, "yyyy년 M월")}</p>
            <div className="flex items-center gap-1" data-html2canvas-ignore="true">
              <Button variant="ghost" size="icon" onClick={handleExportMonthJPEG} title="JPEG로 내보내기" data-testid="button-export-month-jpeg">
                <ImageIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleExportMonthPDF} title="PDF로 내보내기" data-testid="button-export-month-pdf">
                <FileDown className="h-4 w-4" />
              </Button>
            </div>
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
                      {isCurrentMonth && summary && (summary.blocks.length > 0 || summary.paydayItems.length > 0) && (
                        <div className="mt-1 space-y-0.5">
                          {summary.blocks.map((b, bi) => {
                            const names = b.members.map(m => staffMap.get(m.staffId)?.name ?? "?").join("·");
                            const hasOverride = b.members.some(m => m.isOverridden);
                            const color = blockColor(b.members, allStaff);
                            const next = summary.blocks[bi + 1];
                            const overlapsNext = !!next && b.endMin > next.startMin;
                            const overlapStart = overlapsNext ? Math.max(b.startMin, next.startMin) : 0;
                            const overlapEnd = overlapsNext ? Math.min(b.endMin, next.endMin) : 0;
                            const overlapNames = overlapsNext
                              ? [...b.members, ...next.members].map(m => (staffMap.get(m.staffId)?.name ?? "?").charAt(0)).join("+")
                              : "";
                            return (
                              <div key={b.key}>
                                <div
                                  className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${hasOverride ? "ring-1 ring-amber-400" : ""}`}
                                  style={{ backgroundColor: color + "26", color }}
                                >
                                  {minToLabel(b.startMin)}~{minToLabel(b.endMin)} {names}
                                </div>
                                {overlapsNext && (
                                  <div className="text-[10px] leading-tight truncate rounded px-1 py-0.5 border border-muted-foreground/30 text-muted-foreground">
                                    {minToLabel(overlapStart)}~{minToLabel(overlapEnd)} {overlapNames}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {summary.paydayItems.map((item, ii) => {
                            const name = staffMap.get(item.staffId)?.name ?? "";
                            const label = paydayItemLabel(item);
                            return (
                              <div key={`${item.staffId}-${item.payType}-${ii}`} className="text-[10px] leading-tight truncate rounded px-1 py-0.5 bg-gray-600 text-white font-medium flex items-center gap-0.5">
                                {item.status === "completed" && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                                {name} {label}
                              </div>
                            );
                          })}
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
      <div className="border rounded-md p-3 bg-muted/10 space-y-3" ref={schedulePanelRef}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold" data-testid="text-schedule-panel-date">
            {selectedDate} ({DAY_NAMES[getDay(new Date(selectedDate + "T00:00:00"))]}요일) 스케줄
          </p>
          <div className="flex items-center gap-1" data-html2canvas-ignore="true">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportDayJPEG}
              disabled={slots.length === 0}
              title="JPEG로 내보내기"
              data-testid="button-export-day-jpeg"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleExportDayPDF}
              disabled={slots.length === 0}
              title="PDF로 내보내기"
              data-testid="button-export-day-pdf"
            >
              <FileDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {(() => {
          const weekStart = toWeekStart(new Date(selectedDate + "T00:00:00"));
          const todaysPaydayItems = daySummaries.get(selectedDate)?.paydayItems ?? [];
          void paydayVersion; // 지급완료 처리 후 재렌더 트리거용 참조

          if (slots.length === 0 && todaysPaydayItems.length === 0) {
            return (
              <p className="text-sm text-muted-foreground text-center py-6">
                이 날짜에 등록된 파트타임 스케줄이 없습니다.<br />
                <span className="text-xs">시스템설정 &gt; 직원관리에서 파트타임을 등록해주세요.</span>
              </p>
            );
          }

          return (
            <div className="space-y-3">
              {slots.length > 0 && <DayTimeline slots={slots} staffList={allStaff} />}
              {slots.map(slot => {
                const staff = staffMap.get(slot.staffId);
                const pay = calculateDailyPay(selectedDate, slot.startTime, slot.endTime, tiers);
                const isMonthlyPay = payTypeMap.get(slot.staffId) === "monthly";

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
                      {isMonthlyPay ? (
                        <span className="text-muted-foreground ml-2 text-xs">(월급제 — 시급 계산 제외)</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground ml-2">예상 일급 :</span>
                          <span className="font-bold text-primary">₩{pay.totalPay.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                    {!isMonthlyPay && pay.segments.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        {pay.segments.map((s, i) => (
                          <span key={i}>{i > 0 && " + "}{s.tierName} {(s.minutes / 60).toFixed(1)}h×₩{s.hourlyRate.toLocaleString()}</span>
                        ))}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* 급여 지급 — 그 날 근무 여부와 무관하게 지급일인 근무자는 항상 표시 (사후 지급도 가능하게) */}
              {todaysPaydayItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Wallet className="h-4 w-4 text-muted-foreground" /> 급여 지급
                  </p>
                  {todaysPaydayItems.map((item, ii) => {
                    const name = staffMap.get(item.staffId)?.name ?? "(삭제된 직원)";
                    const isCompleted = item.status === "completed";
                    const isWeekly = item.payType === "weekly";
                    const weekly = isWeekly ? calculateWeeklyPay(item.staffId, weekStart, templates, overrides, tiers, allStaff) : null;
                    const amount = isWeekly ? (weekly?.totalPay ?? 0) : (item.amount ?? 0);
                    const workedDates = weekly
                      ? weekly.days.filter(d => d.result.totalMinutes > 0).map(d => format(new Date(d.date + "T00:00:00"), "M/d"))
                      : [];
                    const typeBadge = isWeekly ? "주급" : item.isSplit ? `월급 ${item.index}/${item.total}회차` : "월급";
                    const confirmLabel = isWeekly ? "이번 주 주급" : item.isSplit ? `월급 ${item.index}/${item.total}회차` : "월급";
                    return (
                      <div key={`${item.staffId}-${item.payType}-${ii}`} className="rounded-md border border-blue-400/30 bg-blue-500/5 p-2.5 space-y-1.5">
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" /> {name}
                          <Badge variant="outline" className="text-[10px] font-normal">{typeBadge}</Badge>
                        </p>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {isWeekly ? (
                            <>
                              <p>근무일 : {workedDates.length > 0 ? workedDates.join(", ") : "-"}</p>
                              <p>총 근무시간 : <span className="font-medium text-foreground">{(weekly!.totalMinutes / 60).toFixed(1)}시간</span></p>
                            </>
                          ) : (
                            <p>지급일 : {selectedDate}</p>
                          )}
                          <p>지급액 : <span className="font-bold text-primary">₩{amount.toLocaleString()}</span></p>
                        </div>
                        {isCompleted ? (
                          <Badge className="bg-green-600 hover:bg-green-600 text-white gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {isWeekly ? "주급지급완료" : "월급지급완료"}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => setPaydayConfirm({ staffId: item.staffId, periodKey: item.periodKey, amount, label: confirmLabel })}
                            data-testid={`button-payday-complete-${item.staffId}-${item.payType}`}
                          >
                            <Wallet className="h-4 w-4 mr-1" />
                            {isWeekly ? "주급지급" : "월급지급"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
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

      {/* 급여 지급 확인 */}
      <AlertDialog open={!!paydayConfirm} onOpenChange={(o) => !o && setPaydayConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>급여 지급 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {paydayConfirm && (() => {
                const name = staffMap.get(paydayConfirm.staffId)?.name ?? "";
                return `${name}님에게 ${paydayConfirm.label} ₩${paydayConfirm.amount.toLocaleString()}을 지급하셨습니까?`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>아니오</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPaydayPaid} data-testid="button-confirm-payday-paid">예</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
