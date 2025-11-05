import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface PatternLockProps {
  onPatternComplete: (pattern: number[]) => void;
  onPatternChange?: (pattern: number[]) => void;
  className?: string;
  correctPattern?: number[];
  showError?: boolean;
  size?: number;
}

export default function PatternLock({
  onPatternComplete,
  onPatternChange,
  className,
  correctPattern,
  showError = false,
  size = 3,
}: PatternLockProps) {
  const [pattern, setPattern] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  const dotSize = 20;
  const spacing = 80;
  const canvasSize = spacing * (size - 1) + dotSize * 2;

  const getDotPosition = (index: number) => {
    const row = Math.floor(index / size);
    const col = index % size;
    return {
      x: col * spacing + dotSize,
      y: row * spacing + dotSize,
    };
  };

  const getClosestDot = (x: number, y: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const canvasX = x - rect.left;
    const canvasY = y - rect.top;

    let closestDot: number | null = null;
    let minDistance = Infinity;

    for (let i = 0; i < size * size; i++) {
      const pos = getDotPosition(i);
      const distance = Math.sqrt(
        Math.pow(canvasX - pos.x, 2) + Math.pow(canvasY - pos.y, 2)
      );

      // Find the closest dot within a larger radius
      if (distance < spacing * 0.6 && distance < minDistance) {
        closestDot = i;
        minDistance = distance;
      }
    }

    return closestDot;
  };

  const fillIntermediateDots = (from: number, to: number): number[] => {
    const fromRow = Math.floor(from / size);
    const fromCol = from % size;
    const toRow = Math.floor(to / size);
    const toCol = to % size;

    const rowDiff = toRow - fromRow;
    const colDiff = toCol - fromCol;
    const steps = Math.max(Math.abs(rowDiff), Math.abs(colDiff));

    if (steps === 0) return [];

    const intermediates: number[] = [];
    for (let i = 1; i < steps; i++) {
      const row = fromRow + Math.round((rowDiff * i) / steps);
      const col = fromCol + Math.round((colDiff * i) / steps);
      const dotIndex = row * size + col;
      if (!pattern.includes(dotIndex) && dotIndex !== to) {
        intermediates.push(dotIndex);
      }
    }

    return intermediates;
  };

  const addDotToPattern = (dotIndex: number) => {
    if (!pattern.includes(dotIndex)) {
      // Fill intermediate dots if needed
      if (pattern.length > 0) {
        const lastDot = pattern[pattern.length - 1];
        const intermediates = fillIntermediateDots(lastDot, dotIndex);
        if (intermediates.length > 0) {
          const newPattern = [...pattern, ...intermediates, dotIndex];
          console.log('[PatternLock] Adding dots with intermediates:', newPattern);
          setPattern(newPattern);
          onPatternChange?.(newPattern);
          return;
        }
      }

      const newPattern = [...pattern, dotIndex];
      console.log('[PatternLock] Adding dot:', newPattern);
      setPattern(newPattern);
      onPatternChange?.(newPattern);
    }
  };

  const handleStart = (x: number, y: number) => {
    setIsDrawing(true);
    setError(false);
    const dotIndex = getClosestDot(x, y);
    if (dotIndex !== null) {
      setPattern([dotIndex]);
      onPatternChange?.([dotIndex]);
    }
  };

  const handleMove = (x: number, y: number) => {
    if (!isDrawing) return;

    setTouchPosition({ x, y });
    const dotIndex = getClosestDot(x, y);
    if (dotIndex !== null) {
      addDotToPattern(dotIndex);
    }
  };

  const handleEnd = () => {
    if (pattern.length > 0) {
      console.log('[PatternLock] Pattern completed:', pattern);
      console.log('[PatternLock] Correct pattern:', correctPattern);
      onPatternComplete(pattern);
      
      // Check if pattern is correct (if correctPattern is provided)
      if (correctPattern && JSON.stringify(pattern) !== JSON.stringify(correctPattern)) {
        console.log('[PatternLock] Pattern incorrect!');
        setError(true);
        setTimeout(() => {
          setPattern([]);
          setError(false);
        }, 500);
      } else if (correctPattern) {
        // Pattern is correct
        console.log('[PatternLock] Pattern correct!');
        setTimeout(() => {
          setPattern([]);
        }, 200);
      }
    }
    setIsDrawing(false);
    setTouchPosition(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault();
    handleMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    handleEnd();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw lines between pattern dots
    if (pattern.length > 1) {
      ctx.beginPath();
      const firstPos = getDotPosition(pattern[0]);
      ctx.moveTo(firstPos.x, firstPos.y);

      for (let i = 1; i < pattern.length; i++) {
        const pos = getDotPosition(pattern[i]);
        ctx.lineTo(pos.x, pos.y);
      }

      // Draw line to current touch position if drawing
      if (isDrawing && touchPosition && canvas) {
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(touchPosition.x - rect.left, touchPosition.y - rect.top);
      }

      ctx.strokeStyle = error ? "hsl(var(--destructive))" : "hsl(var(--primary))";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    // Draw dots
    for (let i = 0; i < size * size; i++) {
      const pos = getDotPosition(i);
      const isSelected = pattern.includes(i);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, dotSize / 2, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = error ? "hsl(var(--destructive))" : "hsl(var(--primary))";
        ctx.fill();
        ctx.strokeStyle = error ? "hsl(var(--destructive))" : "hsl(var(--primary))";
      } else {
        ctx.strokeStyle = "hsl(var(--border))";
      }

      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw inner dot for selected dots
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotSize / 4, 0, Math.PI * 2);
        ctx.fillStyle = "hsl(var(--primary-foreground))";
        ctx.fill();
      }
    }
  }, [pattern, isDrawing, touchPosition, error, size]);

  useEffect(() => {
    if (showError) {
      setError(true);
      setTimeout(() => {
        setPattern([]);
        setError(false);
      }, 500);
    }
  }, [showError]);

  return (
    <div ref={containerRef} className={cn("flex items-center justify-center", className)}>
      <canvas
        ref={canvasRef}
        width={canvasSize}
        height={canvasSize}
        className="touch-none cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid="pattern-lock-canvas"
      />
    </div>
  );
}
