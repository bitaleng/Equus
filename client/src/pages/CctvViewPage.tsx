import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, AlertCircle, RefreshCw } from "lucide-react";

type Status = "connecting" | "waiting" | "live" | "ended" | "error";

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  },
};

export default function CctvViewPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const retryRef = useRef<NodeJS.Timeout | null>(null);
  const connectingRef = useRef(false); // 중복 연결 시도 방지
  const PeerClassRef = useRef<any>(null);

  const [status, setStatus] = useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const token = new URLSearchParams(window.location.search).get("token") || "";

  function cleanupCurrent() {
    connectingRef.current = false;
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    if (callRef.current) { try { callRef.current.close(); } catch {} callRef.current = null; }
    if (peerRef.current) { try { peerRef.current.destroy(); } catch {} peerRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
  }

  function scheduleRetry() {
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      setRetryCount(c => c + 1);
      attemptConnect(PeerClassRef.current);
    }, 5000);
  }

  function attemptConnect(Peer: any) {
    if (!Peer) return;
    if (connectingRef.current) return; // 이미 연결 시도 중이면 skip
    connectingRef.current = true;

    // 이전 연결 정리 (타이머 제외)
    if (callRef.current) { try { callRef.current.close(); } catch {} callRef.current = null; }
    if (peerRef.current) { try { peerRef.current.destroy(); } catch {} peerRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }

    const peer = new Peer(PEER_CONFIG);
    peerRef.current = peer;

    // 연결 타임아웃 — 15초 안에 open 안 오면 재시도
    const openTimeout = setTimeout(() => {
      if (connectingRef.current) {
        connectingRef.current = false;
        try { peer.destroy(); } catch {}
        setStatus("waiting");
        scheduleRetry();
      }
    }, 15000);

    peer.on("open", () => {
      clearTimeout(openTimeout);

      // 빈 오디오 스트림 생성 (PeerJS call 에 스트림 필요)
      let dummyStream: MediaStream;
      try {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        dummyStream = dest.stream;
      } catch {
        dummyStream = new MediaStream();
      }

      const call = peer.call(token, dummyStream);
      callRef.current = call;

      if (!call) {
        connectingRef.current = false;
        setStatus("waiting");
        scheduleRetry();
        return;
      }

      // 스트림 수신 타임아웃 — 20초 안에 영상 안 오면 재시도
      const streamTimeout = setTimeout(() => {
        connectingRef.current = false;
        setStatus("waiting");
        scheduleRetry();
      }, 20000);

      call.on("stream", (remoteStream: MediaStream) => {
        clearTimeout(streamTimeout);
        connectingRef.current = false;
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream;
          videoRef.current.play().catch(() => {});
        }
        setStatus("live");
        setConnectedAt(new Date());
        if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      });

      call.on("close", () => {
        clearTimeout(streamTimeout);
        connectingRef.current = false;
        setStatus("ended");
      });

      call.on("error", () => {
        clearTimeout(streamTimeout);
        connectingRef.current = false;
        setStatus("waiting");
        scheduleRetry();
      });
    });

    peer.on("error", (err: any) => {
      clearTimeout(openTimeout);
      connectingRef.current = false;

      if (err.type === "peer-unavailable") {
        // 방송자가 아직 시작 안 됨 → 대기 후 재시도
        setStatus("waiting");
        scheduleRetry();
      } else if (err.type === "network" || err.type === "socket-error" || err.type === "socket-closed") {
        setStatus("error");
        setErrorMsg(`인터넷 연결을 확인해 주세요. (${err.type})`);
      } else if (err.type === "unavailable-id" || err.type === "invalid-id") {
        setStatus("error");
        setErrorMsg("접속 코드가 올바르지 않습니다.");
      } else {
        // 알 수 없는 오류 — 자동 재시도
        setStatus("waiting");
        scheduleRetry();
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
      setErrorMsg("라이브러리 로드에 실패했습니다. 페이지를 새로고침해 주세요.");
    });

    return () => { cleanupCurrent(); };
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
