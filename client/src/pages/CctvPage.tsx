import { useEffect, useRef, useState } from "react";
import {
  Camera, CameraOff, Copy, Check, Eye, EyeOff, RefreshCw,
  Video, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCctv, type CctvMode } from "@/contexts/CctvContext";

// ── P2P 모드 패널 ─────────────────────────────────────────────
function PeerJsPanel() {
  const { toast } = useToast();
  const { token, isStreaming, viewerCount, peerStatus, startStream, stopStream, resetToken } = useCctv();
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const viewerUrl = `${window.location.origin}/cctv/view?token=${token}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "복사 실패", description: "URL을 직접 선택해서 복사하세요.", variant: "destructive" });
    }
  };

  const handleReset = () => {
    if (isStreaming) {
      toast({ title: "감시 중단 후 코드를 변경할 수 있습니다.", variant: "destructive" });
      return;
    }
    resetToken();
    toast({ title: "접속 코드가 변경되었습니다", description: "기존 뷰어 링크는 더 이상 작동하지 않습니다." });
  };

  return (
    <div className="space-y-3">
      {peerStatus === "disconnected" && isStreaming && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          P2P 서버 연결이 끊겼습니다. 자동 재연결 중...
        </div>
      )}

      {!isStreaming ? (
        <Button onClick={() => startStream("peerjs")} disabled={peerStatus === "connecting"} className="w-full" data-testid="button-start-peerjs">
          <Camera className="h-4 w-4 mr-2" />
          {peerStatus === "connecting" ? "P2P 서버 연결 중..." : "감시 시작 (인터넷 필요)"}
        </Button>
      ) : (
        <Button onClick={stopStream} variant="destructive" className="w-full" data-testid="button-stop-stream">
          <CameraOff className="h-4 w-4 mr-2" />
          감시 중단
        </Button>
      )}

      <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground">스마트폰 접속 주소</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 break-all select-all border">
            {showToken ? viewerUrl : viewerUrl.replace(token, "●".repeat(Math.min(token.length, 10)))}
          </code>
          <Button size="icon" variant="ghost" onClick={() => setShowToken(v => !v)}>
            {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCopy} data-testid="button-copy-url">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">시청자: {viewerCount}명</span>
          <Button size="sm" variant="ghost" onClick={handleReset} className="h-6 text-xs gap-1 px-2" data-testid="button-reset-token">
            <RefreshCw className="h-3 w-3" />
            코드 변경
          </Button>
        </div>
        <div className="text-xs text-muted-foreground pt-1 border-t space-y-0.5">
          <p>① 위 주소를 복사해 스마트폰 카카오톡 등으로 전송</p>
          <p>② 같은 와이파이·외부망 모두 접속 가능합니다 (P2P 자동)</p>
        </div>
      </div>
    </div>
  );
}

// ── LAN 직접 모드 패널 ──────────────────────────────────────────
function LanPanel() {
  const { toast } = useToast();
  const {
    isStreaming, peerStatus, cameraError,
    lanOffer, lanAnswerInput, setLanAnswerInput,
    applyLanAnswer, startStream, stopStream,
  } = useCctv();

  const [answerCopied, setAnswerCopied] = useState(false);
  const [offerCopied, setOfferCopied] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // 뷰어가 열 URL
  const viewerUrl = lanOffer
    ? `${window.location.origin}/cctv/view?lan=${lanOffer}`
    : null;

  const copyOffer = async () => {
    if (!viewerUrl) return;
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setOfferCopied(true);
      setTimeout(() => setOfferCopied(false), 2000);
    } catch {
      toast({ title: "복사 실패", description: "URL을 직접 선택해서 복사하세요.", variant: "destructive" });
    }
  };

  const handleApply = async () => {
    if (!lanAnswerInput.trim()) {
      toast({ title: "Answer 코드를 입력해 주세요.", variant: "destructive" });
      return;
    }
    await applyLanAnswer();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-0.5">LAN 직접 연결 — 인터넷 불필요</p>
        <p>같은 와이파이 안에서만 작동. 스마트폰도 같은 와이파이 연결 필수.</p>
      </div>

      {!isStreaming ? (
        <Button
          onClick={() => startStream("lan")}
          disabled={peerStatus === "connecting"}
          className="w-full"
          data-testid="button-start-lan"
        >
          <Wifi className="h-4 w-4 mr-2" />
          {peerStatus === "connecting" ? "준비 중..." : "LAN 감시 시작"}
        </Button>
      ) : (
        <Button onClick={stopStream} variant="destructive" className="w-full" data-testid="button-stop-lan">
          <WifiOff className="h-4 w-4 mr-2" />
          감시 중단
        </Button>
      )}

      {cameraError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {cameraError}
        </div>
      )}

      {lanOffer && (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
          {/* Step 1: 스마트폰에 URL 전송 */}
          <div>
            <p className="text-xs font-semibold mb-1">① 아래 주소를 스마트폰으로 전송 (카카오톡 등)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 break-all select-all border line-clamp-2 max-h-12 overflow-hidden">
                {viewerUrl}
              </code>
              <Button size="icon" variant="ghost" onClick={copyOffer} data-testid="button-copy-lan-offer">
                {offerCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Step 2: 스마트폰 화면의 Answer 코드 입력 */}
          <div>
            <p className="text-xs font-semibold mb-1">② 스마트폰 화면에 나온 Answer 코드를 여기에 붙여넣기</p>
            <textarea
              ref={answerRef}
              value={lanAnswerInput}
              onChange={e => setLanAnswerInput(e.target.value)}
              placeholder="스마트폰 뷰어에서 복사한 Answer 코드..."
              className="w-full text-xs border rounded p-2 bg-background resize-none h-16 font-mono"
              data-testid="input-lan-answer"
            />
            <Button size="sm" onClick={handleApply} className="w-full mt-1" data-testid="button-apply-lan-answer">
              연결 확인
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 공통 카메라 미리보기 + 오류 + 탭 UI ──────────────────────────
export function CctvPanel() {
  const { isStreaming, cameraError, streamRef, mode } = useCctv();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeMode, setActiveMode] = useState<CctvMode>("peerjs");

  // 스트리밍 중이면 탭 변경 불가
  const handleModeChange = (v: string) => {
    if (!isStreaming) setActiveMode(v as CctvMode);
  };

  // 스트리밍 활성 시 video 태그에 stream 연결
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  return (
    <div className="space-y-4">
      {/* 제목 */}
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">카운터 감시 카메라</span>
        {isStreaming && (
          <Badge className="bg-red-500 text-white animate-pulse text-xs no-default-active-elevate">LIVE</Badge>
        )}
        {isStreaming && (
          <span className="text-xs text-muted-foreground ml-auto">
            {mode === "lan" ? "LAN 직접" : "P2P 인터넷"}
          </span>
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
      </div>

      {/* 오류 메시지 */}
      {cameraError && mode === "peerjs" && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {cameraError}
        </div>
      )}

      {/* 모드 탭 */}
      {!isStreaming && (
        <Tabs value={activeMode} onValueChange={handleModeChange}>
          <TabsList className="w-full">
            <TabsTrigger value="peerjs" className="flex-1 text-xs">
              P2P 인터넷 모드
            </TabsTrigger>
            <TabsTrigger value="lan" className="flex-1 text-xs">
              LAN 직접 모드
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* 활성 모드 패널 */}
      {(activeMode === "peerjs" || (isStreaming && mode === "peerjs")) && <PeerJsPanel />}
      {(activeMode === "lan" || (isStreaming && mode === "lan")) && <LanPanel />}
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
