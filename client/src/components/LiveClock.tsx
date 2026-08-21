import { useState, useEffect } from "react";

export function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateWithWeekday = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  return (
    <div className="inline-flex flex-col items-start justify-center gap-0.5 rounded-xl border border-border/70 bg-card/80 px-3 py-1.5 shadow-2xs backdrop-blur-sm shrink-0 dark:bg-transparent dark:shadow-none dark:backdrop-blur-none dark:border-gray-400">
      <span className="text-xs font-medium tracking-tight text-muted-foreground tabular-nums whitespace-nowrap leading-none dark:text-gray-400">
        {dateWithWeekday}
      </span>
      <span className="text-[22px] font-semibold leading-none tracking-tight text-primary tabular-nums whitespace-nowrap dark:text-sky-300">
        {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
    </div>
  );
}
