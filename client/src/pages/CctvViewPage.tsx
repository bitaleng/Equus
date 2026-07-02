import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, AlertCircle, RefreshCw } from "lucide-react";

type Status = "connecting" | "waiting" | "live" | "ended" | "error";

export default function CctvViewPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const retryRef = useRef<NodeJS.Timeout | null>(null);
  const PeerClassRef = useRef<any>(null);

  const [status, setStatus] = useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const token = new URLSearchParams(window.location.search).get("token") || "";

  function scheduleRetry() {
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      setRetryCount(c => c + 1);
      attemptConnect(PeerClassRef.current);
    }, 4000);
  }

  function attemptConnect(Peer: any) {
    if (!Peer) return;

    // 이전 연결 정리
    if (callRef.current) { try { callRef.current.close(); } catch {} callRef.current = null; }
    if (peerRef.current) { try { peerRef.current.destroy(); } catch {} peerRef.current = null; }

    const peer = new Peer({
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });
    peerRef.current = peer;

    peer.on("open", () => {
      // 빈 오디오 스트림 생성 (PeerJS call에 스트림이 필요)
      let dummyStream: MediaStream;
      try {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        dummyStream = dest.stream;
      } catch {
        // AudioContext 실패 시 빈 MediaStream 사용
        dummyStream = new MediaStream();
      }

      const call = peer.call(token, dummyStream);
      callRef.current = call;

      if (!call) {
        setStatus("waiting");
        scheduleRetry();
        return;
      }

      call.on("stream", (remoteStream: MediaStream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream;
          videoRef.current.play().catch(() => {});
        }
        setStatus("live");
        setConnectedAt(new Date());
        // 재시도 타이머 취소
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      });

      call.on("close", () => {
        setStatus("ended");
      });

      call.on("error", () => {
        setStatus("waiting");
        scheduleRetry();
      });
    });

    peer.on("error", (err: any) => {
      if (err.type === "peer-unavailable") {
        // 방송자가 아직 시작 안 됨 → 4초 후 재시도
        setStatus("waiting");
        scheduleRetry();
      } else if (err.type === "invalid-id" || err.type === "invalid-key") {
        setStatus("error");
        setErrorMsg("접속 코드가 올바르지 않습니다.");
      } else {
        setStatus("error");
        setErrorMsg("연결 오류가 발생했습니다. 페이지를 새로고침해 주세요.");
      }
    });
  }

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("접속 코드가 없습니다. 올바른 링크를 사용하세요.");
      return;
    }

    import("peerjs").then(({ default: Peer }) => {
      PeerClassRef.current = Peer;
      setStatus("connecting");
      attemptConnect(Peer);
    }).catch(() => {
      setStatus("error");
      setErrorMsg("라이브러리 로드에 실패했습니다.");
    });

    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (callRef.current) { try { callRef.current.close(); } catch {} }
      if (peerRef.current) { try { peerRef.current.destroy(); } catch {} }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="relative w-full max-w-2xl">

        {/* 라이브 영상 */}
        <video
          ref={videoRef}
          className={`w-full object-contain ${status === "live" ? "block" : "hidden"}`}
          playsInline
          autoPlay
          muted={false}
          data-testid="cctv-view-video"
        />

        {/* 비라이브 상태 오버레이 */}
        {status !== "live" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-6">
            {status === "connecting" && (
              <>
                <Wifi className="h-12 w-12 text-gray-400 animate-pulse" />
                <p className="text-gray-300 text-sm">연결 중...</p>
              </>
            )}
            {status === "waiting" && (
              <>
                <Wifi className="h-12 w-12 text-yellow-400 animate-pulse" />
                <p className="text-white font-medium">방송 대기 중</p>
                <p className="text-gray-400 text-sm">
                  태블릿에서 감시 시작 버튼을 눌러주세요
                </p>
                <p className="text-gray-500 text-xs">
                  {retryCount > 0 ? `자동 재시도 중 (${retryCount}회)...` : "잠시 후 자동으로 재시도합니다"}
                </p>
              </>
            )}
            {status === "ended" && (
              <>
                <WifiOff className="h-12 w-12 text-gray-400" />
                <p className="text-white font-medium">스트리밍이 종료되었습니다</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  새로고침
                </button>
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircle className="h-12 w-12 text-red-400" />
                <p className="text-white font-medium">연결 실패</p>
                <p className="text-red-300 text-sm">{errorMsg}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  다시 시도
                </button>
              </>
            )}
          </div>
        )}

        {/* 라이브 상태 바 */}
        {status === "live" && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 bg-black/60 rounded">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-wider">LIVE</span>
            </div>
            {connectedAt && (
              <span className="text-gray-300 text-xs">
                {connectedAt.toLocaleTimeString("ko-KR")} 연결
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
