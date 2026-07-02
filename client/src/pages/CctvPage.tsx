import { useEffect, useRef } from "react";
import { Camera, CameraOff, Copy, Check, Eye, EyeOff, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCctv } from "@/contexts/CctvContext";
import { useState } from "react";

export function CctvPanel() {
  const { toast } = useToast();
  const {
    token, isStreaming, viewerCount, peerStatus, cameraError,
    streamRef, startStream, stopStream, resetToken,
  } = useCctv();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const viewerUrl = `${window.location.origin}/cctv/view?token=${token}`;

  // 패널이 마운트될 때 현재 스트림을 video 태그에 연결
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  // startStream 후 스트림이 생기면 video 태그에 연결
  const handleStart = async () => {
    await startStream();
    // startStream이 완료된 뒤 ref가 세팅됨
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "복사 실패", description: "URL을 직접 선택해서 복사하세요.", variant: "destructive" });
    }
  };

  const handleResetToken = () => {
    if (isStreaming) {
      toast({ title: "감시 중단 후 코드를 변경할 수 있습니다.", variant: "destructive" });
      return;
    }
    resetToken();
    toast({ title: "접속 코드가 변경되었습니다", description: "기존 뷰어 링크는 더 이상 작동하지 않습니다." });
  };

  return (
    <div className="space-y-4">
      {/* 제목 + LIVE 배지 */}
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">카운터 감시 카메라</span>
        {isStreaming && (
          <Badge className="bg-red-500 text-white animate-pulse text-xs no-default-active-elevate">LIVE</Badge>
        )}
      </div>

      {/* 카메라 미리보기 */}
      <div className="relative bg-black rounded-md overflow-hidden aspect-video flex items-center justify-center">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isStreaming ? "block" : "hidden"}`}
          muted
          playsInline
          data-testid="cctv-preview"
        />
        {!isStreaming && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <CameraOff className="h-8 w-8" />
            <span className="text-xs">카메라 꺼짐</span>
          </div>
        )}
        {isStreaming && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 rounded px-2 py-1">
            <Eye className="h-3 w-3 text-white" />
            <span className="text-xs text-white font-medium">{viewerCount}</span>
          </div>
        )}
      </div>

      {/* 오류 메시지 */}
      {cameraError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {cameraError}
        </div>
      )}

      {/* 시작/중단 버튼 */}
      {!isStreaming ? (
        <Button
          onClick={handleStart}
          disabled={peerStatus === "connecting"}
          className="w-full"
          data-testid="button-start-stream"
        >
          <Camera className="h-4 w-4 mr-2" />
          {peerStatus === "connecting" ? "연결 중..." : "감시 시작"}
        </Button>
      ) : (
        <Button
          onClick={stopStream}
          variant="destructive"
          className="w-full"
          data-testid="button-stop-stream"
        >
          <CameraOff className="h-4 w-4 mr-2" />
          감시 중단
        </Button>
      )}

      {/* 외부 접속 주소 */}
      <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground">외부 접속 주소</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 break-all select-all border">
            {showToken ? viewerUrl : viewerUrl.replace(token, "●".repeat(token.length))}
          </code>
          <Button size="icon" variant="ghost" onClick={() => setShowToken(v => !v)} data-testid="button-toggle-token-visibility">
            {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCopyUrl} data-testid="button-copy-url">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            코드: {showToken ? token : "●".repeat(token.length)}
          </span>
          <Button size="sm" variant="ghost" onClick={handleResetToken} className="h-6 text-xs gap-1 px-2" data-testid="button-reset-token">
            <RefreshCw className="h-3 w-3" />
            코드 변경
          </Button>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
          <p>① 위 주소를 스마트폰 브라우저에서 열거나 카카오톡으로 전송</p>
          <p>② 같은 와이파이면 태블릿 IP를 직접 입력해도 됩니다</p>
          <p>③ 외부망 접속도 가능합니다 (서버리스 P2P 연결)</p>
        </div>
        {isStreaming && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            시청자: {viewerCount}명
          </p>
        )}
      </div>
    </div>
  );
}

export default function CctvPage() {
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <CctvPanel />
    </div>
  );
}
