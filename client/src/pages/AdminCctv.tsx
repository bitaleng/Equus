import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Camera, Copy, Check, Eye, EyeOff, Save, Send, Shield, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getCctvSettings,
  updateCctvSettings,
  buildViewerUrl,
  buildRemoteUrl,
  notifyExternalAddress,
  ensureDeviceNotifyUrl,
  type CctvFacingMode,
  type CctvRemoteSettings,
} from "@/lib/cctvSettings";
import { buildScreenViewerUrl } from "@/lib/screenShare";
import { useCctv } from "@/contexts/CctvContext";

const ADMIN_UNLOCK = "cctv_admin_unlocked";

export default function AdminCctv() {
  const { toast } = useToast();
  const { deviceRole, token, isStreaming, resetToken } = useCctv();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(ADMIN_UNLOCK) === "1");
  const [pin, setPin] = useState("");
  const [settings, setSettings] = useState<CctvRemoteSettings>(getCctvSettings);
  const [showUrls, setShowUrls] = useState(false);
  const [copied, setCopied] = useState<"viewer" | "remote" | "screen" | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    ensureDeviceNotifyUrl();
    setSettings(getCctvSettings());
  }, []);

  const viewerUrl = token ? buildViewerUrl(token) : "(접속 토큰 준비 중)";
  const remoteUrl = token ? buildRemoteUrl(token) : "(토큰 없음)";
  const screenUrl = token ? buildScreenViewerUrl(token) : "(토큰 없음)";

  const handleUnlock = () => {
    // 기존 라이선스 관리자 키와 동일한 소유자 키 사용
    const ok = pin === "equus-admin-2025";
    if (!ok) {
      toast({ title: "비밀번호가 올바르지 않습니다", variant: "destructive" });
      return;
    }
    sessionStorage.setItem(ADMIN_UNLOCK, "1");
    setUnlocked(true);
  };

  const handleSave = () => {
    setSaving(true);
    updateCctvSettings(settings);
    toast({ title: "관리자 감시 설정이 저장되었습니다" });
    setSaving(false);
  };

  const handleResetToken = () => {
    if (deviceRole !== "broadcaster") {
      toast({ title: "스마트폰 뷰어 기기에는 송출 코드가 없습니다.", variant: "destructive" });
      return;
    }
    if (isStreaming) {
      toast({ title: "감시를 중단한 뒤 코드를 변경하세요.", variant: "destructive" });
      return;
    }
    const confirmed = window.confirm(
      "접속 코드를 변경하면 기존 영상 보기·원격 제어·원격화면 주소가 모두 무효화됩니다. 변경할까요?"
    );
    if (!confirmed) return;
    resetToken();
    toast({
      title: "접속 코드가 변경되었습니다",
      description: "새 주소가 외부 수신처로 전송됩니다.",
    });
  };

  const copy = async (kind: "viewer" | "remote" | "screen") => {
    const url = kind === "viewer" ? viewerUrl : kind === "remote" ? remoteUrl : screenUrl;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "복사 실패", variant: "destructive" });
    }
  };

  const testNotify = async () => {
    if (!token) {
      toast({ title: "토큰이 없습니다", variant: "destructive" });
      return;
    }
    setTesting(true);
    updateCctvSettings(settings);
    const result = await notifyExternalAddress({
      viewerUrl: buildViewerUrl(token),
      remoteUrl: buildRemoteUrl(token),
      screenUrl: buildScreenViewerUrl(token),
      token,
      event: "token_ready",
    });
    setTesting(false);
    if (result.ok) {
      toast({ title: "외부 주소로 토큰을 전송했습니다" });
    } else {
      toast({ title: "전송 실패", description: result.error, variant: "destructive" });
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              관리자 감시 설정
            </CardTitle>
            <CardDescription>소유자 전용 원격 제어·접속 주소 설정</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cctv-pin">관리자 비밀번호</Label>
              <Input
                id="cctv-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="비밀번호 입력"
                data-testid="input-cctv-admin-pin"
              />
            </div>
            <Button onClick={handleUnlock} className="w-full" data-testid="button-cctv-admin-unlock">
              잠금 해제
            </Button>
            <Link href="/settings">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                설정으로
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Camera className="h-5 w-5" />
              관리자 감시 설정
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              외부 원격 제어 · 토큰 자동 전송 · 상시 접속
            </p>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              설정
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">이 기기의 역할</CardTitle>
            <CardDescription>
              스마트폰은 자동으로 뷰어, 태블릿·PC는 송출기로 등록됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm text-muted-foreground">자동 판별 결과</span>
              <span className="text-sm font-semibold">
                {deviceRole === "broadcaster" ? "송출 기기 (태블릿/PC)" : "뷰어 기기 (스마트폰)"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">상시 / 원격 제어</CardTitle>
            <CardDescription>
              와이파이·유료 인터넷이 연결된 동안 감시를 유지하고, 외부에서 시작/중단할 수 있습니다.
              태블릿 앱은 켜져 있어야 합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>상시 감시 모드</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  온라인일 때 자동 시작·끊김 시 자동 재연결
                </p>
              </div>
              <Switch
                checked={settings.cctvAlwaysOn}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, cctvAlwaysOn: v }))}
                data-testid="switch-cctv-always-on"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>외부 원격 제어</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  감시가 꺼져 있어도 제어 채널을 유지
                </p>
              </div>
              <Switch
                checked={settings.cctvRemoteEnabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, cctvRemoteEnabled: v }))}
                data-testid="switch-cctv-remote"
              />
            </div>
            <div className="space-y-2">
              <Label>카메라</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={settings.cctvFacingMode === "user" ? "default" : "outline"}
                  onClick={() => setSettings((s) => ({ ...s, cctvFacingMode: "user" as CctvFacingMode }))}
                >
                  전면
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={settings.cctvFacingMode === "environment" ? "default" : "outline"}
                  onClick={() => setSettings((s) => ({ ...s, cctvFacingMode: "environment" as CctvFacingMode }))}
                >
                  후면
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">토큰 자동 전송 (Discord)</CardTitle>
            <CardDescription>
              송출 태블릿에서 앱 설치·업데이트·종료 후 재실행 시 Discord 웹훅이 자동 입력되고,
              뷰어/원격제어/원격화면 주소가 Discord로 바로 전송됩니다. (테스트 전송과 동일)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label>감시 시작 시에도 전송</Label>
              <Switch
                checked={settings.cctvNotifyOnStart}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, cctvNotifyOnStart: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notify-url">이 기기 전용 직접 통지 URL</Label>
              <Input
                id="notify-url"
                value={settings.cctvNotifyUrl}
                onChange={(e) => setSettings((s) => ({ ...s, cctvNotifyUrl: e.target.value }))}
                placeholder="Discord 웹훅 URL (비우면 기본값 자동 입력)"
                data-testid="input-cctv-notify-url"
              />
              <p className="text-xs text-muted-foreground">
                비어 있으면 앱 실행 시 기본 Discord 웹훅이 자동으로 채워집니다.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={testNotify}
              disabled={testing}
              data-testid="button-cctv-test-notify"
            >
              <Send className="h-4 w-4 mr-2" />
              {testing ? "전송 중..." : "지금 테스트 전송"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">접속 URL</CardTitle>
            <CardDescription>외부 기기에서 사용합니다. 앱 비밀번호 없이 토큰만으로 접근합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setShowUrls((v) => !v)}>
                {showUrls ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                {showUrls ? "숨기기" : "표시"}
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">뷰어 (영상)</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs border rounded px-2 py-2 break-all bg-muted/40">
                  {showUrls ? viewerUrl : "••••••••"}
                </code>
                <Button size="icon" variant="outline" onClick={() => copy("viewer")} disabled={!token}>
                  {copied === "viewer" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">원격 제어 (시작/중단)</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs border rounded px-2 py-2 break-all bg-muted/40">
                  {showUrls ? remoteUrl : "••••••••"}
                </code>
                <Button size="icon" variant="outline" onClick={() => copy("remote")} disabled={!token}>
                  {copied === "remote" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">원격화면 (사용자가 보는 앱 화면)</Label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs border rounded px-2 py-2 break-all bg-muted/40">
                  {showUrls ? screenUrl : "••••••••"}
                </code>
                <Button size="icon" variant="outline" onClick={() => copy("screen")} disabled={!token}>
                  {copied === "screen" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {token && (
              <a href={remoteUrl} className="text-xs text-primary underline">
                원격 제어 페이지 열기
              </a>
            )}
            <div className="pt-2 border-t">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleResetToken}
                disabled={deviceRole !== "broadcaster" || isStreaming}
                data-testid="button-cctv-admin-reset-token"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                접속 코드 변경
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                관리자 전용 기능입니다. 변경하면 기존 Discord 링크가 모두 무효화됩니다.
              </p>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Netlify 다운 / 오프라인 접속</p>
              <p>
                스마트폰에도 이 앱을 한 번 설치·실행해 두면 Service Worker가
                `/cctv/view`·`/cctv/remote`·`/screen/view` 페이지를 캐시합니다.
              </p>
              <p>
                이후 사이트 링크가 안 열릴 때는 설치된 앱 단축 아이콘(영상 보기/원격 제어)을 열고,
                Discord에 온 토큰만 붙여넣으면 됩니다. (PeerJS 연결용 인터넷은 필요)
              </p>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} className="w-full" disabled={saving} data-testid="button-cctv-admin-save">
          <Save className="h-4 w-4 mr-2" />
          설정 저장
        </Button>
      </div>
    </div>
  );
}
