import { useState, useEffect, useMemo } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import {
  Users, Clock, LogIn, LogOut, Plus, Trash2, Star, AlertTriangle,
  CheckCircle, TrendingDown, Pencil, ChevronLeft, ChevronUp, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import * as localDb from "@/lib/localDb";
import type { Staff, StaffWorkLog, StaffRating, StaffRatingValue, PayType } from "@/lib/localDb";

const TZ = "Asia/Seoul";
const getKstNow = () => toZonedTime(new Date(), TZ);
const getTodayStr = () => format(getKstNow(), "yyyy-MM-dd");

const STAFF_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#06B6D4", "#EC4899", "#F97316", "#6366F1", "#14B8A6",
];
function getStaffColor(index: number): string {
  return STAFF_COLORS[index % STAFF_COLORS.length];
}

function formatMinutes(minutes: number): string {
  if (!minutes) return "0시간";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function calcWorkMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s);
}

function useCurrentTime() {
  const [now, setNow] = useState(getKstNow());
  useEffect(() => {
    const t = setInterval(() => setNow(getKstNow()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const PAY_TYPES: PayType[] = ["주간", "야간", "주말", "공휴일"];
const PAY_TYPE_COLORS: Record<PayType, string> = {
  "주간":  "border-blue-400/50 text-blue-700 dark:text-blue-300 bg-blue-500/10",
  "야간":  "border-indigo-400/50 text-indigo-700 dark:text-indigo-300 bg-indigo-500/10",
  "주말":  "border-green-400/50 text-green-700 dark:text-green-300 bg-green-500/10",
  "공휴일": "border-orange-400/50 text-orange-700 dark:text-orange-300 bg-orange-500/10",
};

const RATING_CONFIG: Record<StaffRatingValue, { color: string; icon: React.ElementType }> = {
  "훌륭": { color: "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/10", icon: Star },
  "좋음": { color: "border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10", icon: CheckCircle },
  "태만": { color: "border-orange-500/40 text-orange-700 dark:text-orange-400 bg-orange-500/10", icon: TrendingDown },
  "경고": { color: "border-red-500/40 text-red-700 dark:text-red-400 bg-red-500/10", icon: AlertTriangle },
};

// ── 커스텀 시간 선택기 ────────────────────────────────────────────
interface TimePickerButtonProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  testId?: string;
}
function TimePickerButton({ value, onChange, label, testId }: TimePickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [tempH, setTempH] = useState(0);
  const [tempM, setTempM] = useState(0);

  const openPicker = () => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setTempH(h);
      setTempM(Math.round(m / 10) * 10 % 60);  // 10분 단위 반올림
    } else {
      const now = toZonedTime(new Date(), TZ);
      setTempH(now.getHours());
      setTempM(Math.round(now.getMinutes() / 10) * 10 % 60);  // 10분 단위 반올림
    }
    setOpen(true);
  };

  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-center font-mono text-base" onClick={openPicker} data-testid={testId}>
        <Clock className="h-4 w-4 mr-2 shrink-0" />
        {value || "시간 선택"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>{label || "시간 선택"}</DialogTitle></DialogHeader>
          <div className="flex items-center justify-center gap-6 py-4">
            <div className="flex flex-col items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setTempH(h => (h + 1) % 24)}><ChevronUp className="h-5 w-5" /></Button>
              <div className="w-16 h-16 flex items-center justify-center text-4xl font-bold select-none">{String(tempH).padStart(2, "0")}</div>
              <Button size="icon" variant="ghost" onClick={() => setTempH(h => (h + 23) % 24)}><ChevronDown className="h-5 w-5" /></Button>
              <span className="text-xs text-muted-foreground mt-1">시</span>
            </div>
            <span className="text-4xl font-bold pb-6">:</span>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setTempM(m => (m + 10) % 60)}><ChevronUp className="h-5 w-5" /></Button>
              <div className="w-16 h-16 flex items-center justify-center text-4xl font-bold select-none">{String(tempM).padStart(2, "0")}</div>
              <Button size="icon" variant="ghost" onClick={() => setTempM(m => (m + 50) % 60)}><ChevronDown className="h-5 w-5" /></Button>
              <span className="text-xs text-muted-foreground mt-1">분</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button onClick={() => { onChange(`${String(tempH).padStart(2, "0")}:${String(tempM).padStart(2, "0")}`); setOpen(false); }} data-testid="btn-timepicker-set">설정</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
// ─────────────────────────────────────────────────────────────────

// 날짜별로 구간들을 묶어 요약
interface DayGroup {
  date: string;
  segments: StaffWorkLog[];
  totalMinutes: number;
  totalPay: number;
  clockIn: string;
  clockOut: string;
}

function groupByDate(logs: StaffWorkLog[]): DayGroup[] {
  const map: Record<string, StaffWorkLog[]> = {};
  for (const l of logs) {
    if (!map[l.workDate]) map[l.workDate] = [];
    map[l.workDate].push(l);
  }
  const result: DayGroup[] = Object.entries(map).map(([date, segs]) => {
    const totalMinutes = segs.reduce((s: number, l: StaffWorkLog) => s + l.workMinutes, 0);
    const totalPay = segs.reduce((s: number, l: StaffWorkLog) => s + l.segmentPay, 0);
    const clockIn = segs.map((l: StaffWorkLog) => l.startTime).filter(Boolean).sort()[0] || "";
    const clockOut = segs.map((l: StaffWorkLog) => l.endTime).filter(Boolean).sort().reverse()[0] || "";
    return { date, segments: segs, totalMinutes, totalPay, clockIn, clockOut };
  });
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

export default function StaffLogPage() {
  const { toast } = useToast();
  const today = getTodayStr();
  const currentTime = useCurrentTime();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [workLogs, setWorkLogs] = useState<StaffWorkLog[]>([]);
  const [todayLogs, setTodayLogs] = useState<StaffWorkLog[]>([]);
  const [ratings, setRatings] = useState<StaffRating[]>([]);

  // 오늘 근태기록 (출퇴근 버튼용) — 첫 번째 구간의 실제 출퇴근
  const [clockLog, setClockLog] = useState<StaffWorkLog | null>(null);

  // 새 구간 입력 폼
  const [newSeg, setNewSeg] = useState<{
    start: string; end: string; payType: PayType; hourlyRate: string; notes: string;
  }>({ start: "", end: "", payType: "주간", hourlyRate: "", notes: "" });

  // 수정 다이얼로그
  const [editingLog, setEditingLog] = useState<StaffWorkLog | null>(null);
  const [editForm, setEditForm] = useState<{
    startTime: string; endTime: string; payType: PayType; hourlyRate: string; notes: string;
  }>({ startTime: "", endTime: "", payType: "주간", hourlyRate: "", notes: "" });
  const [isEditOpen, setIsEditOpen] = useState(false);

  // 성실도
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [ratingForm, setRatingForm] = useState<{ rating: StaffRatingValue; date: string; note: string }>({
    rating: "좋음", date: today, note: "",
  });

  const selectedStaff = staffList.find(s => s.id === selectedStaffId) ?? null;
  const selectedStaffIndex = staffList.findIndex(s => s.id === selectedStaffId);
  const selectedColor = selectedStaffIndex >= 0 ? getStaffColor(selectedStaffIndex) : "#3B82F6";

  useEffect(() => {
    setStaffList(localDb.getAllStaff(true));
  }, []);

  const reloadStaffData = (staffId: string) => {
    const currentToday = getTodayStr();
    const logs = localDb.getWorkLogs(staffId);
    setWorkLogs(logs);
    const todSegs = localDb.getTodayWorkLogs(staffId, currentToday);
    setTodayLogs(todSegs);

    // 근태기록: segmentPay=0, workMinutes=0인 출퇴근 전용 레코드만 사용
    // (급여 구간 레코드를 clockLog로 혼용하면 출퇴근 탭 필터에서 누락되는 버그 발생)
    // 없으면 전날 미퇴근 근태전용 레코드 확인 (야간 출근 → 자정 넘어 퇴근 케이스)
    let foundClockLog = todSegs.find(s => s.segmentPay === 0 && s.workMinutes === 0 && s.startTime) ?? null;
    if (!foundClockLog) {
      const yesterday = format(subDays(getKstNow(), 1), "yyyy-MM-dd");
      const ySegs = localDb.getTodayWorkLogs(staffId, yesterday);
      // 전날 출근(startTime 있음)했으나 퇴근(endTime) 없는 근태전용 레코드
      const nightLog = ySegs.find(s => s.startTime && !s.endTime && s.segmentPay === 0 && s.workMinutes === 0);
      foundClockLog = nightLog ?? null;
    }
    setClockLog(foundClockLog);
    setRatings(localDb.getStaffRatings(staffId));
  };

  useEffect(() => {
    if (!selectedStaffId) return;
    reloadStaffData(selectedStaffId);
  }, [selectedStaffId]);

  // 주/월 집계
  const { weekMinutes, weekPay, monthMinutes, monthPay } = useMemo(() => {
    const now = getKstNow();
    const wStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const wEnd   = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const mStart = format(startOfMonth(now), "yyyy-MM-dd");
    const mEnd   = format(endOfMonth(now), "yyyy-MM-dd");
    let wMin = 0, wPay = 0, mMin = 0, mPay = 0;
    for (const log of workLogs) {
      if (log.workDate >= wStart && log.workDate <= wEnd) { wMin += log.workMinutes; wPay += log.segmentPay; }
      if (log.workDate >= mStart && log.workDate <= mEnd) { mMin += log.workMinutes; mPay += log.segmentPay; }
    }
    return { weekMinutes: wMin, weekPay: wPay, monthMinutes: mMin, monthPay: mPay };
  }, [workLogs]);

  // 오늘 합계
  const todayTotalMinutes = todayLogs.reduce((s, l) => s + l.workMinutes, 0);
  const todayTotalPay = todayLogs.reduce((s, l) => s + l.segmentPay, 0);

  // 새 구간 계산 미리보기
  const newSegMinutes = calcWorkMinutes(newSeg.start, newSeg.end);
  const newSegHourlyRate = parseInt(newSeg.hourlyRate.replace(/,/g, "")) || 0;
  const newSegPay = newSegHourlyRate > 0 ? Math.floor((newSegMinutes / 60) * newSegHourlyRate) : 0;

  // 출퇴근 핸들러
  const handleClockIn = () => {
    if (!selectedStaffId) return;
    const nowStr = format(getKstNow(), "HH:mm");
    if (clockLog) {
      localDb.updateWorkLog(clockLog.id, { startTime: nowStr });
    } else {
      // 근태전용 임시 구간 — 급여는 0, 구간 저장할 때 덮어씀
      localDb.createWorkLog({
        staffId: selectedStaffId, workDate: today,
        startTime: nowStr, endTime: "",
        breakMinutes: 0, workMinutes: 0, dailyPay: 0,
        notes: "", agreedStartTime: "", agreedEndTime: "",
        payType: "주간", segmentPay: 0,
      });
    }
    reloadStaffData(selectedStaffId);
    toast({ title: "출근 기록 완료", description: `${nowStr} 기록 (근태기록용)` });
  };

  const handleClockOut = () => {
    if (!selectedStaffId || !clockLog) return;
    const nowStr = format(getKstNow(), "HH:mm");
    localDb.updateWorkLog(clockLog.id, { endTime: nowStr });
    reloadStaffData(selectedStaffId);
    toast({ title: "퇴근 기록 완료", description: `${nowStr} 기록 (근태기록용)` });
  };

  // 구간 추가
  const handleAddSegment = () => {
    if (!selectedStaffId) return;
    if (!newSeg.start || !newSeg.end) {
      toast({ title: "시작 시간과 종료 시간을 입력해주세요.", variant: "destructive" });
      return;
    }
    const workMinutes = newSegMinutes;
    localDb.createWorkLog({
      staffId: selectedStaffId, workDate: today,
      startTime: clockLog?.startTime || "", endTime: clockLog?.endTime || "",
      breakMinutes: 0, workMinutes,
      dailyPay: newSegPay, notes: newSeg.notes,
      agreedStartTime: newSeg.start, agreedEndTime: newSeg.end,
      payType: newSeg.payType, segmentPay: newSegPay, hourlyRate: newSegHourlyRate,
    });
    setNewSeg({ start: "", end: "", payType: "주간", hourlyRate: "", notes: "" });
    reloadStaffData(selectedStaffId);
    const desc = newSegPay > 0
      ? `${newSeg.start}~${newSeg.end} (${formatMinutes(workMinutes)}) · ₩${newSegPay.toLocaleString()}`
      : `${newSeg.start}~${newSeg.end} (${formatMinutes(workMinutes)}) · 근태전용`;
    toast({ title: "근무 구간 추가됨", description: desc });
  };

  // 구간 삭제
  const handleDeleteLog = (id: string) => {
    if (!confirm("이 근무 구간을 삭제하시겠습니까?")) return;
    localDb.deleteWorkLog(id);
    reloadStaffData(selectedStaffId);
    toast({ title: "구간이 삭제되었습니다." });
  };

  // 수정
  const handleOpenEdit = (log: StaffWorkLog) => {
    setEditingLog(log);
    setEditForm({
      startTime: log.agreedStartTime || log.startTime || "",
      endTime: log.agreedEndTime || log.endTime || "",
      payType: log.payType || "주간",
      hourlyRate: log.hourlyRate ? log.hourlyRate.toString() : "",
      notes: log.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingLog) return;
    const rate = parseInt(editForm.hourlyRate.replace(/,/g, "")) || 0;
    const workMinutes = calcWorkMinutes(editForm.startTime, editForm.endTime);
    const pay = rate > 0 ? Math.floor((workMinutes / 60) * rate) : 0;
    localDb.updateWorkLog(editingLog.id, {
      agreedStartTime: editForm.startTime,
      agreedEndTime: editForm.endTime,
      payType: editForm.payType,
      segmentPay: pay,
      hourlyRate: rate,
      workMinutes,
      dailyPay: pay,
      notes: editForm.notes,
    });
    reloadStaffData(selectedStaffId);
    setIsEditOpen(false);
    toast({ title: "구간이 수정되었습니다." });
  };

  // 성실도
  const handleSaveRating = () => {
    if (!selectedStaffId) return;
    localDb.createStaffRating({ staffId: selectedStaffId, ratingDate: ratingForm.date, rating: ratingForm.rating, note: ratingForm.note });
    setRatings(localDb.getStaffRatings(selectedStaffId));
    setIsRatingOpen(false);
    toast({ title: "성실도 평가가 등록되었습니다." });
  };

  const handleDeleteRating = (id: string) => {
    if (!confirm("이 평가를 삭제하시겠습니까?")) return;
    localDb.deleteStaffRating(id);
    setRatings(localDb.getStaffRatings(selectedStaffId));
    toast({ title: "평가가 삭제되었습니다." });
  };

  const hasClockedIn = !!clockLog?.startTime;
  const hasClockedOut = !!clockLog?.endTime;
  // 전날 출근 기록이 이어지는 야간 근무 여부
  const isNightShift = !!clockLog && clockLog.workDate !== getTodayStr();

  const dayGroups = useMemo(() => groupByDate(workLogs), [workLogs]);

  // ──────────────────────────────────────────────
  if (staffList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Users className="h-12 w-12" />
        <p className="text-lg font-medium">등록된 직원이 없습니다</p>
        <p className="text-sm">설정 → 직원관리에서 직원을 먼저 추가해주세요.</p>
      </div>
    );
  }

  // ── 직원 선택 화면 ────────────────────────────
  if (!selectedStaffId) {
    return (
      <div className="h-full flex flex-col">
        <div className="border-b p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">직원근무일지</h1>
            <span className="text-sm text-muted-foreground">
              {format(getKstNow(), "yyyy년 M월 d일 (EEEE)", { locale: ko })}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-8">
          <p className="text-muted-foreground text-sm mb-8 tracking-wide">근무일지를 기록할 직원을 선택하세요</p>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 w-full max-w-2xl">
            {staffList.map((s, idx) => {
              const color = getStaffColor(idx);
              const isHovered = hoveredId === s.id;
              return (
                <button
                  key={s.id}
                  data-testid={`button-staff-${s.id}`}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedStaffId(s.id)}
                  style={{
                    backgroundColor: isHovered ? color : undefined,
                    borderColor: isHovered ? color : undefined,
                    transform: isHovered ? "scale(1.07)" : "scale(1)",
                    transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
                  }}
                  className="flex flex-col items-center justify-center gap-3 py-8 px-4 rounded-xl border-2 border-border bg-card cursor-pointer focus:outline-none"
                >
                  {s.photo ? (
                    <img src={s.photo} alt={s.name} className="w-14 h-14 rounded-full object-cover border-2" style={{ borderColor: isHovered ? "rgba(255,255,255,0.4)" : color + "40" }} />
                  ) : (
                    <div style={{ backgroundColor: isHovered ? "rgba(255,255,255,0.25)" : color + "20", color: isHovered ? "white" : color, transition: "background-color 0.18s ease, color 0.18s ease" }} className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold">
                      {s.name.charAt(0)}
                    </div>
                  )}
                  <span style={{ color: isHovered ? "white" : undefined, transition: "color 0.18s ease" }} className="text-base font-semibold text-foreground">
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── 직원 상세 화면 ────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="border-b p-4 flex items-center gap-3 flex-wrap">
        <Button size="icon" variant="ghost" onClick={() => setSelectedStaffId("")} data-testid="button-back-to-picker">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        {selectedStaff?.photo ? (
          <img src={selectedStaff.photo} alt={selectedStaff.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: selectedColor }}>
            {selectedStaff?.name.charAt(0)}
          </div>
        )}
        <h1 className="text-xl font-semibold">{selectedStaff?.name}</h1>
        <span className="text-sm text-muted-foreground ml-auto">{format(getKstNow(), "yyyy년 M월 d일 (EEEE)", { locale: ko })}</span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* ── 오늘 근태기록 ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Clock className="h-4 w-4" />
                  오늘 근태기록
                  {isNightShift && (
                    <Badge variant="outline" className="text-xs border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                      야간 근무 중 ({clockLog!.workDate} 출근)
                    </Badge>
                  )}
                </div>
                <span className="font-mono text-lg tabular-nums text-muted-foreground">
                  {format(currentTime, "HH:mm:ss")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* 출근 */}
                <div>
                  {hasClockedIn ? (
                    <div className="w-full flex flex-col items-center gap-1 py-4 border-2 border-green-500/40 bg-green-500/5 rounded-lg">
                      <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-muted-foreground">실제 출근</span>
                      <span className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">{clockLog!.startTime}</span>
                    </div>
                  ) : (
                    <button onClick={handleClockIn} data-testid="button-clock-in"
                      className="w-full flex flex-col items-center gap-2 py-5 rounded-lg border-2 border-green-500 bg-green-500 hover-elevate active-elevate-2 text-white cursor-pointer">
                      <LogIn className="h-7 w-7" />
                      <span className="text-base font-bold">출근</span>
                      <span className="text-xs opacity-80">버튼을 눌러 출근 기록</span>
                    </button>
                  )}
                </div>
                {/* 퇴근 */}
                <div>
                  {hasClockedOut ? (
                    <div className="w-full flex flex-col items-center gap-1 py-4 border-2 border-blue-500/40 bg-blue-500/5 rounded-lg">
                      <CheckCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs text-muted-foreground">실제 퇴근</span>
                      <span className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{clockLog!.endTime}</span>
                    </div>
                  ) : (
                    <button onClick={handleClockOut} disabled={!hasClockedIn} data-testid="button-clock-out"
                      className={`w-full flex flex-col items-center gap-2 py-5 rounded-lg border-2 ${hasClockedIn ? "border-red-500 bg-red-500 hover-elevate active-elevate-2 text-white cursor-pointer" : "border-muted bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"}`}>
                      <LogOut className="h-7 w-7" />
                      <span className="text-base font-bold">퇴근</span>
                      <span className="text-xs opacity-80">{hasClockedIn ? "버튼을 눌러 퇴근 기록" : "출근 후 활성화"}</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">근태기록 전용 — 급여 계산에 영향 없음</p>
            </CardContent>
          </Card>

          {/* ── 오늘 근무 구간 ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                오늘 근무 구간
                <span className="text-xs font-normal text-muted-foreground">(파트타임·시급제)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 정직원 안내 */}
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                정직원(월급제)은 아래 구간 추가 없이 위 출퇴근 버튼만 사용하시면 됩니다.
              </div>

              {/* 기존 구간 목록 */}
              {todayLogs.length > 0 && (
                <div className="space-y-2">
                  {todayLogs.map((seg, i) => {
                    const timeRange = seg.agreedStartTime && seg.agreedEndTime
                      ? `${seg.agreedStartTime} ~ ${seg.agreedEndTime}`
                      : seg.startTime && seg.endTime
                        ? `${seg.startTime} ~ ${seg.endTime}`
                        : "시간 미입력";
                    return (
                      <div key={seg.id} className="flex items-center gap-2 p-3 border rounded-md bg-muted/20 flex-wrap">
                        <span className="text-xs text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                        <Badge variant="outline" className={`shrink-0 text-xs ${PAY_TYPE_COLORS[seg.payType || "주간"]}`}>
                          {seg.payType || "주간"}
                        </Badge>
                        <span className="font-mono text-sm tabular-nums">{timeRange}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">{formatMinutes(seg.workMinutes)}</span>
                        {seg.hourlyRate > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            시간당 ₩{seg.hourlyRate.toLocaleString()}
                          </span>
                        )}
                        <span className="text-sm font-bold text-primary tabular-nums ml-auto">
                          {seg.segmentPay > 0 ? `₩${seg.segmentPay.toLocaleString()}` : "—"}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(seg)} data-testid={`button-edit-seg-${seg.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDeleteLog(seg.id)} data-testid={`button-delete-seg-${seg.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {/* 합계 */}
                  {todayTotalPay > 0 && (
                    <div className="flex items-center justify-end gap-4 px-3 py-2 bg-primary/5 border border-primary/20 rounded-md text-sm">
                      <span className="text-muted-foreground">오늘 합계</span>
                      <span className="font-semibold">{formatMinutes(todayTotalMinutes)}</span>
                      <span className="font-bold text-primary">₩{todayTotalPay.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 새 구간 입력 */}
              <div className="border rounded-md p-3 space-y-3 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {todayLogs.length > 0 ? "구간 추가" : "구간 입력"}
                </p>

                {/* 시간 + 페이타입 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">시작 시간</Label>
                    <TimePickerButton value={newSeg.start} onChange={v => setNewSeg(s => ({ ...s, start: v }))} label="시작 시간" testId="input-new-seg-start" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">종료 시간</Label>
                    <TimePickerButton value={newSeg.end} onChange={v => setNewSeg(s => ({ ...s, end: v }))} label="종료 시간" testId="input-new-seg-end" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">근무 유형</Label>
                    <Select value={newSeg.payType} onValueChange={v => setNewSeg(s => ({ ...s, payType: v as PayType }))}>
                      <SelectTrigger data-testid="select-new-pay-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAY_TYPES.map(pt => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 시간당 페이 + 비고 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">시간당 페이 (원, 선택)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={newSeg.hourlyRate}
                      onChange={e => setNewSeg(s => ({ ...s, hourlyRate: e.target.value.replace(/[^0-9]/g, "") }))}
                      placeholder="예: 12000"
                      data-testid="input-new-seg-hourly"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">비고 (선택)</Label>
                    <Input
                      type="text"
                      value={newSeg.notes}
                      onChange={e => setNewSeg(s => ({ ...s, notes: e.target.value }))}
                      placeholder="특이사항"
                      data-testid="input-new-seg-notes"
                    />
                  </div>
                </div>

                {/* 자동계산 미리보기 */}
                {newSeg.start && newSeg.end && newSegMinutes > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-md text-sm flex-wrap">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="tabular-nums text-muted-foreground">{newSeg.start} ~ {newSeg.end}</span>
                    <span className="font-semibold tabular-nums">{formatMinutes(newSegMinutes)}</span>
                    {newSegHourlyRate > 0 && (
                      <>
                        <span className="text-muted-foreground">×</span>
                        <span className="tabular-nums text-muted-foreground">₩{newSegHourlyRate.toLocaleString()}/h</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="font-bold text-primary tabular-nums">₩{newSegPay.toLocaleString()}</span>
                      </>
                    )}
                  </div>
                )}

                <Button className="w-full" onClick={handleAddSegment} data-testid="button-add-segment">
                  <Plus className="h-4 w-4 mr-1" />
                  구간 추가
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── 주간 / 월간 요약 ── */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">이번 주</p>
                <p className="text-lg font-semibold">{formatMinutes(weekMinutes)}</p>
                <p className="text-sm text-muted-foreground">₩{weekPay.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground mb-1">이번 달</p>
                <p className="text-lg font-semibold">{formatMinutes(monthMinutes)}</p>
                <p className="text-sm text-muted-foreground">₩{monthPay.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── 근무기록 / 출퇴근 / 성실도 탭 ── */}
          <Tabs defaultValue="logs">
            <TabsList>
              <TabsTrigger value="logs">근무 기록</TabsTrigger>
              <TabsTrigger value="attendance" data-testid="tab-attendance">출퇴근 기록</TabsTrigger>
              <TabsTrigger value="ratings">성실도 평가</TabsTrigger>
            </TabsList>

            <TabsContent value="logs" className="mt-3">
              {dayGroups.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">근무 기록이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {dayGroups.map(group => {
                    // 근태전용 레코드: segmentPay=0, workMinutes=0, startTime 있음
                    const attendanceRec = group.segments.find(
                      s => s.segmentPay === 0 && s.workMinutes === 0 && (s.startTime || s.endTime)
                    ) ?? null;
                    // 급여 구간: workMinutes>0 또는 segmentPay>0 인 것
                    const paySegments = group.segments.filter(
                      s => s.workMinutes > 0 || s.segmentPay > 0
                    );
                    return (
                    <div key={group.date} className="border rounded-md overflow-hidden">
                      {/* 날짜 헤더 */}
                      <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 border-b flex-wrap">
                        <span className="font-semibold text-sm tabular-nums">{group.date}</span>
                        {/* 출퇴근 시간 (근태기록) */}
                        {(attendanceRec?.startTime || attendanceRec?.endTime) ? (
                          <span className="flex items-center gap-1.5 text-xs">
                            <LogIn className="h-3 w-3 text-green-600 dark:text-green-400" />
                            <span className="tabular-nums font-mono">
                              {attendanceRec.startTime || "—"}
                            </span>
                            <LogOut className="h-3 w-3 text-red-500 dark:text-red-400 ml-1" />
                            <span className="tabular-nums font-mono">
                              {attendanceRec.endTime || "—"}
                            </span>
                          </span>
                        ) : (group.clockIn || group.clockOut) ? (
                          <span className="text-xs text-muted-foreground">
                            {group.clockIn && `출근 ${group.clockIn}`}
                            {group.clockIn && group.clockOut && " · "}
                            {group.clockOut && `퇴근 ${group.clockOut}`}
                          </span>
                        ) : null}
                        <span className="text-sm font-bold text-primary tabular-nums ml-auto">
                          {group.totalPay > 0
                            ? `${formatMinutes(group.totalMinutes)} · ₩${group.totalPay.toLocaleString()}`
                            : group.totalMinutes > 0
                              ? formatMinutes(group.totalMinutes)
                              : <span className="font-normal text-muted-foreground text-xs">근태전용</span>
                          }
                        </span>
                      </div>

                      {/* 근태전용 전용일 경우: 출근/퇴근만 기록된 행 표시 */}
                      {paySegments.length === 0 && attendanceRec && (
                        <div className="flex items-center gap-3 px-3 py-2 text-sm bg-green-500/5">
                          <Badge variant="outline" className="shrink-0 text-xs border-green-400/50 text-green-700 dark:text-green-400 bg-green-500/10">
                            근태
                          </Badge>
                          <span className="font-mono tabular-nums text-muted-foreground flex-1">
                            {attendanceRec.startTime && attendanceRec.endTime
                              ? `${attendanceRec.startTime} ~ ${attendanceRec.endTime}`
                              : attendanceRec.startTime
                                ? `출근 ${attendanceRec.startTime} (미퇴근)`
                                : "출근 미기록"}
                          </span>
                          {attendanceRec.startTime && attendanceRec.endTime && (
                            <span className="tabular-nums text-muted-foreground shrink-0">
                              {formatMinutes(calcWorkMinutes(attendanceRec.startTime, attendanceRec.endTime))}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground shrink-0">급여계산 없음</span>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteLog(attendanceRec.id)} data-testid={`button-delete-att-${attendanceRec.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* 급여 구간 목록 */}
                      {paySegments.map((seg, i) => {
                        const timeRange = seg.agreedStartTime && seg.agreedEndTime
                          ? `${seg.agreedStartTime} ~ ${seg.agreedEndTime}`
                          : seg.startTime && seg.endTime
                            ? `${seg.startTime} ~ ${seg.endTime}`
                            : "시간 미입력";
                        return (
                          <div key={seg.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                            <span className="text-xs text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                            <Badge variant="outline" className={`shrink-0 text-xs ${PAY_TYPE_COLORS[seg.payType || "주간"]}`}>
                              {seg.payType || "주간"}
                            </Badge>
                            <span className="font-mono tabular-nums text-muted-foreground flex-1">{timeRange}</span>
                            <span className="tabular-nums shrink-0">{formatMinutes(seg.workMinutes)}</span>
                            {seg.hourlyRate > 0 && (
                              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                ₩{seg.hourlyRate.toLocaleString()}/h
                              </span>
                            )}
                            <span className="font-semibold tabular-nums shrink-0">₩{seg.segmentPay.toLocaleString()}</span>
                            {seg.notes && <span className="text-muted-foreground text-xs max-w-20 truncate">{seg.notes}</span>}
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" onClick={() => handleOpenEdit(seg)} data-testid={`button-edit-log-${seg.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDeleteLog(seg.id)} data-testid={`button-delete-log-${seg.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="attendance" className="mt-3">
              {(() => {
                // 출퇴근 버튼으로 기록된 근태 레코드만 추출 (segmentPay=0, workMinutes=0)
                const attLogs = workLogs
                  .filter(l => l.segmentPay === 0 && l.workMinutes === 0 && (l.startTime || l.endTime))
                  .sort((a, b) => b.workDate.localeCompare(a.workDate));
                if (attLogs.length === 0) {
                  return (
                    <div className="text-center py-12 space-y-2">
                      <LogIn className="h-10 w-10 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground text-sm">출퇴근 기록이 없습니다.</p>
                      <p className="text-xs text-muted-foreground">위의 출근/퇴근 버튼을 눌러 기록하세요.</p>
                    </div>
                  );
                }
                return (
                  <div className="border rounded-md overflow-hidden">
                    {/* 헤더 */}
                    <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted/50 border-b text-xs font-semibold text-muted-foreground">
                      <span>날짜</span>
                      <span className="text-green-700 dark:text-green-400">출근</span>
                      <span className="text-blue-700 dark:text-blue-400">퇴근</span>
                      <span>근무시간</span>
                    </div>
                    {attLogs.map((log, i) => {
                      const mins = calcWorkMinutes(log.startTime || "", log.endTime || "");
                      const isToday = log.workDate === today;
                      return (
                        <div
                          key={log.id}
                          data-testid={`row-attendance-${log.id}`}
                          className={`grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center ${i % 2 === 1 ? "bg-muted/10" : ""} ${isToday ? "bg-primary/5" : ""}`}
                        >
                          <span className={`tabular-nums font-medium ${isToday ? "text-primary" : ""}`}>
                            {log.workDate}
                            {isToday && <span className="ml-1 text-xs text-primary font-normal">(오늘)</span>}
                          </span>
                          <span className={`tabular-nums font-mono ${log.startTime ? "text-green-700 dark:text-green-400 font-semibold" : "text-muted-foreground"}`}>
                            {log.startTime || "—"}
                          </span>
                          <span className={`tabular-nums font-mono ${log.endTime ? "text-blue-700 dark:text-blue-400 font-semibold" : "text-amber-600 dark:text-amber-400 text-xs"}`}>
                            {log.endTime || "미퇴근"}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {mins > 0 ? formatMinutes(mins) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="ratings" className="mt-3">
              <div className="flex justify-end mb-3">
                <Button size="sm" onClick={() => { setRatingForm({ rating: "좋음", date: today, note: "" }); setIsRatingOpen(true); }} data-testid="button-add-rating">
                  <Plus className="h-4 w-4 mr-1" />평가 추가
                </Button>
              </div>
              {ratings.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">성실도 평가가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {ratings.map(r => {
                    const cfg = RATING_CONFIG[r.rating];
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-3 border rounded-md">
                        <span className="text-sm text-muted-foreground tabular-nums w-24 shrink-0">{r.ratingDate}</span>
                        <Badge variant="outline" className={cfg.color}>{r.rating}</Badge>
                        <span className="text-sm flex-1 text-muted-foreground">{r.note}</span>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteRating(r.id)} data-testid={`button-delete-rating-${r.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── 구간 수정 다이얼로그 ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>근무 구간 수정 — {editingLog?.workDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>시작 시간</Label>
                <TimePickerButton value={editForm.startTime} onChange={v => setEditForm(f => ({ ...f, startTime: v }))} label="시작 시간" testId="input-edit-seg-start" />
              </div>
              <div className="space-y-1">
                <Label>종료 시간</Label>
                <TimePickerButton value={editForm.endTime} onChange={v => setEditForm(f => ({ ...f, endTime: v }))} label="종료 시간" testId="input-edit-seg-end" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>근무 유형</Label>
              <Select value={editForm.payType} onValueChange={v => setEditForm(f => ({ ...f, payType: v as PayType }))}>
                <SelectTrigger data-testid="select-edit-pay-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAY_TYPES.map(pt => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>시간당 페이 (원, 선택)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={editForm.hourlyRate}
                onChange={e => setEditForm(f => ({ ...f, hourlyRate: e.target.value.replace(/[^0-9]/g, "") }))}
                placeholder="예: 12000"
                data-testid="input-edit-seg-hourly"
              />
            </div>
            {editForm.startTime && editForm.endTime && (() => {
              const mins = calcWorkMinutes(editForm.startTime, editForm.endTime);
              const rate = parseInt(editForm.hourlyRate) || 0;
              const total = rate > 0 ? Math.floor((mins / 60) * rate) : 0;
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-md text-sm flex-wrap">
                  <span className="tabular-nums text-muted-foreground">{editForm.startTime} ~ {editForm.endTime}</span>
                  <span className="font-semibold tabular-nums">{formatMinutes(mins)}</span>
                  {rate > 0 && (
                    <>
                      <span className="text-muted-foreground">×</span>
                      <span className="tabular-nums text-muted-foreground">₩{rate.toLocaleString()}/h</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="font-bold text-primary tabular-nums">₩{total.toLocaleString()}</span>
                    </>
                  )}
                </div>
              );
            })()}
            <div className="space-y-1">
              <Label>비고</Label>
              <Input type="text" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-edit-seg-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>취소</Button>
            <Button onClick={handleSaveEdit} data-testid="button-save-edit-seg">저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 성실도 평가 다이얼로그 ── */}
      <Dialog open={isRatingOpen} onOpenChange={setIsRatingOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>성실도 평가 — {selectedStaff?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>날짜</Label>
              <Input type="date" value={ratingForm.date} onChange={e => setRatingForm(f => ({ ...f, date: e.target.value }))} data-testid="input-rating-date" />
            </div>
            <div className="space-y-1">
              <Label>평가</Label>
              <Select value={ratingForm.rating} onValueChange={v => setRatingForm(f => ({ ...f, rating: v as StaffRatingValue }))}>
                <SelectTrigger data-testid="select-rating"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RATING_CONFIG) as StaffRatingValue[]).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>비고 (선택)</Label>
              <Input type="text" value={ratingForm.note} onChange={e => setRatingForm(f => ({ ...f, note: e.target.value }))} placeholder="평가 내용 입력" data-testid="input-rating-note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRatingOpen(false)}>취소</Button>
            <Button onClick={handleSaveRating} data-testid="button-save-rating">등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
