import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, CameraOff, Copy, Check, Eye, EyeOff, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "cctv_access_token";
const FRAME_INTERVAL_MS = 200; // 5fps
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const JPEG_QUALITY = 0.65;

function generateToken(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase() +
         Math.random().toString(36).substring(2, 6).toUpperCase();
}

export function CctvPanel() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || generateToken();
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [framesSent, setFramesSent] = useState(0);

  const viewerUrl = `${window.location.origin}/cctv/view?token=${token}`;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  const stopStream = useCallback(() => {
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setWsStatus("disconnected");
    setViewerCount(0);
    setFramesSent(0);
  }, []);

  const startStream = useCallback(async () => {
    setCameraError(null);
    setWsStatus("connecting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: CANVAS_WIDTH }, height: { ideal: CANVAS_HEIGHT } },
        audio: false,
      });
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "카메라 접근 권한이 없습니다. 브라우저 설정에서 허용해 주세요."
        : "카메라를 열 수 없습니다: " + err.message;
      setCameraError(msg);
      setWsStatus("disconnected");
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${window.location.host}/ws/camera?role=broadcaster&token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      setIsStreaming(true);

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      let sent = 0;

      frameTimerRef.current = setInterval(() => {
        if (!videoRef.current || ws.readyState !== WebSocket.OPEN) return;
        ctx.drawImage(videoRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        ws.send(JSON.stringify({ type: "frame", data: dataUrl }));
        sent++;
        if (sent % 25 === 0) setFramesSent(sent);
      }, FRAME_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "viewer_count") setViewerCount(msg.count);
        if (msg.type === "broadcaster_ready") setViewerCount(msg.viewerCount);
      } catch {}
    };

    ws.onerror = () => {
      setCameraError("서버 연결에 실패했습니다. 앱 서버가 실행 중인지 확인하세요.");
      stopStream();
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      setIsStreaming(false);
    };
  }, [token, stopStream]);

  useEffect(() => {
    return () => { stopStream(); };
  }, [stopStream]);

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
      toast({ title: "스트리밍 중단 후 코드를 변경할 수 있습니다.", variant: "destructive" });
      return;
    }
    const newToken = generateToken();
    setToken(newToken);
    toast({ title: "접속 코드가 변경되었습니다", description: "기존 뷰어 링크는 더 이상 작동하지 않습니다." });
  };

  return (
    <div className="space-y-4">
      {/* 제목 + LIVE 배지 */}
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">카운터 감시 카메라</span>
        {isStreaming && (
          <Badge className="bg-red-500 text-white animate-pulse text-xs">LIVE</Badge>
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
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="hidden" />

      {/* 오류 메시지 */}
      {cameraError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {cameraError}
        </div>
      )}

      {/* 시작/중단 버튼 */}
      {!isStreaming ? (
        <Button
          onClick={startStream}
          disabled={wsStatus === "connecting"}
          className="w-full"
          data-testid="button-start-stream"
        >
          <Camera className="h-4 w-4 mr-2" />
          {wsStatus === "connecting" ? "연결 중..." : "감시 시작"}
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
          <p>③ 외부망 접속은 앱이 배포된 경우에만 가능합니다</p>
        </div>
        {isStreaming && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            전송 프레임: {framesSent} · 시청자: {viewerCount}명
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
