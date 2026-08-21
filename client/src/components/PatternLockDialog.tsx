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
import { Fingerprint, ChevronDown } from "lucide-react";
import PatternLock from "@/components/PatternLock";
import { validateLicenseKey } from "@/lib/licenseValidation";
import { getAppName, getAppSkin } from "@/lib/appMeta";

const LICENSE_PLACEHOLDER =
  getAppSkin() === "v3" ? "HOME-XXXX-XXXX-XXXX"
  : getAppSkin() === "v2" ? "HIZZ-XXXX-XXXX-XXXX"
  : "EQUS-XXXX-XXXX-XXXX";

interface PatternLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatternCorrect: () => void;
  title?: string;
  description?: string;
  testId?: string;
}

// WebAuthn helper functions
async function checkBiometricSupport(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch {
    return false;
  }
}

async function authenticateWithBiometric(): Promise<boolean> {
  try {
    const credentialId = localStorage.getItem("webauthn_credential_id");
    
    if (!credentialId) {
      return await registerBiometricCredential();
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credIdArray = Uint8Array.from(atob(credentialId), c => c.charCodeAt(0));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge,
        allowCredentials: [{
          id: credIdArray,
          type: 'public-key',
          transports: ['internal']
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    return !!assertion;
  } catch (error) {
    console.error("Biometric authentication failed:", error);
    return false;
  }
}

async function registerBiometricCredential(): Promise<boolean> {
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: challenge,
        rp: {
          name: getAppName(),
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: "manager",
          displayName: "관리자"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred"
        },
        timeout: 60000,
        attestation: "none"
      }
    }) as PublicKeyCredential | null;

    if (credential) {
      const rawId = new Uint8Array(credential.rawId);
      const credentialId = btoa(String.fromCharCode.apply(null, Array.from(rawId)));
      localStorage.setItem("webauthn_credential_id", credentialId);
      localStorage.setItem("webauthn_enabled", "true");
      return true;
    }
    return false;
  } catch (error) {
    console.error("Biometric registration failed:", error);
    return false;
  }
}

// 화면 종류
type Screen = 'biometric' | 'pattern' | 'password' | 'license';

export default function PatternLockDialog({
  open,
  onOpenChange,
  onPatternCorrect,
  title = "패턴 확인",
  description = "패턴을 그려서 잠금을 해제하세요.",
  testId = "dialog-pattern-lock",
}: PatternLockDialogProps) {
  const [screen, setScreen] = useState<Screen>('pattern');
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authMode, setAuthMode] = useState<'pattern' | 'password' | 'both'>('both');
  const [licenseInput, setLicenseInput] = useState("");
  const [licenseError, setLicenseError] = useState("");

  useEffect(() => {
    const checkBiometric = async () => {
      const available = await checkBiometricSupport();
      setBiometricAvailable(available);
      const enabled = localStorage.getItem("webauthn_enabled") === "true";
      setBiometricEnabled(enabled);
    };
    checkBiometric();
  }, []);

  const getCorrectPattern = (): number[] => {
    const oldKey = localStorage.getItem("security_pattern");
    if (oldKey && !localStorage.getItem("staff_pattern")) {
      localStorage.setItem("staff_pattern", oldKey);
      localStorage.removeItem("security_pattern");
    }
    const saved = localStorage.getItem("staff_pattern");
    if (saved) {
      try { return JSON.parse(saved); } catch { return [0, 1, 2, 4, 6]; }
    }
    return [0, 1, 2, 4, 6];
  };

  const handleSuccess = () => {
    onPatternCorrect();
    onOpenChange(false);
  };

  const handlePatternComplete = (pattern: number[]) => {
    if (JSON.stringify(pattern) === JSON.stringify(getCorrectPattern())) {
      handleSuccess();
      setErrorMessage("");
      setShowError(false);
    } else {
      setErrorMessage("패턴이 올바르지 않습니다.");
      setShowError(true);
      setTimeout(() => setShowError(false), 500);
    }
  };

  const handlePasswordSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const savedPassword = localStorage.getItem("staff_password") || "12345678";
    if (passwordInput === savedPassword) {
      setPasswordInput("");
      handleSuccess();
    } else {
      setErrorMessage("비밀번호가 올바르지 않습니다.");
    }
  };

  const handleLicenseSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setLicenseError("");
    const result = validateLicenseKey(licenseInput.trim());
    if (!result) { setLicenseError("유효하지 않은 라이센스 키입니다."); return; }
    handleSuccess();
    setLicenseInput("");
    setLicenseError("");
  };

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);
    setErrorMessage("");
    try {
      const success = await authenticateWithBiometric();
      if (success) {
        handleSuccess();
      } else {
        setErrorMessage("인증에 실패했습니다. 다시 시도하거나 다른 방법을 사용하세요.");
      }
    } catch {
      setErrorMessage("생체인증을 사용할 수 없습니다.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // 다이얼로그 열릴 때 초기 화면 결정
  useEffect(() => {
    if (open) {
      const mode = (localStorage.getItem("auth_method_mode") as 'pattern' | 'password' | 'both') || 'both';
      setAuthMode(mode);
      setErrorMessage("");
      setShowError(false);
      setPasswordInput("");
      setLicenseInput("");
      setLicenseError("");

      // 지문인식이 등록+지원되면 → 지문 전용 화면으로 시작
      if (biometricEnabled && biometricAvailable) {
        setScreen('biometric');
      } else if (mode === 'password') {
        setScreen('password');
      } else {
        setScreen('pattern');
      }
    }
  }, [open, biometricEnabled, biometricAvailable]);

  // 지문 화면 열리면 자동 인증 시도
  useEffect(() => {
    if (open && screen === 'biometric') {
      const timer = setTimeout(() => { handleBiometricAuth(); }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, screen]);

  // 다른 방법으로 전환 (지문 화면에서)
  const handleFallback = () => {
    setErrorMessage("");
    if (authMode === 'password') {
      setScreen('password');
    } else {
      setScreen('pattern');
    }
  };

  const dialogDescription = screen === 'license'
    ? "라이센스 키를 입력하여 잠금을 해제하세요."
    : screen === 'password'
    ? "비밀번호를 입력하세요."
    : screen === 'biometric'
    ? "지문 또는 얼굴인식 등 생체인증으로 잠금을 해제하세요."
    : description;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {/* ── 지문인식 전용 화면 ── */}
        {screen === 'biometric' && (
          <div className="flex flex-col items-center gap-5 py-6">
            <button
              type="button"
              onClick={handleBiometricAuth}
              disabled={isAuthenticating}
              className="flex flex-col items-center gap-3 group"
              data-testid="button-biometric-auth"
            >
              <div className={`w-24 h-24 rounded-full flex items-center justify-center border-2 transition-colors ${
                isAuthenticating
                  ? "border-primary bg-primary/10 animate-pulse"
                  : "border-border bg-muted hover-elevate"
              }`}>
                <Fingerprint className={`h-12 w-12 transition-colors ${
                  isAuthenticating ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                }`} />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {isAuthenticating ? "인증 중..." : "터치하여 인증"}
              </span>
            </button>

            {errorMessage && (
              <p className="text-sm text-destructive text-center" data-testid="text-biometric-error">
                {errorMessage}
              </p>
            )}

            {errorMessage && (
              <Button
                variant="default"
                size="sm"
                onClick={handleBiometricAuth}
                disabled={isAuthenticating}
                data-testid="button-biometric-retry"
              >
                다시 시도
              </Button>
            )}

            <div className="flex items-center justify-between w-full mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-biometric"
              >
                취소
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleFallback}
                className="text-muted-foreground"
                data-testid="button-biometric-fallback"
              >
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                다른 방법으로
              </Button>
            </div>
          </div>
        )}

        {/* ── 라이센스 키 화면 ── */}
        {screen === 'license' && (
          <form onSubmit={handleLicenseSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder={LICENSE_PLACEHOLDER}
              value={licenseInput}
              onChange={(e) => { setLicenseInput(e.target.value); setLicenseError(""); }}
              data-testid="input-license-fallback"
              autoFocus
            />
            {licenseError && <p className="text-sm text-destructive">{licenseError}</p>}
            <div className="flex gap-2 justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setScreen('password'); setLicenseInput(""); setLicenseError(""); }}
                data-testid="button-back-to-password"
              >
                비밀번호로 돌아가기
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
                <Button type="submit" data-testid="button-submit-license">확인</Button>
              </div>
            </div>
          </form>
        )}

        {/* ── 비밀번호 화면 ── */}
        {screen === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="비밀번호 입력"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setErrorMessage(""); }}
              data-testid="input-password"
              autoFocus
              autoComplete="new-password"
            />
            {errorMessage && (
              <p className="text-sm text-destructive" data-testid="text-password-error">{errorMessage}</p>
            )}
            <div className="flex gap-2 justify-between flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {biometricEnabled && biometricAvailable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setErrorMessage(""); setScreen('biometric'); }}
                    data-testid="button-use-biometric"
                  >
                    <Fingerprint className="h-3.5 w-3.5 mr-1" />
                    생체인식
                  </Button>
                )}
                {authMode === 'both' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setErrorMessage(""); setScreen('pattern'); }}
                    data-testid="button-use-pattern"
                  >
                    패턴으로 전환
                  </Button>
                )}
                {authMode === 'password' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setScreen('license')}
                    data-testid="button-license-fallback"
                  >
                    비밀번호 분실?
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-pattern">
                  취소
                </Button>
                <Button type="submit" data-testid="button-submit-password">확인</Button>
              </div>
            </div>
          </form>
        )}

        {/* ── 패턴 화면 ── */}
        {screen === 'pattern' && (
          <>
            <div className="flex flex-col items-center gap-4 py-4">
              <PatternLock
                onPatternComplete={handlePatternComplete}
                correctPattern={getCorrectPattern()}
                showError={showError}
                className="my-4"
              />
              {errorMessage && (
                <p className="text-sm text-destructive" data-testid="text-pattern-error">{errorMessage}</p>
              )}
              <div className="text-xs text-muted-foreground text-center">
                기본 패턴: Z 모양 (좌상단 → 우상단 → 좌하단)
              </div>
            </div>
            <div className="flex justify-between gap-2 flex-wrap">
              <div className="flex gap-2 flex-wrap">
                {biometricEnabled && biometricAvailable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setErrorMessage(""); setScreen('biometric'); }}
                    data-testid="button-use-biometric"
                  >
                    <Fingerprint className="h-3.5 w-3.5 mr-1" />
                    생체인식
                  </Button>
                )}
                {authMode === 'both' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setErrorMessage(""); setScreen('password'); }}
                    data-testid="button-use-password"
                  >
                    비밀번호로 전환
                  </Button>
                )}
              </div>
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

export { checkBiometricSupport, registerBiometricCredential, authenticateWithBiometric };
