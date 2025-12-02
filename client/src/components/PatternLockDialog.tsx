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
import { Fingerprint } from "lucide-react";
import PatternLock from "@/components/PatternLock";

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
      // No credential registered, try to register first
      return await registerBiometricCredential();
    }

    // Create a random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    // Convert stored credential ID back to Uint8Array
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
          name: "휴게텔 관리 시스템",
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: "manager",
          displayName: "관리자"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },  // ES256
          { alg: -257, type: "public-key" } // RS256
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
      // Store credential ID in localStorage
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
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      const available = await checkBiometricSupport();
      setBiometricAvailable(available);
      const enabled = localStorage.getItem("webauthn_enabled") === "true";
      setBiometricEnabled(enabled);
    };
    checkBiometric();
  }, []);

  // Get the correct pattern from localStorage
  const getCorrectPattern = (): number[] => {
    const saved = localStorage.getItem("staff_pattern");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [0, 1, 2, 4, 6];
      }
    }
    return [0, 1, 2, 4, 6];
  };

  const handlePatternComplete = (pattern: number[]) => {
    const correctPattern = getCorrectPattern();
    
    if (JSON.stringify(pattern) === JSON.stringify(correctPattern)) {
      onPatternCorrect();
      onOpenChange(false);
      setErrorMessage("");
      setShowError(false);
    } else {
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

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);
    setErrorMessage("");
    
    try {
      const success = await authenticateWithBiometric();
      if (success) {
        onPatternCorrect();
        onOpenChange(false);
      } else {
        setErrorMessage("생체인증에 실패했습니다. 다른 방법을 사용하세요.");
      }
    } catch (error) {
      setErrorMessage("생체인증을 사용할 수 없습니다.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Auto-trigger biometric auth when dialog opens if enabled
  useEffect(() => {
    if (open && biometricEnabled && biometricAvailable) {
      // Small delay to let dialog render first
      const timer = setTimeout(() => {
        handleBiometricAuth();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, biometricEnabled, biometricAvailable]);

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
              {/* Biometric button if available */}
              {biometricAvailable && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-16 text-lg gap-3"
                  onClick={handleBiometricAuth}
                  disabled={isAuthenticating}
                  data-testid="button-biometric-auth"
                >
                  <Fingerprint className="h-6 w-6" />
                  {isAuthenticating ? "인증 중..." : "생체인증으로 잠금해제"}
                </Button>
              )}

              {biometricAvailable && (
                <div className="text-xs text-muted-foreground">또는</div>
              )}

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
                기본 패턴: Z 모양 (좌상단 → 우상단 → 좌하단)
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

// Export helper functions for use in Settings page
export { checkBiometricSupport, registerBiometricCredential, authenticateWithBiometric };
