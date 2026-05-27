import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isDemoMode, isDemoExpired, getDemoPassword, getDemoRemainingDays, initDemoMode } from "@/lib/demoMode";

interface PasswordAuthProps {
  onAuthenticated: () => void;
}

export function PasswordAuth({ onAuthenticated }: PasswordAuthProps) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoExpired, setDemoExpired] = useState(false);
  const [remainingDays, setRemainingDays] = useState(7);
  const { toast } = useToast();

  useEffect(() => {
    if (isDemoMode()) {
      initDemoMode();
      setDemoMode(true);
      setDemoExpired(isDemoExpired());
      setRemainingDays(getDemoRemainingDays());
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let storedPassword: string;
      
      if (demoMode) {
        storedPassword = getDemoPassword();
      } else {
        storedPassword = localStorage.getItem("staff_password") || "12345678";
      }
      
      if (password === storedPassword) {
        localStorage.setItem("authenticated", "true");
        onAuthenticated();
      } else {
        toast({
          title: "인증 실패",
          description: demoExpired 
            ? "체험 기간이 만료되었습니다. 관리자에게 문의하세요."
            : "비밀번호가 올바르지 않습니다.",
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Lock className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">{import.meta.env.VITE_APP_NAME || 'LOCKER MANAGER'}</CardTitle>
          <CardDescription className="text-center">
            {demoMode ? (
              demoExpired ? (
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="비밀번호 (8자리)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={8}
                disabled={isLoading}
                autoFocus
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !password}
              data-testid="button-login"
            >
              {isLoading ? "확인 중..." : "로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
