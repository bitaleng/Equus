import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, CameraOff, Copy, Check, Eye, EyeOff, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Peer as PeerType, MediaConnection } from "peerjs";

const STORAGE_KEY = "cctv_access_token";

function generateToken(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase() +
         Math.random().toString(36).substring(2, 6).toUpperCase();
}

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  },
};

export function CctvPanel() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<PeerType | null>(null);
  const callsRef = useRef<MediaConnection[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [token, setToken] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || generateToken();
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [peerStatus, setPeerStatus] = useState<"idle" | "connecting" | "live">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const viewerUrl = `${window.location.origin}/cctv/view?token=${token}`;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  const stopStream = useCallback(() => {
    callsRef.current.forEach(c => { try { c.close(); } catch {} });
    callsRef.current = [];

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setPeerStatus("idle");
    setViewerCount(0);
  }, []);

  const startStream = useCallback(async () => {
    setCameraError(null);
    setPeerStatus("connecting");

    // 1. 카메라 열기
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err: any) {
      const msg = err.name === "NotAllowedError"
        ? "카메라 접근 권한이 없습니다. 브라우저 설정에서 허용해 주세요."
        : "카메라를 열 수 없습니다: " + err.message;
      setCameraError(msg);
      setPeerStatus("idle");
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

    // 2. PeerJS 방송자 생성 (token = peer ID)
    const { default: Peer } = await import("peerjs");
    const peer = new Peer(token, PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", () => {
      setIsStreaming(true);
      setPeerStatus("live");

      // 뷰어가 전화를 걸면 카메라 스트림으로 응답
      peer.on("call", (call) => {
        call.answer(stream);
        callsRef.current.push(call);
        setViewerCount(c => c + 1);

        const removeCall = () => {
          callsRef.current = callsRef.current.filter(c => c !== call);
          setViewerCount(c => Math.max(0, c - 1));
        };
        call.on("close", removeCall);
        call.on("error", removeCall);
      });
    });

    peer.on("error", (err: any) => {
      if (err.type === "unavailable-id") {
        setCameraError("이 접속 코드는 이미 사용 중입니다. 잠시 후 다시 시도하거나 코드를 변경해 주세요.");
      } else if (err.type === "network" || err.type === "server-error") {
        setCameraError("네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.");
      } else {
        setCameraError("연결 오류: " + err.message);
      }
      stopStream();
    });

    peer.on("disconnected", () => {
      try { peer.reconnect(); } catch {}
    });
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
      toast({ title: "감시 중단 후 코드를 변경할 수 있습니다.", variant: "destructive" });
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
