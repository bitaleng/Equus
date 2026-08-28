import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import {
  Users, Clock, LogIn, LogOut,
  CheckCircle, ChevronDown, CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WorkDiary } from "@/components/WorkDiary";
import { useToast } from "@/hooks/use-toast";
import * as localDb from "@/lib/localDb";
import type { Staff, StaffWorkLog } from "@/lib/localDb";
import { getStaffColor } from "@/lib/staffColors";

const TZ = "Asia/Seoul";
const getKstNow = () => toZonedTime(new Date(), TZ);
const getTodayStr = () => format(getKstNow(), "yyyy-MM-dd");

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
        payType: "주간", segmentPay: 0, hourlyRate: 0,
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

  const hasClockedIn = !!clockLog?.startTime;
  const hasClockedOut = !!clockLog?.endTime;
  // 전날 출근 기록이 이어지는 야간 근무 여부
  const isNightShift = !!clockLog && clockLog.workDate !== getTodayStr();

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

                      {/* ── 출퇴근 기록 ── */}
                      <div>
                        <p className="text-sm font-semibold mb-2">출퇴근 기록</p>
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
                                <span>체류시간</span>
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
                      </div>
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
    </div>
  );
}
