import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterChip({
  selected,
  onClick,
  children,
  testId,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "inline-flex items-center justify-center h-11 min-w-[3.25rem] px-4 rounded-2xl text-sm font-semibold border-2 transition-all active:scale-[0.98] touch-manipulation",
        selected
          ? "bg-primary text-primary-foreground border-primary shadow-md"
          : "bg-card text-foreground border-border hover:border-primary/60 hover:bg-accent",
        className
      )}
    >
      {children}
    </button>
  );
}
