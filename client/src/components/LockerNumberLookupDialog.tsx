import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterChip } from "@/components/FilterChip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Move } from "lucide-react";
import { ResizeEdgeGrip, type ResizeEdge } from "@/components/ResizeEdgeGrip";

const MIN_W = 360;
const MIN_H = 320;
const STORAGE_KEY = "logsLockerLookupSize";
const POSITION_KEY = "logsLockerLookupPosition";

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

function readSize() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { width?: number; height?: number };
      if (parsed.width && parsed.height) return { width: parsed.width, height: parsed.height };
    }
  } catch {
    /* ignore */
  }
  return { width: 560, height: 520 };
}

function readPosition(fallback: { x: number; y: number }) {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { x?: number; y?: number };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return { x: parsed.x, y: parsed.y };
      }
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function clampPosition(pos: { x: number; y: number }, width: number, height: number) {
  const { width: maxW, height: maxH } = getViewportSize();
  return {
    x: Math.max(8, Math.min(maxW - width - 8, pos.x)),
    y: Math.max(8, Math.min(maxH - height - 8, pos.y)),
  };
}

export function LockerNumberLookupDialog({
  open,
  onOpenChange,
  lockerGroups,
  lockerNumbers,
  selected,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockerGroups: Array<{ id: string; name: string; startNumber: number; endNumber: number }>;
  lockerNumbers: number[];
  selected: number[];
  onApply: (nums: number[]) => void;
}) {
  const [size, setSize] = useState(readSize);
  const [position, setPosition] = useState({ x: 80, y: 80 });
  const [draft, setDraft] = useState<number[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(size);
  const positionRef = useRef(position);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isResizingRef = useRef(false);
  const resizeEdgeRef = useRef<ResizeEdge | null>(null);
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, width: 0, height: 0, x: 0, y: 0 });

  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { positionRef.current = position; }, [position]);

  const syncDomPosition = useCallback((pos: { x: number; y: number }) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
  }, []);

  useEffect(() => {
    if (!open) return;
    const { width: vw, height: vh } = getViewportSize();
    const next = {
      width: Math.min(sizeRef.current.width, vw - 24),
      height: Math.min(sizeRef.current.height, vh - 24),
    };
    setSize(next);
    const centered = {
      x: Math.max(12, Math.round((vw - next.width) / 2)),
      y: Math.max(12, Math.round((vh - next.height) / 2)),
    };
    const pos = clampPosition(readPosition(centered), next.width, next.height);
    positionRef.current = pos;
    setPosition(pos);
    setDraft([...selected]);
  }, [open, selected]);

  useLayoutEffect(() => {
    if (!open) return;
    syncDomPosition(positionRef.current);
  }, [open, size, position, syncDomPosition]);

  const persistLayout = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizeRef.current));
    localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current));
  }, []);

  const applyDragPosition = useCallback((clientX: number, clientY: number) => {
    const sizeNow = sizeRef.current;
    const next = clampPosition(
      { x: clientX - dragOffsetRef.current.x, y: clientY - dragOffsetRef.current.y },
      sizeNow.width,
      sizeNow.height
    );
    positionRef.current = next;
    syncDomPosition(next);
  }, [syncDomPosition]);

  const applyResizeMove = useCallback((clientX: number, clientY: number) => {
    const edge = resizeEdgeRef.current;
    if (!edge) return;
    const start = resizeStartRef.current;
    const dx = clientX - start.mouseX;
    const dy = clientY - start.mouseY;
    const { width: maxW, height: maxH } = getViewportSize();
    let width = start.width;
    let height = start.height;
    let x = start.x;
    let y = start.y;
    if (edge.includes("e")) width = start.width + dx;
    if (edge.includes("w")) width = start.width - dx;
    if (edge.includes("s")) height = start.height + dy;
    if (edge.includes("n")) height = start.height - dy;
    width = Math.max(MIN_W, Math.min(maxW - 16, width));
    height = Math.max(MIN_H, Math.min(maxH - 16, height));
    if (edge.includes("w")) x = start.x + start.width - width;
    if (edge.includes("n")) y = start.y + start.height - height;
    x = Math.max(8, Math.min(maxW - width - 8, x));
    y = Math.max(8, Math.min(maxH - height - 8, y));
    const nextPos = { x, y };
    positionRef.current = nextPos;
    sizeRef.current = { width, height };
    const el = contentRef.current;
    if (el) {
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    setSize({ width, height });
    setPosition(nextPos);
  }, []);

  const handleResizePointerDown = useCallback((
    edge: ResizeEdge,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX == null || clientY == null) return;
    isResizingRef.current = true;
    resizeEdgeRef.current = edge;
    const sizeNow = sizeRef.current;
    const pos = positionRef.current;
    resizeStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      width: sizeNow.width,
      height: sizeNow.height,
      x: pos.x,
      y: pos.y,
    };
    document.body.style.userSelect = "none";
  }, []);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isResizingRef.current) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
  }, []);

  const handleHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    applyDragPosition(e.clientX, e.clientY);
  }, [applyDragPosition]);

  const endHeaderDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.userSelect = "";
    setPosition({ ...positionRef.current });
    persistLayout();
  }, [persistLayout]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      applyResizeMove(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isResizingRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      applyResizeMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onEnd = () => {
      if (isResizingRef.current) persistLayout();
      isResizingRef.current = false;
      resizeEdgeRef.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [applyResizeMove, persistLayout]);

  const groups = lockerGroups.length > 0
    ? lockerGroups
    : [{ id: "all", name: "락카", startNumber: lockerNumbers[0] || 1, endNumber: lockerNumbers[lockerNumbers.length - 1] || 80 }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        overlayClassName="bg-black/[0.06] backdrop-blur-[2px]"
        className="glass-dialog-content flex flex-col gap-0 overflow-hidden p-0 max-w-none rounded-[1.35rem] !transition-none !duration-0 !bg-transparent"
        style={{
          width: size.width,
          height: size.height,
          left: position.x,
          top: position.y,
          transform: "none",
        }}
        data-testid="dialog-locker-number-lookup"
      >
        <ResizeEdgeGrip edge="n" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="s" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="w" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="e" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="nw" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="ne" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="sw" onDown={handleResizePointerDown} tone="glass" />
        <ResizeEdgeGrip edge="se" onDown={handleResizePointerDown} tone="glass" />

        <div
          className="glass-dialog-header shrink-0 rounded-t-[1.35rem] cursor-move touch-none select-none"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={endHeaderDrag}
          onPointerCancel={endHeaderDrag}
        >
          <div className="flex w-full min-h-[3.25rem] items-center gap-2 px-6 pt-4 pr-12 pb-2">
            <Move className="h-4 w-4 opacity-70 shrink-0 pointer-events-none" />
            <DialogTitle className="glass-dialog-title flex-1 text-lg font-semibold leading-none tracking-tight pointer-events-none">
              락카번호 조회
            </DialogTitle>
          </div>
          <div className="px-6 pb-4 pt-1" data-no-drag>
            <FilterChip
              selected={draft.length === 0}
              onClick={() => setDraft([])}
              testId="chip-locker-all"
            >
              전체
            </FilterChip>
          </div>
        </div>

        <div className="glass-dialog-body flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {groups.map((group) => {
            const nums: number[] = [];
            for (let n = group.startNumber; n <= group.endNumber; n++) {
              if (lockerNumbers.includes(n)) nums.push(n);
            }
            if (nums.length === 0) return null;
            return (
              <div key={group.id} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{group.name}</p>
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(3.25rem,1fr))]">
                  {nums.map((num) => {
                    const isOn = draft.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        data-testid={`chip-locker-${num}`}
                        onClick={() => {
                          setDraft((prev) =>
                            prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num]
                          );
                        }}
                        className={cn(
                          "h-11 w-full rounded-2xl text-sm font-semibold tabular-nums border-2 transition-all active:scale-[0.98] touch-manipulation",
                          isOn
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-card/80 text-foreground border-border/60 hover:border-primary/60 hover:bg-accent/80 backdrop-blur-sm"
                        )}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass-dialog-footer shrink-0 px-6 py-3 flex items-center justify-end gap-2 rounded-b-[1.35rem]">
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-4 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4 rounded-xl border-border/50 bg-white/40 hover:bg-white/55 backdrop-blur-sm"
            onClick={() => setDraft([])}
            data-testid="button-clear-locker-lookup"
          >
            초기화
          </Button>
          <Button
            type="button"
            className="h-10 px-5 rounded-xl font-semibold shadow-sm"
            onClick={() => onApply([...draft].sort((a, b) => a - b))}
            data-testid="button-apply-locker-lookup"
          >
            조회{draft.length > 0 ? ` (${draft.length})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
