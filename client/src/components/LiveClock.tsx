import { useState, useEffect } from "react";

export function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="tabular-nums">
      <span className="text-base font-bold text-muted-foreground">
        {now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
      </span>
      <span className="text-[27px] font-semibold text-blue-600 dark:text-blue-400 ml-2">
        {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
      </span>
    </p>
  );
}
