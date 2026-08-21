import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Move,
  PanelLeft,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import { DockResizeGrip, ResizeEdgeGrip, type ResizeEdge } from "@/components/ResizeEdgeGrip";

export type LogsToolPanel = {
  id: string;
  title: string;
  content: ReactNode;
};

type DockSide = "left" | "right";
type WorkspaceResizeEdge = ResizeEdge | "dock";

const MIN_FLOAT_W = 320;
const MIN_FLOAT_H = 280;
const MIN_DOCK_W = 300;

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function LogsToolWorkspace({
  panels,
  onClosePanel,
  onCloseAll,
}: {
  panels: LogsToolPanel[];
  onClosePanel: (id: string) => void;
  onCloseAll: () => void;
}) {
  const bothOpen = panels.length > 1;
  const [isFloating, setIsFloating] = useState(() => localStorage.getItem("logsToolFloatingMode") === "true");
  const [dockedSide, setDockedSide] = useState<DockSide>(
    () => (localStorage.getItem("logsToolDockedSide") as DockSide) || "right"
  );
  const [floatingPosition, setFloatingPosition] = useState(() =>
    readJson("logsToolFloatingPosition", { x: 80, y: 80 })
  );
  const [floatingSize, setFloatingSize] = useState(() =>
    readJson("logsToolFloatingSize", { width: 400, height: 620 })
  );
  const [dockedWidth, setDockedWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem("logsToolDockedWidth") || "", 10);
    return Number.isFinite(saved) && saved >= MIN_DOCK_W ? saved : 380;
  });

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isResizingRef = useRef(false);
  const resizeEdgeRef = useRef<ResizeEdge | null>(null);
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, width: 0, height: 0, x: 0, y: 0 });
  const floatingPositionRef = useRef(floatingPosition);
  const floatingSizeRef = useRef(floatingSize);
  const dockedWidthRef = useRef(dockedWidth);
  const dockedSideRef = useRef(dockedSide);

  useEffect(() => { floatingPositionRef.current = floatingPosition; }, [floatingPosition]);
  useEffect(() => { floatingSizeRef.current = floatingSize; }, [floatingSize]);
  useEffect(() => { dockedWidthRef.current = dockedWidth; }, [dockedWidth]);
  useEffect(() => { dockedSideRef.current = dockedSide; }, [dockedSide]);

  const persistLayout = useCallback(() => {
    localStorage.setItem("logsToolFloatingPosition", JSON.stringify(floatingPositionRef.current));
    localStorage.setItem("logsToolFloatingSize", JSON.stringify(floatingSizeRef.current));
    localStorage.setItem("logsToolDockedWidth", String(dockedWidthRef.current));
  }, []);

  const applyResizeMove = useCallback((clientX: number, clientY: number) => {
    const edge = resizeEdgeRef.current;
    if (!edge) return;
    const start = resizeStartRef.current;
    const dx = clientX - start.mouseX;
    const dy = clientY - start.mouseY;
    const { width: maxW, height: maxH } = getViewportSize();

    if (edge === "dock") {
      const side = dockedSideRef.current;
      const next = side === "right" ? start.width - dx : start.width + dx;
      const maxDock = Math.max(MIN_DOCK_W, maxW - 72);
      setDockedWidth(Math.max(MIN_DOCK_W, Math.min(maxDock, next)));
      return;
    }

    let width = start.width;
    let height = start.height;
    if (edge.includes("e")) width = start.width + dx;
    if (edge.includes("w")) width = start.width - dx;
    if (edge.includes("s")) height = start.height + dy;
    if (edge.includes("n")) height = start.height - dy;
    width = Math.max(MIN_FLOAT_W, Math.min(maxW, width));
    height = Math.max(MIN_FLOAT_H, Math.min(maxH, height));
    let x = start.x;
    let y = start.y;
    if (edge.includes("w")) x = start.x + start.width - width;
    if (edge.includes("n")) y = start.y + start.height - height;
    x = Math.max(0, Math.min(maxW - width, x));
    y = Math.max(0, Math.min(maxH - height, y));
    setFloatingSize({ width, height });
    setFloatingPosition({ x, y });
  }, []);

  const handleResizeStart = useCallback((edge: ResizeEdge, clientX: number, clientY: number) => {
    isResizingRef.current = true;
    isDraggingRef.current = false;
    resizeEdgeRef.current = edge;
    const size = floatingSizeRef.current;
    const pos = floatingPositionRef.current;
    resizeStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      width: edge === "dock" ? dockedWidthRef.current : size.width,
      height: size.height,
      x: pos.x,
      y: pos.y,
    };
    document.body.style.userSelect = "none";
  }, []);

  const handleResizePointerDown = useCallback((
    edge: WorkspaceResizeEdge,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if ("touches" in e) {
      if (e.touches.length !== 1) return;
      handleResizeStart(edge, e.touches[0].clientX, e.touches[0].clientY);
    } else {
      handleResizeStart(edge, e.clientX, e.clientY);
    }
  }, [handleResizeStart]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isResizingRef.current) applyResizeMove(e.clientX, e.clientY);
      else if (isDraggingRef.current) {
        const { width: maxW, height: maxH } = getViewportSize();
        const size = floatingSizeRef.current;
        setFloatingPosition({
          x: Math.max(0, Math.min(maxW - size.width, e.clientX - dragOffsetRef.current.x)),
          y: Math.max(0, Math.min(maxH - size.height, e.clientY - dragOffsetRef.current.y)),
        });
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (isResizingRef.current) {
        e.preventDefault();
        applyResizeMove(t.clientX, t.clientY);
      } else if (isDraggingRef.current) {
        e.preventDefault();
        const { width: maxW, height: maxH } = getViewportSize();
        const size = floatingSizeRef.current;
        setFloatingPosition({
          x: Math.max(0, Math.min(maxW - size.width, t.clientX - dragOffsetRef.current.x)),
          y: Math.max(0, Math.min(maxH - size.height, t.clientY - dragOffsetRef.current.y)),
        });
      }
    };
    const onEnd = () => {
      if (isResizingRef.current || isDraggingRef.current) persistLayout();
      isResizingRef.current = false;
      isDraggingRef.current = false;
      resizeEdgeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
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

  if (panels.length === 0) return null;

  const title = bothOpen ? "조회 도구" : panels[0].title;

  const handleDragStart = (e: React.MouseEvent) => {
    if (isResizingRef.current) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - floatingPosition.x,
      y: e.clientY - floatingPosition.y,
    };
  };

  const handleTouchDragStart = (e: React.TouchEvent) => {
    if (isResizingRef.current || e.touches.length !== 1) return;
    isDraggingRef.current = true;
    const t = e.touches[0];
    dragOffsetRef.current = {
      x: t.clientX - floatingPosition.x,
      y: t.clientY - floatingPosition.y,
    };
  };

  const style = isFloating
    ? {
        left: floatingPosition.x,
        top: floatingPosition.y,
        width: floatingSize.width,
        height: floatingSize.height,
      }
    : { width: dockedWidth };

  return (
    <div
      data-logs-tool-workspace="true"
      className={`logs-tool-shell z-[60] flex flex-col min-w-0 ${
        isFloating
          ? "fixed rounded-[1.35rem]"
          : dockedSide === "right"
            ? "fixed right-0 top-0 bottom-0"
            : "fixed left-0 top-0 bottom-0"
      }`}
      style={style}
    >
      {isFloating ? (
        <>
          <ResizeEdgeGrip edge="n" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="s" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="w" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="e" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="nw" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="ne" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="sw" onDown={handleResizePointerDown} tone="glass" />
          <ResizeEdgeGrip edge="se" onDown={handleResizePointerDown} tone="glass" />
        </>
      ) : (
        <>
          <div
            className={`absolute top-0 bottom-0 z-[60] w-3 cursor-ew-resize touch-none ${
              dockedSide === "right" ? "left-0" : "right-0"
            }`}
            onMouseDown={(e) => handleResizePointerDown("dock", e)}
            onTouchStart={(e) => handleResizePointerDown("dock", e)}
          />
          <DockResizeGrip
            side={dockedSide}
            onDown={(e) => handleResizePointerDown("dock", e)}
            tone="glass"
          />
        </>
      )}

      <div
        className={`logs-tool-header flex items-center justify-between gap-2 px-3 py-2 min-w-0 ${
          isFloating ? "cursor-move rounded-t-[1.35rem]" : ""
        }`}
        onMouseDown={isFloating ? handleDragStart : undefined}
        onTouchStart={isFloating ? handleTouchDragStart : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isFloating && <Move className="w-4 h-4 opacity-60 shrink-0" />}
          <h3 className="font-semibold truncate">{title}</h3>
          {bothOpen && (
            <span className="locker-workspace-count-badge px-2 py-0.5 rounded-full text-xs font-bold">
              2
            </span>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {!isFloating && (
            <Button
              variant="ghost"
              size="icon"
              className="logs-tool-header-btn h-8 w-8 text-white/90 hover:bg-white/15"
              title={dockedSide === "right" ? "좌측으로 이동" : "우측으로 이동"}
              onClick={() => {
                const next = dockedSide === "right" ? "left" : "right";
                setDockedSide(next);
                localStorage.setItem("logsToolDockedSide", next);
              }}
            >
              {dockedSide === "right" ? <PanelLeft className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="logs-tool-header-btn h-8 w-8 text-white/90 hover:bg-white/15"
            title={isFloating ? "도킹" : "플로팅 모드"}
            onClick={() => {
              const next = !isFloating;
              setIsFloating(next);
              localStorage.setItem("logsToolFloatingMode", String(next));
            }}
          >
            {isFloating ? <PanelRight className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="logs-tool-header-btn h-8 w-8 text-white/90 hover:bg-white/15"
            title="모두 닫기"
            onClick={onCloseAll}
          >
            ✕
          </Button>
        </div>
      </div>

      <div className={`logs-tool-body flex-1 min-h-0 p-3 gap-3 flex flex-col overflow-y-auto overflow-x-hidden`}>
        {panels.map((panel) => (
          <div
            key={panel.id}
            className={`min-w-0 flex flex-col ${
              bothOpen ? "logs-tool-panel flex-1 min-h-[12rem] basis-0" : "flex-1"
            }`}
            data-logs-panel={panel.id}
          >
            {bothOpen && (
              <div className="logs-tool-panel-header flex items-center justify-between px-3 py-2">
                <p className="font-semibold text-sm">{panel.title}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="닫기"
                  onClick={() => onClosePanel(panel.id)}
                >
                  ✕
                </Button>
              </div>
            )}
            <div className={`flex-1 overflow-y-auto ${bothOpen ? "p-3" : "p-1"}`}>
              {panel.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
