import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PatternLock from "@/components/PatternLock";

interface PatternLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatternCorrect: () => void;
  title?: string;
  description?: string;
  testId?: string;
}

export default function PatternLockDialog({
  open,
  onOpenChange,
  onPatternCorrect,
  title = "패턴 확인",
  description = "패턴을 그려서 잠금을 해제하세요.",
  testId = "dialog-pattern-lock",
}: PatternLockDialogProps) {
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  // Get the correct pattern from localStorage
  const getCorrectPattern = (): number[] => {
    const saved = localStorage.getItem("staff_pattern");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Default pattern: Z shape (0-1-2-5-8)
        return [0, 1, 2, 5, 8];
      }
    }
    // Default pattern: Z shape (0-1-2-5-8)
    return [0, 1, 2, 5, 8];
  };

  const handlePatternComplete = (pattern: number[]) => {
    const correctPattern = getCorrectPattern();
    
    if (JSON.stringify(pattern) === JSON.stringify(correctPattern)) {
      // Correct pattern
      onPatternCorrect();
      onOpenChange(false);
      setErrorMessage("");
      setShowError(false);
    } else {
      // Wrong pattern
      setErrorMessage("패턴이 올바르지 않습니다.");
      setShowError(true);
      
      setTimeout(() => {
        setShowError(false);
      }, 500);
    }
  };

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const savedPassword = localStorage.getItem("staff_password") || "1234";
    
    if (passwordInput === savedPassword) {
      onPatternCorrect();
      onOpenChange(false);
      setPasswordInput("");
      setErrorMessage("");
    } else {
      setErrorMessage("비밀번호가 올바르지 않습니다.");
    }
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setErrorMessage("");
      setShowError(false);
      setPasswordInput("");
      setUsePassword(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {usePassword ? "비밀번호를 입력하세요." : description}
          </DialogDescription>
        </DialogHeader>
        
        {usePassword ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="비밀번호 입력"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setErrorMessage("");
              }}
              data-testid="input-password"
              autoFocus
            />
            {errorMessage && (
              <p className="text-sm text-destructive" data-testid="text-password-error">
                {errorMessage}
              </p>
            )}
            <div className="flex gap-2 justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUsePassword(false)}
                data-testid="button-use-pattern"
              >
                패턴으로 전환
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-pattern"
                >
                  취소
                </Button>
                <Button type="submit" data-testid="button-submit-password">
                  확인
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <PatternLock
                onPatternComplete={handlePatternComplete}
                correctPattern={getCorrectPattern()}
                showError={showError}
                className="my-4"
              />
              
              {errorMessage && (
                <p className="text-sm text-destructive" data-testid="text-pattern-error">
                  {errorMessage}
                </p>
              )}

              <div className="text-xs text-muted-foreground text-center">
                기본 패턴: Z 모양 (좌상단 → 우상단 → 중앙 → 우하단)
              </div>
            </div>

            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUsePassword(true)}
                data-testid="button-use-password"
              >
                비밀번호로 전환
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-pattern"
              >
                취소
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
