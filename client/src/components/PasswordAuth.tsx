import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, AlertTriangle, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  applyDemoExtensionCode,
  applyDemoStartCode,
  getDemoDeviceId,
  getDemoPassword,
  isDemoMode,
  isDemoTrialActive,
  syncDemoTrial,
  type DemoTrialSnapshot,
} from "@/lib/demoMode";
import { getAppName } from "@/lib/appMeta";
import { persistAuthToDatabase } from "@/lib/localDb";

interface PasswordAuthProps {
  onAuthenticated: () => void;
}

export function PasswordAuth({ onAuthenticated }: PasswordAuthProps) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoSnapshot, setDemoSnapshot] = useState<DemoTrialSnapshot | null>(null);
  const [demoCode, setDemoCode] = useState("");
  const [demoReady, setDemoReady] = useState(false);
  const [demoSyncError, setDemoSyncError] = useState<string | null>(null);
  const [isApplyingCode, setIsApplyingCode] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const { toast } = useToast();

  const demoActive = demoSnapshot ? isDemoTrialActive(demoSnapshot) : false;
  const needsStart = !!demoSnapshot?.needsStart;
  const demoExpired = !!demoSnapshot?.expired && !needsStart;
  const demoDeviceId = demoSnapshot?.deviceId || "";
  const remainingDays = demoSnapshot?.remainingDays ?? 0;
  const passwordAllowed = !demoMode || demoActive;

  const loadDemoTrial = async () => {
    const snapshot = await syncDemoTrial();
    setDemoSnapshot(snapshot);
    setDemoSyncError(null);
    return snapshot;
  };

  useEffect(() => {
    if (!isDemoMode()) {
      setDemoReady(true);
      return;
    }

    setDemoMode(true);
    let cancelled = false;

    (async () => {
      try {
        await loadDemoTrial();
      } catch (err) {
        if (cancelled) return;
        setDemoSyncError(
          err instanceof Error
            ? err.message
            : "체험 서버에 연결하지 못했습니다. 인터넷 연결 후 다시 열어주세요."
        );
        setDemoSnapshot({
          deviceId: getDemoDeviceId(),
          startDate: null,
          trialDays: 7,
          remainingMs: 0,
          remainingDays: 0,
          expired: false,
          needsStart: true,
          source: "cache",
        });
      } finally {
        if (!cancelled) setDemoReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetrySync = async () => {
    setIsRetrying(true);
    try {
      await loadDemoTrial();
      toast({ title: "체험 서버 연결 성공" });
    } catch (err) {
      setDemoSyncError(
        err instanceof Error
          ? err.message
          : "체험 서버에 연결하지 못했습니다."
      );
      toast({
        title: "연결 실패",
        description: err instanceof Error ? err.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (demoMode) {
        if (demoSyncError) {
          toast({
            title: "체험 확인 필요",
            description: demoSyncError,
            variant: "destructive",
          });
          return;
        }
        if (needsStart) {
          toast({
            title: "체험 시작 필요",
            description: "관리자에게 받은 시작 코드를 먼저 입력해 주세요.",
            variant: "destructive",
          });
          return;
        }
        if (demoExpired || !demoActive) {
          toast({
            title: "체험 만료",
            description: "비밀번호로는 진입할 수 없습니다. 연장 코드를 입력해 주세요.",
            variant: "destructive",
          });
          return;
        }

        // 로그인 직전 서버 재확인 (캐시만으로 통과 방지)
        try {
          const fresh = await syncDemoTrial();
          setDemoSnapshot(fresh);
          if (!isDemoTrialActive(fresh)) {
            toast({
              title: "체험 만료",
              description: "체험 기간이 만료되었습니다. 연장 코드를 입력해 주세요.",
              variant: "destructive",
            });
            return;
          }
        } catch (err) {
          toast({
            title: "체험 확인 실패",
            description: err instanceof Error ? err.message : "서버 확인 후 다시 시도해 주세요.",
            variant: "destructive",
          });
          return;
        }

        const storedPassword = getDemoPassword();
        if (!storedPassword || password !== storedPassword) {
          toast({
            title: "인증 실패",
            description: "비밀번호가 올바르지 않습니다.",
            variant: "destructive",
          });
          setPassword("");
          return;
        }

        localStorage.setItem("authenticated", "true");
        persistAuthToDatabase(true);
        onAuthenticated();
        return;
      }

      const storedPassword = localStorage.getItem("staff_password") || "12345678";
      if (password === storedPassword) {
        localStorage.setItem("authenticated", "true");
        persistAuthToDatabase(true);
        onAuthenticated();
      } else {
        toast({
          title: "인증 실패",
          description: "비밀번호가 올바르지 않습니다.",
          variant: "destructive",
        });
        setPassword("");
      }
    } catch (error) {
      toast({
        title: "오류",
        description: "인증 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyDemoCode = async () => {
    setIsApplyingCode(true);
    const result = needsStart
      ? await applyDemoStartCode(demoCode)
      : await applyDemoExtensionCode(demoCode);

    toast({
      title: result.success
        ? needsStart
          ? "체험 시작 완료"
          : "체험 기간 연장 완료"
        : needsStart
          ? "시작 실패"
          : "연장 실패",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });

    if (result.success) {
      setDemoCode("");
      if (result.snapshot) {
        setDemoSnapshot(result.snapshot);
        setDemoSyncError(null);
      } else {
        try {
          await loadDemoTrial();
        } catch {
          // ignore
        }
      }
    }
    setIsApplyingCode(false);
  };

  if (!demoReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">체험 기간 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Lock className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">{getAppName()}</CardTitle>
          <CardDescription className="text-center">
            {demoMode ? (
              demoSyncError ? (
                <span className="text-destructive flex flex-col items-center justify-center gap-2">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {demoSyncError}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isRetrying}
                    onClick={handleRetrySync}
                    data-testid="button-demo-retry-sync"
                  >
                    {isRetrying ? "재시도 중..." : "다시 연결"}
                  </Button>
                </span>
              ) : needsStart ? (
                <span className="text-amber-600 flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  체험 시작 코드가 필요합니다
                </span>
              ) : demoExpired ? (
                <span className="text-destructive flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  체험 기간이 만료되었습니다
                </span>
              ) : (
                <span className="text-amber-600">
                  체험판 - 남은 기간: {remainingDays}일
                </span>
              )
            ) : (
              "직원 전용 - 비밀번호를 입력하세요"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passwordAllowed && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="비밀번호 (8자리)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={8}
                  disabled={isLoading || !!demoSyncError}
                  autoFocus
                  autoComplete="new-password"
                  data-testid="input-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !password || !!demoSyncError}
                data-testid="button-login"
              >
                {isLoading ? "확인 중..." : "로그인"}
              </Button>
            </form>
          )}

          {demoMode && !passwordAllowed && !demoSyncError && (
            <p className="text-sm text-center text-muted-foreground mb-4">
              {needsStart
                ? "비밀번호로는 시작할 수 없습니다. 아래 기기 ID를 관리자에게 보내고 시작 코드를 받으세요."
                : "비밀번호로는 진입할 수 없습니다. 연장 코드만 사용할 수 있습니다."}
            </p>
          )}

          {demoMode && (
            <div className={`space-y-3 ${passwordAllowed ? "mt-5 border-t pt-4" : ""}`}>
              <div>
                <p className="text-xs text-muted-foreground">체험 기기 ID</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-center font-mono text-sm">
                    {demoDeviceId}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(demoDeviceId)}
                    aria-label="체험 기기 ID 복사"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {needsStart
                    ? "다른 기기에서 다시 열어도 새 체험이 자동으로 시작되지 않습니다."
                    : "인터넷 사용 기록을 지워도 같은 기기·브라우저면 체험 기간이 이어집니다."}
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={demoCode}
                  onChange={(e) => setDemoCode(e.target.value.toUpperCase())}
                  placeholder={
                    needsStart
                      ? "시작 코드 (START-…)"
                      : demoExpired
                        ? "연장 코드 (DEMO-…)"
                        : "연장 코드 (선택)"
                  }
                  autoComplete="off"
                  disabled={!!demoSyncError}
                  data-testid="input-demo-code"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!demoCode.trim() || isApplyingCode || !!demoSyncError}
                  onClick={handleApplyDemoCode}
                  data-testid="button-demo-code"
                >
                  {isApplyingCode ? "처리 중" : needsStart ? "시작" : "연장"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
