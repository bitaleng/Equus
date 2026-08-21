import type { ComponentType, MouseEvent, TouchEvent } from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const EDGE_POSITION: Record<ResizeEdge, string> = {
  n: "top-2 left-1/2 -translate-x-1/2",
  s: "bottom-2 left-1/2 -translate-x-1/2",
  e: "right-2 top-1/2 -translate-y-1/2",
  w: "left-2 top-1/2 -translate-y-1/2",
  nw: "top-2 left-2",
  ne: "top-2 right-2",
  sw: "bottom-2 left-2",
  se: "bottom-2 right-2",
};

const EDGE_ICON: Record<ResizeEdge, ComponentType<{ className?: string }>> = {
  n: ChevronUp,
  s: ChevronDown,
  e: ChevronRight,
  w: ChevronLeft,
  nw: ArrowUpLeft,
  ne: ArrowUpRight,
  sw: ArrowDownLeft,
  se: ArrowDownRight,
};

export function ResizeEdgeGrip({
  edge,
  onDown,
  className,
  testId,
  dataWorkspaceResize,
  tone = "default",
}: {
  edge: ResizeEdge;
  onDown: (edge: ResizeEdge, e: MouseEvent | TouchEvent) => void;
  className?: string;
  testId?: string;
  /** Home.tsx workspace resize hit-test attribute */
  dataWorkspaceResize?: boolean;
  /** Glass workspace uses borderless translucent grips */
  tone?: "default" | "glass";
}) {
  const Icon = EDGE_ICON[edge];

  return (
    <button
      type="button"
      aria-label="창 크기 조절"
      {...(dataWorkspaceResize ? { "data-workspace-resize": "true" } : {})}
      className={cn(
        "absolute z-[70] flex h-5 w-5 items-center justify-center rounded-full touch-none select-none transition-colors",
        tone === "glass"
          ? "border-0 bg-white/40 text-white/80 shadow-sm hover:bg-white/55 hover:text-white active:bg-white/65"
          : "text-muted-foreground/70 hover:text-foreground bg-background/80 hover:bg-background border border-border/50 shadow-none active:bg-muted active:text-foreground",
        EDGE_POSITION[edge],
        className
      )}
      onMouseDown={(e) => onDown(edge, e)}
      onTouchStart={(e) => onDown(edge, e)}
      data-testid={testId}
    >
      <Icon className="h-2.5 w-2.5" strokeWidth={2.25} />
    </button>
  );
}

export function DockResizeGrip({
  side,
  onDown,
  testId,
  dataWorkspaceResize,
  tone = "default",
}: {
  side: "left" | "right";
  onDown: (e: MouseEvent | TouchEvent) => void;
  testId?: string;
  dataWorkspaceResize?: boolean;
  tone?: "default" | "glass";
}) {
  return (
    <button
      type="button"
      aria-label="창 너비 조절"
      {...(dataWorkspaceResize ? { "data-workspace-resize": "true" } : {})}
      className={cn(
        "absolute top-1/2 z-[70] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full touch-none select-none transition-colors",
        tone === "glass"
          ? "border-0 bg-white/40 text-white/80 shadow-sm hover:bg-white/55 hover:text-white active:bg-white/65"
          : "text-muted-foreground/70 hover:text-foreground bg-background/80 hover:bg-background border border-border/50 shadow-none active:bg-muted",
        side === "right" ? "left-2" : "right-2"
      )}
      onMouseDown={onDown}
      onTouchStart={onDown}
      data-testid={testId}
    >
      <ChevronsLeftRight className="h-2.5 w-2.5" strokeWidth={2.25} />
    </button>
  );
}
