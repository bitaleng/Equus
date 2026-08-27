import { useState, useEffect, useMemo } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import {
  Users, Clock, LogIn, LogOut, Trash2,
  CheckCircle, Pencil, ChevronDown, CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TimePickerButton } from "@/components/TimePickerButton";
import { WorkDiary } from "@/components/WorkDiary";
import { useToast } from "@/hooks/use-toast";
import * as localDb from "@/lib/localDb";
import type { Staff, StaffWorkLog, PayType } from "@/lib/localDb";

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

function isPaySegment(log: StaffWorkLog): boolean {
  return log.workMinutes > 0 || log.segmentPay > 0;
}

// TimePickerButton은 client/src/components/TimePickerButton.tsx로 이동(직원관리 설정에서도 재사용)

// 날짜별로 구간들을 묶어 요약
interface DayGroup {
  date: string;
  segments: StaffWorkLog[];
  totalMinutes: number;
  totalPay: number;
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
    return { date, segments: segs, totalMinutes, totalPay };
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
  const [showAttendanceDetail, setShowAttendanceDetail] = useState(false);
  const [workLogs, setWorkLogs] = useState<StaffWorkLog[]>([]);

  // 오늘 근태기록 (출퇴근 버튼용) — 첫 번째 구간의 실제 출퇴근
  const [clockLog, setClockLog] = useState<StaffWorkLog | null>(null);

  // 그룹박스 펼치기/접기
  const [attendanceOpen, setAttendanceOpen] = useState(true);
  const [diaryOpen, setDiaryOpen] = useState(true);

  // 수정 다이얼로그
  const [editingLog, setEditingLog] = useState<StaffWorkLog | null>(null);
  const [editForm, setEditForm] = useState<{
    startTime: string; endTime: string; payType: PayType; hourlyRate: string; notes: string;
  }>({ startTime: "", endTime: "", payType: "주간", hourlyRate: "", notes: "" });
  const [isEditOpen, setIsEditOpen] = useState(false);

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

  const hasClockedIn = !!clockLog?.startTime;
  const hasClockedOut = !!clockLog?.endTime;
  // 전날 출근 기록이 이어지는 야간 근무 여부
  const isNightShift = !!clockLog && clockLog.workDate !== getTodayStr();

  const dayGroups = useMemo(() => groupByDate(workLogs.filter(isPaySegment)), [workLogs]);

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

  // ── 화면 ────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="border-b p-4 flex items-center gap-3 flex-wrap">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">직원근무일지</h1>
        <span className="text-sm text-muted-foreground ml-auto">{format(getKstNow(), "yyyy년 M월 d일 (EEEE)", { locale: ko })}</span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* ── 근무자별 근태기록 (접기/펼치기) ── */}
          <Collapsible open={attendanceOpen} onOpenChange={setAttendanceOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover-elevate" data-testid="button-toggle-attendance">
                  <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="h-4 w-4" />
                      근무자별 근태기록
                      {showAttendanceDetail && selectedStaff && (
                        <Badge variant="outline" className="text-xs" style={{ borderColor: selectedColor + "60", color: selectedColor }}>
                          {selectedStaff.name}
                        </Badge>
                      )}
                      {isNightShift && showAttendanceDetail && (
                        <Badge variant="outline" className="text-xs border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                          야간 근무 중 ({clockLog!.workDate} 출근)
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {showAttendanceDetail && (
                        <span className="font-mono text-lg tabular-nums text-muted-foreground">
                          {format(currentTime, "HH:mm:ss")}
                        </span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${attendanceOpen ? "" : "-rotate-90"}`} />
                    </div>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4">
                  {/* 직원 선택 버튼 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground shrink-0">근무자 :</span>
                    {staffList.map((s, idx) => {
                      const color = getStaffColor(idx);
                      const isSel = selectedStaffId === s.id;
                      return (
                        <button
                          key={s.id}
                          data-testid={`button-staff-${s.id}`}
                          onClick={() => setSelectedStaffId(s.id)}
                          style={{
                            backgroundColor: isSel ? color : undefined,
                            borderColor: isSel ? color : color + "40",
                            color: isSel ? "white" : undefined,
                          }}
                          className="flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full border-2 text-sm font-medium hover-elevate cursor-pointer transition-colors"
                        >
                          {s.photo ? (
                            <img src={s.photo} alt={s.name} className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <span
                              style={{ backgroundColor: isSel ? "rgba(255,255,255,0.25)" : color + "20", color: isSel ? "white" : color }}
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            >
                              {s.name.charAt(0)}
                            </span>
                          )}
                          {s.name}
                        </button>
                      );
                    })}
                    <Button
                      size="sm"
                      disabled={!selectedStaffId}
                      onClick={() => setShowAttendanceDetail(true)}
                      data-testid="button-show-attendance-detail"
                      className="ml-1"
                    >
                      근태기록 보기
                    </Button>
                    {showAttendanceDetail && (
                      <Button size="sm" variant="ghost" onClick={() => { setShowAttendanceDetail(false); setSelectedStaffId(""); }} data-testid="button-hide-attendance-detail">
                        닫기
                      </Button>
                    )}
                  </div>

                  {!showAttendanceDetail && (
                    <p className="text-xs text-muted-foreground">근무자를 선택하고 "근태기록 보기"를 누르면 출퇴근 기록이 표시됩니다.</p>
                  )}

                  {showAttendanceDetail && selectedStaff && (
                    <div className="pt-3 border-t space-y-4">
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
                      <p className="text-xs text-muted-foreground text-center">근태기록 전용 — 급여 계산에 영향 없음</p>

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

                      {/* ── 근무기록 / 출퇴근 탭 ── */}
                      <Tabs defaultValue="logs">
                        <TabsList>
                          <TabsTrigger value="logs">근무 기록</TabsTrigger>
                          <TabsTrigger value="attendance" data-testid="tab-attendance">출퇴근 기록</TabsTrigger>
                        </TabsList>

                        <TabsContent value="logs" className="mt-3">
                          {dayGroups.length === 0 ? (
                            <div className="text-center py-12 space-y-2">
                              <p className="text-muted-foreground text-sm">근무 기록이 없습니다.</p>
                              <p className="text-xs text-muted-foreground">파트타임 근무·급여는 근무다이어리에서 확인하세요. (이 탭은 예전 방식 구간 기록용)</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {dayGroups.map(group => (
                                <div key={group.date} className="border rounded-md overflow-hidden">
                                  <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 border-b flex-wrap">
                                    <span className="font-semibold text-sm tabular-nums">{group.date}</span>
                                    <span className="text-sm font-bold text-primary tabular-nums ml-auto">
                                      {group.totalPay > 0
                                        ? `${formatMinutes(group.totalMinutes)} · ₩${group.totalPay.toLocaleString()}`
                                        : formatMinutes(group.totalMinutes)}
                                    </span>
                                  </div>
                                  {group.segments.map((seg, i) => {
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
                              ))}
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
                      </Tabs>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ── 근무다이어리 (접기/펼치기, 근무자 선택 불필요) ── */}
          <Collapsible open={diaryOpen} onOpenChange={setDiaryOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover-elevate" data-testid="button-toggle-diary">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      근무다이어리
                      <span className="text-xs font-normal text-muted-foreground">(파트타임 스케줄·자동 급여계산)</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${diaryOpen ? "" : "-rotate-90"}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <WorkDiary staffList={staffList} />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
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
    </div>
  );
}
