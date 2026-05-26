import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Key, ShieldCheck, AlertTriangle, Calendar, RefreshCw } from "lucide-react";
import { isStaticHosting, isDemoMode, getDemoRemainingDays, isDemoExpired } from "@/lib/demoMode";
import { 
  validateLicenseKey, 
  getStoredLicense, 
  storeLicense, 
  clearLicense,
  checkStoredLicenseValidity,
  LicenseData 
} from "@/lib/licenseValidation";

interface LicenseGateProps {
  children: React.ReactNode;
}

const LICENSE_STORAGE_KEY = "rest_hotel_license";

export default function LicenseGate({ children }: LicenseGateProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isValidated, setIsValidated] = useState(false);
  const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  
  const isDevelopment = import.meta.env.DEV;
  const isStatic = isStaticHosting();
  const isDemo = isDemoMode();

  useEffect(() => {
    if (isDevelopment) {
      console.log('[LicenseGate] Bypassing license check: development mode');
      setIsValidated(true);
      setIsLoading(false);
      return;
    }
    
    if (isStatic && isDemo) {
      const expired = isDemoExpired();
      if (expired) {
        console.log('[LicenseGate] Demo expired, checking for license');
      } else {
        console.log('[LicenseGate] Demo mode active, remaining days:', getDemoRemainingDays());
        setIsValidated(true);
        setIsLoading(false);
        return;
      }
    }
    
    const storedLicenseData = checkStoredLicenseValidity();
    
    if (storedLicenseData) {
      if (storedLicenseData.isExpired) {
        setError("라이선스가 만료되었습니다. 새 라이선스를 입력해주세요.");
        clearLicense();
        setIsLoading(false);
      } else {
        setLicenseData(storedLicenseData);
        setIsValidated(true);
        
        if (storedLicenseData.daysRemaining <= 30) {
          setShowExpiryWarning(true);
        }
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, [isDevelopment, isStatic, isDemo]);

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
      setError(`라이선스가 만료되었습니다. (만료일: ${result.expiryDate.toLocaleDateString('ko-KR')})`);
      return;
    }
    
    storeLicense(cleanKey);
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
    const formatted = formatLicenseInput(e.target.value);
    setInputKey(formatted);
  };

  const handleReactivate = () => {
    clearLicense();
    setIsValidated(false);
    setLicenseData(null);
    setInputKey("");
    setError(null);
    setShowExpiryWarning(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">라이선스 확인 중...</p>
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
            라이선스 만료 {licenseData.daysRemaining}일 전 (만료일: {licenseData.expiryDate.toLocaleDateString('ko-KR')})
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md" data-testid="license-gate-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Key className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {import.meta.env.VITE_APP_NAME || "라이선스 인증"}
          </CardTitle>
          <CardDescription>
            {import.meta.env.VITE_APP_DESCRIPTION || "라이선스 키를 입력하여 시스템을 활성화하세요."}
          </CardDescription>
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
                placeholder="EQUS-XXXX-XXXX-XXXX"
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

          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground">
              라이선스가 없으신가요?{" "}
              <a href="mailto:support@example.com" className="text-primary hover:underline">
                문의하기
              </a>
            </p>
          </div>
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
    isValid: licenseData?.isValid && !licenseData?.isExpired,
    daysRemaining: licenseData?.daysRemaining ?? 0,
    expiryDate: licenseData?.expiryDate
  };
}

export function clearStoredLicense(): void {
  clearLicense();
}

export async function unregisterDevice(): Promise<{ success: boolean; message?: string }> {
  const licenseKey = getStoredLicense();
  
  if (!licenseKey) {
    return { success: false, message: "등록된 라이선스가 없습니다." };
  }
  
  clearLicense();
  return { success: true, message: "라이선스가 해제되었습니다. 새 라이선스를 입력해주세요." };
}
