import { useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const TZ = "Asia/Seoul";

// ── 커스텀 시간 선택기 (직원근무일지·근무다이어리·시스템설정 직원관리에서 공용으로 사용) ──
interface TimePickerButtonProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  testId?: string;
}
export function TimePickerButton({ value, onChange, label, testId }: TimePickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [tempH, setTempH] = useState(0);
  const [tempM, setTempM] = useState(0);

  const openPicker = () => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setTempH(h);
      setTempM(Math.round(m / 10) * 10 % 60); // 10분 단위 반올림
    } else {
      const now = toZonedTime(new Date(), TZ);
      setTempH(now.getHours());
      setTempM(Math.round(now.getMinutes() / 10) * 10 % 60);
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
