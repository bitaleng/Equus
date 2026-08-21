import { useMemo, useState } from "react";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/FilterChip";
import { cn } from "@/lib/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function datesToYmds(dates: Date[]): string[] {
  return Array.from(new Set(dates.map(toYmd))).sort();
}

function eachDayInclusive(from: Date, to: Date): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const days: Date[] = [];
  for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

const calendarClassNames = {
  months: "flex flex-col",
  caption_label: "text-sm font-semibold",
  table: "w-full border-collapse",
  head_cell: "text-muted-foreground rounded-md w-9 font-medium text-[11px]",
  cell: "h-9 w-9 text-center text-sm p-0 relative",
  day: "h-9 w-9 p-0 font-semibold rounded-lg aria-selected:opacity-100",
};

export function BusinessDayPicker({
  selectedYmds,
  onApply,
  onClear,
  onClose,
  embedded = false,
}: {
  selectedYmds: string[];
  onApply: (ymds: string[]) => void;
  onClear: () => void;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<"multiple" | "range">("multiple");
  const [picked, setPicked] = useState<Date[]>(() => selectedYmds.map(ymdToLocalDate));
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (selectedYmds.length < 2) return undefined;
    const sorted = [...selectedYmds].sort();
    const consecutive = eachDayInclusive(ymdToLocalDate(sorted[0]), ymdToLocalDate(sorted[sorted.length - 1]));
    if (consecutive.length === selectedYmds.length) {
      return { from: ymdToLocalDate(sorted[0]), to: ymdToLocalDate(sorted[sorted.length - 1]) };
    }
    return undefined;
  });

  const preview = useMemo(() => {
    if (mode === "range") {
      if (!range?.from) return [];
      return datesToYmds(eachDayInclusive(range.from, range.to || range.from));
    }
    return datesToYmds(picked);
  }, [mode, picked, range]);

  const applyDays = (dates: Date[]) => {
    const ymds = datesToYmds(dates);
    onApply(ymds);
  };

  const selectToday = () => {
    const today = new Date();
    setMode("multiple");
    setPicked([today]);
    applyDays([today]);
  };

  const selectYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setMode("multiple");
    setPicked([d]);
    applyDays([d]);
  };

  const selectLast7 = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const days = eachDayInclusive(start, end);
    setMode("range");
    setRange({ from: start, to: end });
    applyDays(days);
  };

  const selectThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = eachDayInclusive(start, now);
    setMode("range");
    setRange({ from: start, to: now });
    applyDays(days);
  };

  return (
    <div className={cn(
      "w-full flex flex-col gap-11",
      embedded ? "" : "logs-tool-panel p-4"
    )}>
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">선택 방식</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip selected={mode === "multiple"} onClick={() => setMode("multiple")} testId="chip-bd-mode-multiple">
              개별 선택
            </FilterChip>
            <FilterChip selected={mode === "range"} onClick={() => setMode("range")} testId="chip-bd-mode-range">
              연속 기간
            </FilterChip>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "multiple" ? "원하는 날을 여러 개 눌러 고르세요" : "시작일과 종료일을 눌러 구간을 고르세요"}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">바로가기</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip selected={false} onClick={selectToday} testId="chip-bd-today">오늘</FilterChip>
            <FilterChip selected={false} onClick={selectYesterday} testId="chip-bd-yesterday">어제</FilterChip>
            <FilterChip selected={false} onClick={selectLast7} testId="chip-bd-last7">최근 7일</FilterChip>
            <FilterChip selected={false} onClick={selectThisMonth} testId="chip-bd-month">이번 달</FilterChip>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="overflow-x-auto">
          {mode === "multiple" ? (
            <Calendar
              mode="multiple"
              locale={ko}
              selected={picked}
              onSelect={(days) => setPicked(days || [])}
              className="rounded-xl p-0"
              classNames={calendarClassNames}
            />
          ) : (
            <Calendar
              mode="range"
              locale={ko}
              selected={range}
              onSelect={setRange}
              className="rounded-xl p-0"
              classNames={calendarClassNames}
            />
          )}
        </div>
        {preview.length > 0 && (
          <p className="text-sm text-muted-foreground text-center">
            {`${preview[0]}${preview.length > 1 ? ` 외 ${preview.length - 1}일` : ""} · ${preview.length}개 영업일`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {onClose && (
          <Button type="button" variant="ghost" className="h-10 px-4 rounded-xl" onClick={onClose}>
            닫기
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-10 px-4 rounded-xl"
          onClick={() => {
            setPicked([]);
            setRange(undefined);
            onClear();
          }}
          data-testid="button-clear-business-day"
        >
          초기화
        </Button>
        <Button
          type="button"
          className={cn("h-10 px-5 rounded-xl font-semibold")}
          disabled={preview.length === 0}
          onClick={() => onApply(preview)}
          data-testid="button-apply-business-day"
        >
          조회
        </Button>
      </div>
    </div>
  );
}
