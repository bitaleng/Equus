import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Key, ShieldCheck, AlertTriangle, Calendar, RefreshCw } from "lucide-react";
import {
  applyDemoExtensionCode,
  applyDemoStartCode,
  clearDemoAuthSession,
  getDemoDeviceId,
  isDemoMode,
  isDemoTrialActive,
  syncDemoTrial,
  type DemoTrialSnapshot,
} from "@/lib/demoMode";
import {
  validateLicenseKey,
  getStoredLicense,
  storeLicense,
  clearLicense,
  checkStoredLicenseValidity,
  LicenseData,
} from "@/lib/licenseValidation";
import { persistLicenseToDatabase } from "@/lib/localDb";
import { getAppDescription, getAppName, getAppSkin } from "@/lib/appMeta";

interface LicenseGateProps {
  children: React.ReactNode;
}

const skin = getAppSkin();
const LICENSE_PLACEHOLDER =
  skin === "v3" ? "HOME-XXXX-XXXX-XXXX"
  : skin === "v2" ? "HIZZ-XXXX-XXXX-XXXX"
  : "EQUS-XXXX-XXXX-XXXX";
const DEMO_RESYNC_MS = 30 * 60 * 1000;

export default function LicenseGate({ children }: LicenseGateProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isValidated, setIsValidated] = useState(false);
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [extensionCode, setExtensionCode] = useState("");
  const [startCode, setStartCode] = useState("");
  const [demoSnapshot, setDemoSnapshot] = useState<DemoTrialSnapshot | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  const isDevelopment = import.meta.env.DEV;
  const isDemo = isDemoMode();

  const applyDemoSnapshot = useCallback((snapshot: DemoTrialSnapshot) => {
    setDemoSnapshot(snapshot);
    if (isDemoTrialActive(snapshot)) {
      setIsValidated(true);
      setError(null);
      return;
    }
    clearDemoAuthSession();
    setIsValidated(false);
    if (snapshot.needsStart) {
      setError("이 기기에서 체험을 시작하려면 관리자에게 받은 시작 코드가 필요합니다.");
    } else if (snapshot.expired) {
      setError("체험 기간이 만료되었습니다. 연장이 필요하면 관리자에게 문의하세요.");
    }
  }, []);

  const refreshDemoTrial = useCallback(async () => {
    const snapshot = await syncDemoTrial();
    applyDemoSnapshot(snapshot);
    return snapshot;
  }, [applyDemoSnapshot]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isDevelopment && !isDemo) {
        console.log("[LicenseGate] Bypassing license check: development mode");
        if (!cancelled) {
          setIsValidated(true);
          setIsLoading(false);
        }
        return;
      }

      if (isDemo) {
        try {
          const snapshot = await syncDemoTrial();
          if (cancelled) return;
          applyDemoSnapshot(snapshot);
        } catch (err) {
          if (cancelled) return;
          clearDemoAuthSession();
          setIsValidated(false);
          setError(
            err instanceof Error
              ? err.message
              : "체험 서버에 연결하지 못했습니다. 인터넷 연결 후 다시 열어주세요."
          );
        } finally {
          if (!cancelled) setIsLoading(false);
        }
        return;
      }

      // 정식: 로컬(및 DB에서 복구된) 라이선스만 검증 — 서버 기기 바인딩 없음
      const storedLicenseData = checkStoredLicenseValidity();
      if (cancelled) return;

      if (storedLicenseData) {
        if (storedLicenseData.isExpired) {
          setError("라이선스가 만료되었습니다. 새 라이선스를 입력해주세요.");
          clearLicense();
          persistLicenseToDatabase(null);
        } else {
          setLicenseData(storedLicenseData);
          setIsValidated(true);
          // LS에만 있던 키를 DB에도 백업
          const key = getStoredLicense();
          if (key) persistLicenseToDatabase(key);
          if (storedLicenseData.daysRemaining <= 30) {
            setShowExpiryWarning(true);
          }
        }
      }
      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isDevelopment, isDemo, applyDemoSnapshot]);

  useEffect(() => {
    if (!isDemo || !isValidated) return;

    const tick = () => {
      void refreshDemoTrial().catch(() => {});
    };
    const onFocus = () => tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const iv = window.setInterval(tick, DEMO_RESYNC_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(iv);
    };
  }, [isDemo, isValidated, refreshDemoTrial]);

  const handleValidate = () => {
    setError(null);

    const cleanKey = inputKey.trim().toUpperCase();
    if (!cleanKey || cleanKey.length < 19) {
      setError("올바른 라이선스 키를 입력해주세요.");
      return;
    }

    const result = validateLicenseKey(cleanKey);
    if (!result) {
      setError("유효하지 않은 라이선스 키입니다. 키를 다시 확인해주세요.");
      return;
    }
    if (result.isExpired) {
      setError(
        `라이선스가 만료되었습니다. (만료일: ${result.expiryDate.toLocaleDateString("ko-KR")})`
      );
      return;
    }

    storeLicense(cleanKey);
    persistLicenseToDatabase(cleanKey);
    setLicenseData(result);
    setIsValidated(true);
    if (result.daysRemaining <= 30) {
      setShowExpiryWarning(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleValidate();
  };

  const formatLicenseInput = (value: string) => {
    const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const parts = [];
    for (let i = 0; i < cleaned.length && i < 16; i += 4) {
      parts.push(cleaned.slice(i, i + 4));
    }
    return parts.join("-");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputKey(formatLicenseInput(e.target.value));
  };

  const handleDemoStart = async () => {
    setDemoBusy(true);
    setError(null);
    const result = await applyDemoStartCode(startCode);
    if (!result.success) {
      setError(result.message);
      setDemoBusy(false);
      return;
    }
    if (result.snapshot) {
      applyDemoSnapshot(result.snapshot);
    } else {
      try {
        await refreshDemoTrial();
      } catch (err) {
        setError(err instanceof Error ? err.message : "시작 후 확인에 실패했습니다.");
      }
    }
    setStartCode("");
    setDemoBusy(false);
  };

  const handleDemoExtension = async () => {
    setDemoBusy(true);
    setError(null);
    const result = await applyDemoExtensionCode(extensionCode);
    if (!result.success) {
      setError(result.message);
      setDemoBusy(false);
      return;
    }
    if (result.snapshot) {
      applyDemoSnapshot(result.snapshot);
    } else {
      window.location.reload();
      return;
    }
    setExtensionCode("");
    setDemoBusy(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {isDemo ? "체험 기간 확인 중..." : "라이선스 확인 중..."}
          </p>
        </div>
      </div>
    );
  }

  if (isValidated) {
    return (
      <>
        {showExpiryWarning && licenseData && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-medium">
            <Calendar className="inline-block h-4 w-4 mr-2" />
            라이선스 만료 {licenseData.daysRemaining}일 전 (만료일:{" "}
            {licenseData.expiryDate.toLocaleDateString("ko-KR")})
            <Button
              variant="ghost"
              size="sm"
              className="ml-4 h-6 text-amber-950 hover:bg-amber-600"
              onClick={() => setShowExpiryWarning(false)}
            >
              닫기
            </Button>
          </div>
        )}
        {children}
      </>
    );
  }

  if (isDemo) {
    const needsStart = !!demoSnapshot?.needsStart;
    const expired = !!demoSnapshot?.expired && !needsStart;
    const deviceId = demoSnapshot?.deviceId || getDemoDeviceId();

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{getAppName()}</CardTitle>
            <CardDescription>
              {needsStart
                ? "다른 PC·태블릿에서 새로 시작하면 체험이 리셋되지 않습니다. 이 기기의 ID를 관리자에게 보내 시작 코드를 받으세요."
                : "연장이 필요하면 아래 기기 ID를 관리자에게 보내세요. 최초 시작일부터 최대 30일까지 연장할 수 있습니다."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="mb-1 text-xs text-muted-foreground">체험 기기 ID</p>
              <code className="font-mono text-base font-semibold">{deviceId}</code>
            </div>
            {needsStart ? (
              <>
                <Input
                  value={startCode}
                  onChange={(e) => setStartCode(e.target.value.toUpperCase())}
                  placeholder="관리자에게 받은 시작 코드 (START-…)"
                  autoComplete="off"
                />
                <Button
                  className="w-full"
                  disabled={!startCode.trim() || demoBusy}
                  onClick={handleDemoStart}
                >
                  {demoBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  체험 시작
                </Button>
              </>
            ) : (
              <>
                <Input
                  value={extensionCode}
                  onChange={(e) => setExtensionCode(e.target.value.toUpperCase())}
                  placeholder="관리자에게 받은 연장 코드 (DEMO-…)"
                  autoComplete="off"
                />
                <Button
                  className="w-full"
                  disabled={!extensionCode.trim() || demoBusy}
                  onClick={handleDemoExtension}
                >
                  {demoBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  체험 기간 연장
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={demoBusy}
              onClick={() => {
                setDemoBusy(true);
                void refreshDemoTrial()
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "다시 확인해 주세요.")
                  )
                  .finally(() => setDemoBusy(false));
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              서버에서 다시 확인
            </Button>
            {expired && (
              <p className="text-xs text-center text-muted-foreground">
                비밀번호로는 진입할 수 없습니다. 연장 코드만 사용할 수 있습니다.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md" data-testid="license-gate-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Key className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">{getAppName()}</CardTitle>
          <CardDescription>{getAppDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" data-testid="license-error">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Input
                type="text"
                placeholder={LICENSE_PLACEHOLDER}
                value={inputKey}
                onChange={handleInputChange}
                className="text-center text-lg font-mono tracking-wider"
                maxLength={19}
                data-testid="input-license-key"
              />
              <p className="text-xs text-muted-foreground text-center">
                구매 시 받은 라이선스 키를 입력해주세요
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={inputKey.length < 19}
              data-testid="button-activate-license"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              라이선스 인증
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function useLicenseInfo() {
  const licenseKey = getStoredLicense();
  const licenseData = licenseKey ? validateLicenseKey(licenseKey) : null;

  return {
    licenseKey,
    licenseData,
    deviceId: undefined as string | undefined,
    isValid: licenseData?.isValid && !licenseData?.isExpired,
    daysRemaining: licenseData?.daysRemaining ?? 0,
    expiryDate: licenseData?.expiryDate,
  };
}

export function clearStoredLicense(): void {
  clearLicense();
  persistLicenseToDatabase(null);
}

export async function unregisterDevice(): Promise<{ success: boolean; message?: string }> {
  clearLicense();
  persistLicenseToDatabase(null);
  return {
    success: true,
    message: "이 기기의 라이선스가 삭제되었습니다. 다시 입력하면 사용할 수 있습니다.",
  };
}
