import { useState, useEffect, useMemo } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { Users, Clock, Plus, Trash2, Star, AlertTriangle, CheckCircle, TrendingDown, Pencil } from "lucide-react";
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
  if (endTotal <= startTotal) endTotal += 24 * 60;
  return Math.max(0, endTotal - startTotal - (breakMin || 0));
}

function calcDailyPay(workMinutes: number, hourlyPay: number): number {
  return Math.floor((workMinutes / 60) * hourlyPay);
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

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [workLogs, setWorkLogs] = useState<StaffWorkLog[]>([]);
  const [ratings, setRatings] = useState<StaffRating[]>([]);
  const [todayLog, setTodayLog] = useState<StaffWorkLog | null>(null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [todayNotes, setTodayNotes] = useState("");

  const [isEditLogOpen, setIsEditLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<StaffWorkLog | null>(null);
  const [editForm, setEditForm] = useState({ startTime: "", endTime: "", breakMinutes: 0, notes: "" });

  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [ratingForm, setRatingForm] = useState<{ rating: StaffRatingValue; date: string; note: string }>({
    rating: "좋음", date: today, note: "",
  });

  const selectedStaff = staffList.find(s => s.id === selectedStaffId) ?? null;

  useEffect(() => {
    const list = localDb.getAllStaff(true);
    setStaffList(list);
    if (list.length > 0) setSelectedStaffId(list[0].id);
  }, []);

  const reloadStaffData = (staffId: string) => {
    const logs = localDb.getWorkLogs(staffId);
    setWorkLogs(logs);
    const todLog = localDb.getTodayWorkLog(staffId, today);
    setTodayLog(todLog);
    if (todLog) {
      setStartTime(todLog.startTime || "");
      setEndTime(todLog.endTime || "");
      setBreakMinutes(todLog.breakMinutes || 0);
      setTodayNotes(todLog.notes || "");
    } else {
      setStartTime(""); setEndTime(""); setBreakMinutes(0); setTodayNotes("");
    }
    setRatings(localDb.getStaffRatings(staffId));
  };

  useEffect(() => {
    if (!selectedStaffId) return;
    reloadStaffData(selectedStaffId);
  }, [selectedStaffId]);

  const todayWorkMinutes = calcWorkMinutes(startTime, endTime, breakMinutes);
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

  const handleSaveToday = () => {
    if (!selectedStaffId) return;
    if (!startTime) { toast({ title: "출근 시간을 입력해주세요.", variant: "destructive" }); return; }
    const workMinutes = calcWorkMinutes(startTime, endTime, breakMinutes);
    const dailyPay = selectedStaff ? calcDailyPay(workMinutes, selectedStaff.hourlyPay) : 0;
    if (todayLog) {
      localDb.updateWorkLog(todayLog.id, { startTime, endTime, breakMinutes, workMinutes, dailyPay, notes: todayNotes });
      toast({ title: "오늘 근무 기록이 수정되었습니다." });
    } else {
      const id = localDb.createWorkLog({ staffId: selectedStaffId, workDate: today, startTime, endTime, breakMinutes, workMinutes, dailyPay, notes: todayNotes });
      if (!id) { toast({ title: "저장 실패", variant: "destructive" }); return; }
      toast({ title: "오늘 근무 기록이 저장되었습니다." });
    }
    reloadStaffData(selectedStaffId);
  };

  const handleDeleteLog = (id: string) => {
    if (!confirm("이 근무 기록을 삭제하시겠습니까?")) return;
    localDb.deleteWorkLog(id);
    reloadStaffData(selectedStaffId);
    toast({ title: "근무 기록이 삭제되었습니다." });
  };

  const handleOpenEditLog = (log: StaffWorkLog) => {
    setEditingLog(log);
    setEditForm({ startTime: log.startTime, endTime: log.endTime, breakMinutes: log.breakMinutes, notes: log.notes });
    setIsEditLogOpen(true);
  };

  const handleSaveEditLog = () => {
    if (!editingLog) return;
    const workMinutes = calcWorkMinutes(editForm.startTime, editForm.endTime, editForm.breakMinutes);
    const dailyPay = selectedStaff ? calcDailyPay(workMinutes, selectedStaff.hourlyPay) : 0;
    localDb.updateWorkLog(editingLog.id, { ...editForm, workMinutes, dailyPay });
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

  const editWorkMinutes = calcWorkMinutes(editForm.startTime, editForm.endTime, editForm.breakMinutes);
  const editDailyPay = selectedStaff ? calcDailyPay(editWorkMinutes, selectedStaff.hourlyPay) : 0;

  if (staffList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Users className="h-12 w-12" />
        <p className="text-lg font-medium">등록된 직원이 없습니다</p>
        <p className="text-sm">설정 → 직원관리에서 직원을 먼저 추가해주세요.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">직원근무일지</h1>
          <span className="text-sm text-muted-foreground">
            {format(getKstNow(), "yyyy년 M월 d일 (EEEE)", { locale: ko })}
          </span>
        </div>
        <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
          <SelectTrigger className="w-40" data-testid="select-staff">
            <SelectValue placeholder="직원 선택" />
          </SelectTrigger>
          <SelectContent>
            {staffList.map(s => (
              <SelectItem key={s.id} value={s.id} data-testid={`staff-item-${s.id}`}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Clock className="h-4 w-4" />
                오늘 근무 — {selectedStaff?.name}
                {todayLog && (
                  <Badge variant="outline" className="text-xs font-normal">저장됨</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="start-time">출근 시간</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    data-testid="input-start-time"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end-time">퇴근 시간</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    data-testid="input-end-time"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="break-minutes">휴식 (분)</Label>
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
                  <Label>계산 결과</Label>
                  <div className="flex items-center gap-2 h-9 text-sm">
                    <span className="text-muted-foreground">근무</span>
                    <span className="font-medium">{formatMinutes(todayWorkMinutes)}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="font-semibold text-primary">₩{todayPay.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="today-notes">비고</Label>
                <Input
                  id="today-notes"
                  type="text"
                  value={todayNotes}
                  onChange={e => setTodayNotes(e.target.value)}
                  placeholder="특이사항 입력"
                  data-testid="input-today-notes"
                />
              </div>
              <Button onClick={handleSaveToday} data-testid="button-save-today">
                {todayLog ? "오늘 근무 수정" : "오늘 근무 저장"}
              </Button>
            </CardContent>
          </Card>

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
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">출근</th>
                        <th className="text-left px-3 py-2 font-medium whitespace-nowrap">퇴근</th>
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
                          <td className="px-3 py-2 tabular-nums">{log.startTime || "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{log.endTime || "—"}</td>
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

      <Dialog open={isEditLogOpen} onOpenChange={setIsEditLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>근무 기록 수정 — {editingLog?.workDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>출근 시간</Label>
                <Input
                  type="time"
                  value={editForm.startTime}
                  onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))}
                  data-testid="input-edit-start"
                />
              </div>
              <div className="space-y-1">
                <Label>퇴근 시간</Label>
                <Input
                  type="time"
                  value={editForm.endTime}
                  onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))}
                  data-testid="input-edit-end"
                />
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
            <div className="text-sm text-muted-foreground">
              근무: {formatMinutes(editWorkMinutes)} | 일급: ₩{editDailyPay.toLocaleString()}
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
