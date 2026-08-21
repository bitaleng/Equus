import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, AlertCircle, RefreshCw, Copy, Check, Volume2, VolumeX } from "lucide-react";

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
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // encodeURIComponent 없이 순수 atob — 태블릿과 인코딩 방식 통일
        const offerJson = JSON.parse(atob(offerEncoded));
        const pc = new RTCPeerConnection({ iceServers: PEER_CONFIG.iceServers });
        pcRef.current = pc;

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            const stream = e.streams[0];
            videoRef.current.srcObject = stream;
            const syncAudioFlag = () => {
              setHasAudio(
                stream.getAudioTracks().some((t) => t.readyState === "live") ||
                  stream.getAudioTracks().length > 0
              );
            };
            syncAudioFlag();
            stream.addEventListener("addtrack", syncAudioFlag);
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

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (videoRef.current) {
      videoRef.current.muted = !next;
      videoRef.current.volume = 1;
      void videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4">
      <div className="relative w-full max-w-2xl">
        <video
          ref={videoRef}
          className="w-full object-contain"
          style={{ display: status === "live" ? "block" : "none" }}
          playsInline
          autoPlay
          muted={!soundEnabled}
          onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
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
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-black/60 rounded">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-wider">LAN LIVE</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs text-white"
                data-testid="button-cctv-lan-sound"
                title={hasAudio ? undefined : "마이크 트랙이 아직 없거나 태블릿 마이크 권한이 없을 수 있습니다"}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {soundEnabled ? "소리 끄기" : "소리 켜기"}
                {!hasAudio && <span className="opacity-70">(무음)</span>}
              </button>
              {connectedAt && (
                <span className="text-gray-300 text-xs">{connectedAt.toLocaleTimeString("ko-KR")} 연결</span>
              )}
            </div>
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
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);

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

      // 더미 스트림에 video+audio 트랙이 모두 있어야 함.
      // 오디오 트랙이 없으면 offer SDP에 audio m-line이 빠져
      // 방송자의 마이크 소리를 수신할 수 없음.
      let dummyStream: MediaStream;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 2; canvas.height = 2;
        canvas.getContext("2d")?.fillRect(0, 0, 2, 2);
        dummyStream = (canvas as any).captureStream(1) as MediaStream;
      } catch {
        dummyStream = new MediaStream();
      }
      try {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        // 무음 오실레이터로 live 오디오 트랙 확보 (실제 마이크는 쓰지 않음)
        const osc = audioCtx.createOscillator();
        const silent = audioCtx.createGain();
        silent.gain.value = 0;
        osc.connect(silent);
        silent.connect(dest);
        osc.start();
        dest.stream.getAudioTracks().forEach((t) => dummyStream.addTrack(t));
        (dummyStream as any).__audioCtx = audioCtx;
        (dummyStream as any).__silentOsc = osc;
      } catch {
        // 오디오 더미 생성 실패 시에도 영상 연결은 시도
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
        const syncAudioFlag = () => {
          const live =
            remoteStream.getAudioTracks().some((t) => t.readyState === "live") ||
            remoteStream.getAudioTracks().length > 0;
          setHasAudio(live);
        };
        syncAudioFlag();
        remoteStream.addEventListener("addtrack", syncAudioFlag);
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

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (videoRef.current) {
      videoRef.current.muted = !next;
      videoRef.current.volume = 1;
      void videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <div className="relative w-full max-w-2xl">
        <video
          ref={videoRef}
          className="w-full object-contain"
          style={{ display: status === "live" ? "block" : "none" }}
          playsInline
          autoPlay
          muted={!soundEnabled}
          onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
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
                <p className="text-gray-400 text-sm">태블릿에서 감시 시작 버튼을 누르거나, 원격 제어에서 시작하세요</p>
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
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2 px-3 py-1.5 bg-black/60 rounded">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-wider">LIVE</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className="flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs text-white"
                data-testid="button-cctv-sound"
                title={hasAudio ? undefined : "마이크 트랙이 아직 없거나 태블릿 마이크 권한이 없을 수 있습니다"}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {soundEnabled ? "소리 끄기" : "소리 켜기"}
                {!hasAudio && <span className="opacity-70">(무음)</span>}
              </button>
              {connectedAt && (
                <span className="text-gray-300 text-xs">{connectedAt.toLocaleTimeString("ko-KR")} 연결</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 라우터 진입점 ────────────────────────────────────────────────
function TokenEntryForm({
  mode,
  onSubmit,
}: {
  mode: "view" | "remote";
  onSubmit: (token: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <AlertCircle className="h-10 w-10 text-yellow-400 mx-auto" />
        <p className="text-white font-medium">
          {mode === "view" ? "영상 보기 — 접속 코드 입력" : "원격 제어 — 접속 코드 입력"}
        </p>
        <p className="text-gray-400 text-sm leading-relaxed">
          사이트 링크가 열리지 않을 때, 설치된 앱에서 이 화면을 연 뒤 Discord에 온{" "}
          <span className="text-gray-200">토큰</span>을 붙여넣으면 캐시된 페이지로 접속할 수 있습니다.
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          placeholder="20자리 토큰"
          maxLength={20}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-center font-mono text-sm text-white tracking-wider"
          data-testid="input-cctv-offline-token"
        />
        <button
          type="button"
          disabled={value.length < 16}
          onClick={() => onSubmit(value)}
          className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          data-testid="button-cctv-offline-token-go"
        >
          접속
        </button>
      </div>
    </div>
  );
}

export default function CctvViewPage() {
  const params = new URLSearchParams(window.location.search);
  const lanOffer = params.get("lan");
  const [token, setToken] = useState(() => (params.get("token") || "").trim().toUpperCase());

  if (lanOffer) {
    return <LanViewer offerEncoded={lanOffer} />;
  }

  if (!token) {
    return (
      <TokenEntryForm
        mode="view"
        onSubmit={(t) => {
          const next = t.trim().toUpperCase();
          window.history.replaceState(null, "", `/cctv/view?token=${next}`);
          setToken(next);
        }}
      />
    );
  }

  return <PeerViewer token={token} />;
}
