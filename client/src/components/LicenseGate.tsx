import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Key, ShieldCheck, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LicenseGateProps {
  children: React.ReactNode;
}

const LICENSE_STORAGE_KEY = "rest_hotel_license";
const DEVICE_ID_KEY = "rest_hotel_device_id";

function generateDeviceId(): string {
  const nav = window.navigator;
  const screen = window.screen;
  const data = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
  ].join("|");
  
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${Math.abs(hash).toString(16)}-${randomPart}`;
}

function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function getDeviceInfo(): string {
  const nav = window.navigator;
  return `${nav.userAgent} | ${nav.platform} | ${nav.language}`;
}

export default function LicenseGate({ children }: LicenseGateProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isValidated, setIsValidated] = useState(false);
  const [licenseKey, setLicenseKey] = useState("");
  const [inputKey, setInputKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const storedLicense = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (storedLicense) {
      setLicenseKey(storedLicense);
      validateLicense(storedLicense);
    } else {
      setIsLoading(false);
    }
  }, []);

  const validateLicense = async (key: string) => {
    setIsValidating(true);
    setError(null);
    
    try {
      const deviceId = getDeviceId();
      const deviceInfo = getDeviceInfo();
      
      const response = await apiRequest("POST", "/api/license/validate", { 
        licenseKey: key, 
        deviceId, 
        deviceInfo 
      });
      const result = await response.json();

      if (result.valid) {
        localStorage.setItem(LICENSE_STORAGE_KEY, key);
        setLicenseKey(key);
        setIsValidated(true);
      } else {
        setError(result.reason || "라이선스 검증에 실패했습니다.");
        localStorage.removeItem(LICENSE_STORAGE_KEY);
      }
    } catch (err) {
      console.error("License validation error:", err);
      setError("서버 연결에 실패했습니다. 인터넷 연결을 확인해주세요.");
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = inputKey.trim().toUpperCase();
    if (cleanKey) {
      validateLicense(cleanKey);
    }
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
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md" data-testid="license-gate-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Key className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">라이선스 인증</CardTitle>
          <CardDescription>
            휴게텔 입실관리 시스템을 사용하려면 라이선스 키를 입력해주세요.
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
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={inputKey}
                onChange={handleInputChange}
                className="text-center text-lg font-mono tracking-wider"
                maxLength={19}
                disabled={isValidating}
                data-testid="input-license-key"
              />
              <p className="text-xs text-muted-foreground text-center">
                구매 시 받은 라이선스 키를 입력해주세요
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={inputKey.length < 19 || isValidating}
              data-testid="button-activate-license"
            >
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  인증 중...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  라이선스 인증
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground">
              라이선스가 없으신가요?{" "}
              <a href="#" className="text-primary hover:underline">
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
  const licenseKey = localStorage.getItem(LICENSE_STORAGE_KEY);
  const deviceId = localStorage.getItem(DEVICE_ID_KEY);
  return { licenseKey, deviceId };
}

export async function unregisterDevice(): Promise<{ success: boolean; message?: string }> {
  const licenseKey = localStorage.getItem(LICENSE_STORAGE_KEY);
  const deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!licenseKey || !deviceId) {
    return { success: false, message: "등록된 라이선스가 없습니다." };
  }

  try {
    const response = await apiRequest("POST", "/api/license/unregister", { licenseKey, deviceId });
    const result = await response.json();

    if (result.success) {
      localStorage.removeItem(LICENSE_STORAGE_KEY);
      return { success: true, message: "기기 등록이 해제되었습니다. 새로운 기기에서 로그인할 수 있습니다." };
    } else {
      return { success: false, message: result.reason || "등록 해제에 실패했습니다." };
    }
  } catch (err) {
    console.error("Unregister error:", err);
    return { success: false, message: "서버 연결에 실패했습니다." };
  }
}
