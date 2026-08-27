import { useEffect, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import * as localDb from "@/lib/localDb";

const TZ = "Asia/Seoul";

export interface PaydayAlertState {
  alerting: boolean;
  staffId: string;
  staffName: string;
  time: string;
}

const IDLE_STATE: PaydayAlertState = { alerting: false, staffId: "", staffName: "", time: "" };

/** 월요일 시작 기준 주의 시작일(YYYY-MM-DD) — StaffLogPage/WorkDiary의 주급 집계 기준과 동일 */
function toWeekStart(d: Date): string {
  const day = d.getDay(); // 0=일 ~ 6=토
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

/**
 * 근무자별 주급지급일 30분 전을 감지 — 아직 그 주 지급완료 처리가 안 됐으면 alerting=true.
 * 1분 간격으로 재확인한다.
 */
export function usePaydayAlert(): PaydayAlertState {
  const [state, setState] = useState<PaydayAlertState>(IDLE_STATE);

  useEffect(() => {
    const check = () => {
      try {
        const now = toZonedTime(new Date(), TZ);
        const paydays = localDb.getAllStaffPaydays().filter(p => p.isEnabled);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();

        for (const p of paydays) {
          if (p.dayOfWeek !== now.getDay()) continue;
          const [h, m] = p.time.split(":").map(Number);
          const paydayMinutes = (h || 0) * 60 + (m || 0);
          if (nowMinutes >= paydayMinutes - 30 && nowMinutes < paydayMinutes) {
            const weekStart = toWeekStart(now);
            if (!localDb.isPaydayCompleted(p.staffId, weekStart)) {
              const staff = localDb.getStaffById(p.staffId);
              setState({ alerting: true, staffId: p.staffId, staffName: staff?.name ?? "", time: p.time });
              return;
            }
          }
        }
        setState(s => (s.alerting ? IDLE_STATE : s));
      } catch {
        // DB 초기화 전 등 — 조용히 무시하고 다음 주기에 재시도
      }
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  return state;
}
