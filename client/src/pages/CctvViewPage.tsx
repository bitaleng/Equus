import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, AlertCircle, RefreshCw, Copy, Check } from "lucide-react";

type Status = "connecting" | "waiting" | "live" | "ended" | "error";

const PEER_CONFIG = {
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
};

// LAN 모드에서 host 후보만 유지 (태블릿과 동일한 필터)
function filterHostCandidates(sdp: string): string {
  return sdp.split("\n").filter(line => {
    if (!line.startsWith("a=candidate:")) return true;
    return line.includes(" host ");
  }).join("\n");
}

// ─── LAN 직접 모드 뷰어 ──────────────────────────────────────────
function LanViewer({ offerEncoded }: { offerEncoded: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [answerCode, setAnswerCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // encodeURIComponent 없이 순수 atob — 태블릿과 인코딩 방식 통일
        const offerJson = JSON.parse(atob(offerEncoded));
        const pc = new RTCPeerConnection({ iceServers: PEER_CONFIG.iceServers });
        pcRef.current = pc;

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0];
            videoRef.current.play().catch(() => {});
            setStatus("live");
            setConnectedAt(new Date());
          }
        };

        pc.oniceconnectionstatechange = () => {
          const s = pc.iceConnectionState;
          if (s === "disconnected" || s === "failed") setStatus("ended");
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offerJson));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // ICE 수집 완료 대기 (최대 6초)
        await new Promise<void>(resolve => {
          if (pc.iceGatheringState === "complete") { resolve(); return; }
          const check = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", check);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", check);
          setTimeout(resolve, 6000);
        });

        const desc = pc.localDescription!;
        // host 후보만 포함, 순수 btoa (태블릿 applyLanAnswer와 동일 방식)
        const encoded = btoa(JSON.stringify({ type: desc.type, sdp: filterHostCandidates(desc.sdp) }));
        setAnswerCode(encoded);
        setStatus("waiting");
      } catch {
        setStatus("error");
      }
    })();

    return () => {
      if (pcRef.current) { try { pcRef.current.close(); } catch {} }
    };
  }, [offerEncoded]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // 클립보드 실패 시 textarea 선택으로 대체
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="relative w-full max-w-2xl">
        <video
          ref={videoRef}
          className={`w-full object-contain ${status === "live" ? "block" : "hidden"}`}
          playsInline autoPlay muted={false}
          data-testid="cctv-lan-video"
        />

        {status !== "live" && (
          <div className="flex flex-col items-center gap-5 py-10 text-center w-full max-w-sm mx-auto">
            {status === "connecting" && (
              <>
                <Wifi className="h-12 w-12 text-gray-400 animate-pulse" />
                <p className="text-gray-300 text-sm">Answer 코드 생성 중...</p>
              </>
            )}

            {status === "waiting" && answerCode && (
              <>
                <Wifi className="h-10 w-10 text-blue-400" />
                <p className="text-white font-semibold text-base">Answer 코드</p>
                <p className="text-gray-400 text-xs leading-relaxed">
                  아래 버튼으로 복사 후 카카오톡으로 태블릿에 전송하세요.<br/>
                  태블릿 입력창에 붙여넣기 → 연결 확인 버튼 클릭
                </p>

                {/* 전체 코드가 표시되는 textarea - 직접 선택 복사도 가능 */}
                <textarea
                  readOnly
                  value={answerCode}
                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                  className="w-full text-xs font-mono bg-gray-900 text-gray-200 border border-gray-700 rounded-lg p-3 resize-none h-28 leading-relaxed"
                  data-testid="textarea-answer-code"
                />

                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm rounded-lg font-semibold active:opacity-80"
                  data-testid="button-copy-answer"
                >
                  {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  {copied ? "복사됨! 카카오톡으로 전송하세요" : "Answer 코드 복사"}
                </button>
              </>
            )}

            {status === "ended" && (
              <>
                <WifiOff className="h-12 w-12 text-gray-400" />
                <p className="text-white font-medium">연결이 끊겼습니다</p>
                <button onClick={() => window.location.reload()} className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-sm rounded-md">
                  <RefreshCw className="h-4 w-4" /> 새로고침
                </button>
              </>
            )}

            {status === "error" && (
              <>
                <AlertCircle className="h-12 w-12 text-red-400" />
                <p className="text-white font-medium">접속 코드 오류</p>
                <p className="text-red-300 text-sm">태블릿에서 URL을 다시 복사해 전송해 주세요.</p>
                <button onClick={() => window.location.reload()} className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-sm rounded-md">
                  <RefreshCw className="h-4 w-4" /> 다시 시도
                </button>
              </>
            )}
          </div>
        )}

        {status === "live" && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 bg-black/60 rounded">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-wider">LAN LIVE</span>
            </div>
            {connectedAt && (
              <span className="text-gray-300 text-xs">{connectedAt.toLocaleTimeString("ko-KR")} 연결</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── P2P 인터넷 모드 뷰어 ────────────────────────────────────────
function PeerViewer({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const retryRef = useRef<NodeJS.Timeout | null>(null);
  const connectingRef = useRef(false);
  const PeerClassRef = useRef<any>(null);

  const [status, setStatus] = useState<Status>("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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
    if (!Peer || connectingRef.current) return;
    connectingRef.current = true;

    if (callRef.current) { try { callRef.current.close(); } catch {} callRef.current = null; }
    if (peerRef.current) { try { peerRef.current.destroy(); } catch {} peerRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }

    const peerConfig = { config: { iceServers: PEER_CONFIG.iceServers } };
    const peer = new Peer(peerConfig);
    peerRef.current = peer;

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

      // 비디오 트랙을 포함한 더미 스트림 필수:
      // 오디오 전용 스트림으로 call하면 SDP에 video 섹션이 없어
      // 방송자의 영상을 수신할 수 없음 → canvas로 1×1 더미 비디오 트랙 생성
      let dummyStream: MediaStream;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 2; canvas.height = 2;
        canvas.getContext("2d")?.fillRect(0, 0, 2, 2);
        dummyStream = (canvas as any).captureStream(1);
      } catch {
        try {
          const audioCtx = new AudioContext();
          dummyStream = audioCtx.createMediaStreamDestination().stream;
        } catch { dummyStream = new MediaStream(); }
      }

      const call = peer.call(token, dummyStream);
      callRef.current = call;

      if (!call) {
        connectingRef.current = false;
        setStatus("waiting");
        scheduleRetry();
        return;
      }

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
        // 자동 재시도 (수동 종료가 아닌 경우)
        setStatus("waiting");
        scheduleRetry();
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
        setStatus("waiting");
        scheduleRetry();
      } else if (err.type === "network" || err.type === "socket-error" || err.type === "socket-closed") {
        setStatus("error");
        setErrorMsg(`인터넷 연결을 확인해 주세요. (${err.type})`);
      } else if (err.type === "unavailable-id" || err.type === "invalid-id") {
        setStatus("error");
        setErrorMsg("접속 코드가 올바르지 않습니다.");
      } else {
        setStatus("waiting");
        scheduleRetry();
      }
    });
  }

  useEffect(() => {
    import("peerjs").then(({ default: Peer }) => {
      PeerClassRef.current = Peer;
      attemptConnect(Peer);
    }).catch(() => {
      setStatus("error");
      setErrorMsg("라이브러리 로드에 실패했습니다. 새로고침 해주세요.");
    });
    return () => { cleanupCurrent(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="relative w-full max-w-2xl">
        <video
          ref={videoRef}
          className={`w-full object-contain ${status === "live" ? "block" : "hidden"}`}
          playsInline autoPlay muted={false}
          data-testid="cctv-view-video"
        />
        {status !== "live" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-6">
            {status === "connecting" && (
              <><Wifi className="h-12 w-12 text-gray-400 animate-pulse" /><p className="text-gray-300 text-sm">연결 중...</p></>
            )}
            {status === "waiting" && (
              <>
                <Wifi className="h-12 w-12 text-yellow-400 animate-pulse" />
                <p className="text-white font-medium">방송 대기 중</p>
                <p className="text-gray-400 text-sm">태블릿에서 감시 시작 버튼을 눌러주세요</p>
                <p className="text-gray-500 text-xs">
                  {retryCount > 0 ? `자동 재시도 중 (${retryCount}회)...` : "잠시 후 자동으로 재시도합니다"}
                </p>
              </>
            )}
            {status === "ended" && (
              <>
                <WifiOff className="h-12 w-12 text-gray-400" />
                <p className="text-white font-medium">스트리밍이 종료되었습니다</p>
                <button onClick={() => window.location.reload()} className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors">
                  <RefreshCw className="h-4 w-4" /> 새로고침
                </button>
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircle className="h-12 w-12 text-red-400" />
                <p className="text-white font-medium">연결 실패</p>
                <p className="text-red-300 text-sm">{errorMsg}</p>
                <button onClick={() => window.location.reload()} className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors">
                  <RefreshCw className="h-4 w-4" /> 다시 시도
                </button>
              </>
            )}
          </div>
        )}
        {status === "live" && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 bg-black/60 rounded">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-wider">LIVE</span>
            </div>
            {connectedAt && (
              <span className="text-gray-300 text-xs">{connectedAt.toLocaleTimeString("ko-KR")} 연결</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 라우터 진입점 ────────────────────────────────────────────────
export default function CctvViewPage() {
  const params = new URLSearchParams(window.location.search);
  const lanOffer = params.get("lan");
  const token = params.get("token");

  if (lanOffer) {
    return <LanViewer offerEncoded={lanOffer} />;
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center px-6">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-white font-medium">잘못된 접속 링크</p>
          <p className="text-gray-400 text-sm mt-2">태블릿 앱에서 올바른 링크를 복사해 주세요.</p>
        </div>
      </div>
    );
  }

  return <PeerViewer token={token} />;
}
