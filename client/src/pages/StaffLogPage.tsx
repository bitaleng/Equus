import { useState, useEffect, useMemo, useRef } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { Users, Clock, LogIn, LogOut, Plus, Trash2, Star, AlertTriangle, CheckCircle, TrendingDown, Pencil, Coffee, ChevronLeft, Briefcase } from "lucide-react";
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
import type { Staff, StaffWorkLog, StaffRating, StaffRatingValue } from "@/lib/localDb";

const TZ = "Asia/Seoul";
const getKstNow = () => toZonedTime(new Date(), TZ);
const getTodayStr = () => format(getKstNow(), "yyyy-MM-dd");

const STAFF_COLORS = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#06B6D4",
  "#EC4899",
  "#F97316",
  "#6366F1",
  "#14B8A6",
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

function calcWorkMinutes(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startTotal = sh * 60 + sm;
  let endTotal = eh * 60 + em;
  if (endTotal < startTotal) endTotal += 24 * 60;
  return Math.max(0, endTotal - startTotal - (breakMin || 0));
}

function roundUpTo10Min(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 10) * 10;
}

function calcDailyPay(workMinutes: number, hourlyPay: number): number {
  return Math.floor((workMinutes / 60) * hourlyPay);
}

function useCurrentTime() {
  const [now, setNow] = useState(getKstNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(getKstNow()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const RATING_CONFIG: Record<StaffRatingValue, { color: string; icon: React.ElementType }> = {
  "훌륭": { color: "border-blue-500/40 text-blue-700 dark:text-blue-400 bg-blue-500/10", icon: Star },
  "좋음":  { color: "border-green-500/40 text-green-700 dark:text-green-400 bg-green-500/10", icon: CheckCircle },
  "태만": { color: "border-orange-500/40 text-orange-700 dark:text-orange-400 bg-orange-500/10", icon: TrendingDown },
  "경고": { color: "border-red-500/40 text-red-700 dark:text-red-400 bg-red-500/10", icon: AlertTriangle },
};

export default function StaffLogPage() {
  const { toast } = useToast();
  const today = getTodayStr();
  const currentTime = useCurrentTime();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [workLogs, setWorkLogs] = useState<StaffWorkLog[]>([]);
  const [ratings, setRatings] = useState<StaffRating[]>([]);
  const [todayLog, setTodayLog] = useState<StaffWorkLog | null>(null);

  const [breakMinutes, setBreakMinutes] = useState(0);
  const [todayNotes, setTodayNotes] = useState("");

  // 합의 근무시간 (급여 계산용) — 실제 출퇴근과 별개
  const [agreedStart, setAgreedStart] = useState("");
  const [agreedEnd, setAgreedEnd] = useState("");

  const [isEditLogOpen, setIsEditLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<StaffWorkLog | null>(null);
  const [editForm, setEditForm] = useState({
    startTime: "", endTime: "", breakMinutes: 0, notes: "",
    agreedStartTime: "", agreedEndTime: "",
  });

  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [ratingForm, setRatingForm] = useState<{ rating: StaffRatingValue; date: string; note: string }>({
    rating: "좋음", date: today, note: "",
  });

  const selectedStaff = staffList.find(s => s.id === selectedStaffId) ?? null;
  const selectedStaffIndex = staffList.findIndex(s => s.id === selectedStaffId);
  const selectedColor = selectedStaffIndex >= 0 ? getStaffColor(selectedStaffIndex) : "#3B82F6";

  useEffect(() => {
    const list = localDb.getAllStaff(true);
    setStaffList(list);
  }, []);

  const reloadStaffData = (staffId: string) => {
    const logs = localDb.getWorkLogs(staffId);
    setWorkLogs(logs);
    const todLog = localDb.getTodayWorkLog(staffId, today);
    setTodayLog(todLog);
    if (todLog) {
      setBreakMinutes(todLog.breakMinutes || 0);
      setTodayNotes(todLog.notes || "");
      setAgreedStart(todLog.agreedStartTime || "");
      setAgreedEnd(todLog.agreedEndTime || "");
    } else {
      setBreakMinutes(0);
      setTodayNotes("");
      setAgreedStart("");
      setAgreedEnd("");
    }
    setRatings(localDb.getStaffRatings(staffId));
  };

  useEffect(() => {
    if (!selectedStaffId) return;
    reloadStaffData(selectedStaffId);
  }, [selectedStaffId]);

  const startTime = todayLog?.startTime || "";
  const endTime = todayLog?.endTime || "";

  // 급여 계산은 합의 근무시간 기준 (실제 출퇴근 아님)
  const agreedWorkMinutes = roundUpTo10Min(calcWorkMinutes(agreedStart, agreedEnd, breakMinutes));
  const todayWorkMinutes = agreedWorkMinutes;
  const todayPay = selectedStaff ? calcDailyPay(todayWorkMinutes, selectedStaff.hourlyPay) : 0;

  const { weekMinutes, weekPay, monthMinutes, monthPay } = useMemo(() => {
    const now = getKstNow();
    const wStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const wEnd   = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const mStart = format(startOfMonth(now), "yyyy-MM-dd");
    const mEnd   = format(endOfMonth(now), "yyyy-MM-dd");
    let wMin = 0, wPay = 0, mMin = 0, mPay = 0;
    for (const log of workLogs) {
      if (log.workDate >= wStart && log.workDate <= wEnd) { wMin += log.workMinutes; wPay += log.dailyPay; }
      if (log.workDate >= mStart && log.workDate <= mEnd) { mMin += log.workMinutes; mPay += log.dailyPay; }
    }
    return { weekMinutes: wMin, weekPay: wPay, monthMinutes: mMin, monthPay: mPay };
  }, [workLogs]);

  const handleClockIn = () => {
    if (!selectedStaffId) return;
    const nowStr = format(getKstNow(), "HH:mm");
    if (todayLog) {
      localDb.updateWorkLog(todayLog.id, { startTime: nowStr });
    } else {
      localDb.createWorkLog({
        staffId: selectedStaffId,
        workDate: today,
        startTime: nowStr,
        endTime: "",
        breakMinutes: 0,
        workMinutes: 0,
        dailyPay: 0,
        notes: "",
        agreedStartTime: "",
        agreedEndTime: "",
      });
    }
    reloadStaffData(selectedStaffId);
    toast({ title: `출근 기록 완료`, description: `${nowStr} 기록되었습니다. (근태기록용)` });
  };

  const handleClockOut = () => {
    if (!selectedStaffId || !todayLog || !startTime) return;
    const nowStr = format(getKstNow(), "HH:mm");
    // 실제 퇴근 시간만 기록 — 급여는 합의 근무시간에서 계산
    localDb.updateWorkLog(todayLog.id, { endTime: nowStr });
    reloadStaffData(selectedStaffId);
    toast({ title: `퇴근 기록 완료`, description: `${nowStr} 기록되었습니다. (근태기록용)` });
  };

  const handleSaveAgreed = () => {
    if (!selectedStaffId) return;
    if (!agreedStart || !agreedEnd) {
      toast({ title: "시작 시간과 종료 시간을 모두 입력해주세요.", variant: "destructive" });
      return;
    }
    const workMinutes = roundUpTo10Min(calcWorkMinutes(agreedStart, agreedEnd, breakMinutes));
    const dailyPay = selectedStaff ? calcDailyPay(workMinutes, selectedStaff.hourlyPay) : 0;

    if (todayLog) {
      localDb.updateWorkLog(todayLog.id, {
        agreedStartTime: agreedStart,
        agreedEndTime: agreedEnd,
        breakMinutes,
        workMinutes,
        dailyPay,
        notes: todayNotes,
      });
    } else {
      localDb.createWorkLog({
        staffId: selectedStaffId,
        workDate: today,
        startTime: "",
        endTime: "",
        breakMinutes,
        workMinutes,
        dailyPay,
        notes: todayNotes,
        agreedStartTime: agreedStart,
        agreedEndTime: agreedEnd,
      });
    }
    reloadStaffData(selectedStaffId);
    toast({ title: "근무시간이 저장되었습니다.", description: `${agreedStart}~${agreedEnd} (${formatMinutes(workMinutes)}) · ₩${dailyPay.toLocaleString()}` });
  };

  const handleDeleteLog = (id: string) => {
    if (!confirm("이 근무 기록을 삭제하시겠습니까?")) return;
    localDb.deleteWorkLog(id);
    reloadStaffData(selectedStaffId);
    toast({ title: "근무 기록이 삭제되었습니다." });
  };

  const handleOpenEditLog = (log: StaffWorkLog) => {
    setEditingLog(log);
    setEditForm({
      startTime: log.startTime,
      endTime: log.endTime,
      breakMinutes: log.breakMinutes,
      notes: log.notes,
      agreedStartTime: log.agreedStartTime || "",
      agreedEndTime: log.agreedEndTime || "",
    });
    setIsEditLogOpen(true);
  };

  const handleSaveEditLog = () => {
    if (!editingLog) return;
    // 급여는 합의 근무시간으로 계산
    const workMinutes = roundUpTo10Min(calcWorkMinutes(editForm.agreedStartTime, editForm.agreedEndTime, editForm.breakMinutes));
    const dailyPay = selectedStaff ? calcDailyPay(workMinutes, selectedStaff.hourlyPay) : 0;
    localDb.updateWorkLog(editingLog.id, {
      startTime: editForm.startTime,
      endTime: editForm.endTime,
      breakMinutes: editForm.breakMinutes,
      notes: editForm.notes,
      agreedStartTime: editForm.agreedStartTime,
      agreedEndTime: editForm.agreedEndTime,
      workMinutes,
      dailyPay,
    });
    reloadStaffData(selectedStaffId);
    setIsEditLogOpen(false);
    toast({ title: "근무 기록이 수정되었습니다." });
  };

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

  // 수정 다이얼로그에서도 합의 근무시간으로 계산
  const editWorkMinutes = roundUpTo10Min(calcWorkMinutes(editForm.agreedStartTime, editForm.agreedEndTime, editForm.breakMinutes));
  const editDailyPay = selectedStaff ? calcDailyPay(editWorkMinutes, selectedStaff.hourlyPay) : 0;

  const hasClockedIn = !!startTime;
  const hasClockedOut = !!endTime;

  // ──────────────────────────────────────────────
  // 직원 없음
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

  // ──────────────────────────────────────────────
  // 직원 선택 화면
  // ──────────────────────────────────────────────
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
              const initial = s.name.charAt(0);
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
                    <img
                      src={s.photo}
                      alt={s.name}
                      className="w-14 h-14 rounded-full object-cover border-2"
                      style={{ borderColor: isHovered ? "rgba(255,255,255,0.4)" : color + "40" }}
                    />
                  ) : (
                    <div
                      style={{
                        backgroundColor: isHovered ? "rgba(255,255,255,0.25)" : color + "20",
                        color: isHovered ? "white" : color,
                        transition: "background-color 0.18s ease, color 0.18s ease",
                      }}
                      className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold"
                    >
                      {initial}
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      style={{
                        color: isHovered ? "white" : undefined,
                        transition: "color 0.18s ease",
                      }}
                      className="text-base font-semibold text-foreground"
                    >
                      {s.name}
                    </span>
                    {s.position && (
                      <span
                        style={{
                          color: isHovered ? "rgba(255,255,255,0.75)" : undefined,
                          transition: "color 0.18s ease",
                        }}
                        className="text-xs text-muted-foreground"
                      >
                        {s.position}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // 직원 상세 — 근무일지
  // ──────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="border-b p-4 flex items-center gap-3 flex-wrap">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setSelectedStaffId("")}
          data-testid="button-back-to-picker"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        {selectedStaff?.photo ? (
          <img
            src={selectedStaff.photo}
            alt={selectedStaff.name}
            className="w-8 h-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: selectedColor }}
          >
            {selectedStaff?.name.charAt(0)}
          </div>
        )}
        <h1 className="text-xl font-semibold">{selectedStaff?.name}</h1>
        {selectedStaff?.position && (
          <span className="text-sm text-muted-foreground">{selectedStaff.position}</span>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {format(getKstNow(), "yyyy년 M월 d일 (EEEE)", { locale: ko })}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* 타임카드 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  오늘 근무
                </div>
                <span className="font-mono text-lg tabular-nums text-muted-foreground">
                  {format(currentTime, "HH:mm:ss")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* 근태기록 (출퇴근 버튼) */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">근태기록</p>
                <div className="grid grid-cols-2 gap-4">
                  {/* 출근 */}
                  <div>
                    {hasClockedIn ? (
                      <div className="w-full flex flex-col items-center gap-1 py-4 border-2 border-green-500/40 bg-green-500/5 rounded-lg">
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        <span className="text-xs text-muted-foreground">실제 출근</span>
                        <span className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">
                          {startTime}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={handleClockIn}
                        data-testid="button-clock-in"
                        className="w-full flex flex-col items-center gap-2 py-5 rounded-lg border-2 border-green-500 bg-green-500 hover-elevate active-elevate-2 text-white cursor-pointer"
                      >
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
                        <span className="text-xl font-bold tabular-nums text-blue-700 dark:text-blue-400">
                          {endTime}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={handleClockOut}
                        disabled={!hasClockedIn}
                        data-testid="button-clock-out"
                        className={`w-full flex flex-col items-center gap-2 py-5 rounded-lg border-2 ${
                          hasClockedIn
                            ? "border-red-500 bg-red-500 hover-elevate active-elevate-2 text-white cursor-pointer"
                            : "border-muted bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50"
                        }`}
                      >
                        <LogOut className="h-7 w-7" />
                        <span className="text-base font-bold">퇴근</span>
                        <span className="text-xs opacity-80">
                          {hasClockedIn ? "버튼을 눌러 퇴근 기록" : "출근 후 활성화"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 text-center">
                  근태기록 전용 — 급여 계산에 영향 없음
                </p>
              </div>

              {/* 구분선 */}
              <div className="border-t" />

              {/* 급여 적용 근무시간 (합의) */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">급여 적용 근무시간</span>
                  <span className="text-xs text-muted-foreground">(업주·직원 합의)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="agreed-start" className="text-sm">시작 시간</Label>
                    <Input
                      id="agreed-start"
                      type="time"
                      value={agreedStart}
                      onChange={e => setAgreedStart(e.target.value)}
                      data-testid="input-agreed-start"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="agreed-end" className="text-sm">종료 시간</Label>
                    <Input
                      id="agreed-end"
                      type="time"
                      value={agreedEnd}
                      onChange={e => setAgreedEnd(e.target.value)}
                      data-testid="input-agreed-end"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="break-minutes" className="flex items-center gap-1.5 text-sm">
                      <Coffee className="h-3.5 w-3.5" />
                      휴식 시간 (분)
                    </Label>
                    <Input
                      id="break-minutes"
                      type="text"
                      value={breakMinutes || ""}
                      onChange={e => setBreakMinutes(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      data-testid="input-break-minutes"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="today-notes" className="text-sm">비고</Label>
                    <Input
                      id="today-notes"
                      type="text"
                      value={todayNotes}
                      onChange={e => setTodayNotes(e.target.value)}
                      placeholder="특이사항 입력"
                      data-testid="input-today-notes"
                    />
                  </div>
                </div>

                {agreedStart && agreedEnd && (
                  <div className="flex items-center gap-3 py-2.5 px-3 bg-primary/5 border border-primary/20 rounded-md text-sm">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <span>
                      <span className="font-semibold">{agreedStart} ~ {agreedEnd}</span>
                      <span className="text-muted-foreground mx-2">|</span>
                      <span className="font-semibold">{formatMinutes(agreedWorkMinutes)}</span>
                      <span className="text-muted-foreground mx-2">|</span>
                      <span className="font-bold text-primary">₩{todayPay.toLocaleString()}</span>
                    </span>
                  </div>
                )}

                <Button size="sm" onClick={handleSaveAgreed} data-testid="button-save-agreed">
                  근무시간 저장
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 주간 / 월간 */}
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

          {/* 근무 기록 / 성실도 탭 */}
          <Tabs defaultValue="logs">
            <TabsList>
              <TabsTrigger value="logs">근무 기록</TabsTrigger>
              <TabsTrigger value="ratings">성실도 평가</TabsTrigger>
            </TabsList>

            <TabsContent value="logs" className="mt-3">
              {workLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">근무 기록이 없습니다.</p>
              ) : (
                <div className="border rounded-md overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">날짜</th>
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">실제출근</th>
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">실제퇴근</th>
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">급여적용</th>
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">근무</th>
                        <th className="text-right px-3 py-2 font-medium whitespace-nowrap">일급</th>
                        <th className="text-left px-3 py-2 font-medium">비고</th>
                        <th className="px-3 py-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {workLogs.map((log, i) => (
                        <tr key={log.id} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">{log.workDate}</td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{log.startTime || "—"}</td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{log.endTime || "—"}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {log.agreedStartTime && log.agreedEndTime
                              ? <span className="font-medium">{log.agreedStartTime}~{log.agreedEndTime}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatMinutes(log.workMinutes)}</td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">₩{log.dailyPay.toLocaleString()}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-28 truncate">{log.notes}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" onClick={() => handleOpenEditLog(log)} data-testid={`button-edit-log-${log.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDeleteLog(log.id)} data-testid={`button-delete-log-${log.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="ratings" className="mt-3">
              <div className="flex justify-end mb-3">
                <Button
                  size="sm"
                  onClick={() => { setRatingForm({ rating: "좋음", date: today, note: "" }); setIsRatingOpen(true); }}
                  data-testid="button-add-rating"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  평가 추가
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

      {/* 관리자용 수정 다이얼로그 */}
      <Dialog open={isEditLogOpen} onOpenChange={setIsEditLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>근무 기록 수정 — {editingLog?.workDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-md text-xs text-orange-700 dark:text-orange-400">
              관리자 전용 — 시간을 직접 수정할 수 있습니다.
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">근태기록 (참고용)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>실제 출근 시간</Label>
                  <Input
                    type="time"
                    value={editForm.startTime}
                    onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))}
                    data-testid="input-edit-start"
                  />
                </div>
                <div className="space-y-1">
                  <Label>실제 퇴근 시간</Label>
                  <Input
                    type="time"
                    value={editForm.endTime}
                    onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))}
                    data-testid="input-edit-end"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">급여 적용 근무시간 (합의)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>시작 시간</Label>
                  <Input
                    type="time"
                    value={editForm.agreedStartTime}
                    onChange={e => setEditForm(f => ({ ...f, agreedStartTime: e.target.value }))}
                    data-testid="input-edit-agreed-start"
                  />
                </div>
                <div className="space-y-1">
                  <Label>종료 시간</Label>
                  <Input
                    type="time"
                    value={editForm.agreedEndTime}
                    onChange={e => setEditForm(f => ({ ...f, agreedEndTime: e.target.value }))}
                    data-testid="input-edit-agreed-end"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>휴식 시간 (분)</Label>
              <Input
                type="text"
                value={editForm.breakMinutes || ""}
                onChange={e => setEditForm(f => ({ ...f, breakMinutes: parseInt(e.target.value) || 0 }))}
                data-testid="input-edit-break"
              />
            </div>
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
              급여 적용: {formatMinutes(editWorkMinutes)} | 일급: ₩{editDailyPay.toLocaleString()}
            </div>
            <div className="space-y-1">
              <Label>비고</Label>
              <Input
                type="text"
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditLogOpen(false)}>취소</Button>
            <Button onClick={handleSaveEditLog} data-testid="button-save-edit-log">저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRatingOpen} onOpenChange={setIsRatingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>성실도 평가 — {selectedStaff?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>날짜</Label>
              <Input
                type="date"
                value={ratingForm.date}
                onChange={e => setRatingForm(f => ({ ...f, date: e.target.value }))}
                data-testid="input-rating-date"
              />
            </div>
            <div className="space-y-1">
              <Label>평가</Label>
              <Select value={ratingForm.rating} onValueChange={v => setRatingForm(f => ({ ...f, rating: v as StaffRatingValue }))}>
                <SelectTrigger data-testid="select-rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RATING_CONFIG) as StaffRatingValue[]).map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>비고 (선택)</Label>
              <Input
                type="text"
                value={ratingForm.note}
                onChange={e => setRatingForm(f => ({ ...f, note: e.target.value }))}
                placeholder="평가 내용 입력"
                data-testid="input-rating-note"
              />
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
