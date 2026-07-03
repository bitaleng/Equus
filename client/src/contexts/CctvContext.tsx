import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import type { Peer as PeerType, MediaConnection } from "peerjs";

const STORAGE_KEY = "cctv_access_token";

// 20자 토큰 — 충분히 길어서 추측 불가 (36^20 = 약 1.3×10^31 경우의 수)
function generateToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 20).toUpperCase();
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// STUN + 무료 TURN(OpenRelay) — 같은 와이파이·외부망 모두 대응
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

interface CctvContextValue {
  token: string;
  isStreaming: boolean;
  viewerCount: number;
  peerStatus: "idle" | "connecting" | "live";
  cameraError: string | null;
  streamRef: React.MutableRefObject<MediaStream | null>;
  startStream: () => Promise<void>;
  stopStream: () => void;
  resetToken: () => void;
}

const CctvContext = createContext<CctvContextValue | null>(null);

export function CctvProvider({ children }: { children: React.ReactNode }) {
  const peerRef = useRef<PeerType | null>(null);
  const callsRef = useRef<MediaConnection[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [token, setToken] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEY) || generateToken()
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [peerStatus, setPeerStatus] = useState<"idle" | "connecting" | "live">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  // 시청자 카운트 정기 정리 — ICE 실패로 close/error 이벤트가 안 와도 5초마다 정확하게 유지
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      callsRef.current = callsRef.current.filter(call => {
        const state = (call as any).peerConnection?.connectionState;
        // connected·connecting·new 만 살아있는 연결로 인정
        return state === "connected" || state === "connecting" || state === "new";
      });
      setViewerCount(callsRef.current.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isStreaming]);

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
    setIsStreaming(false);
    setPeerStatus("idle");
    setViewerCount(0);
  }, []);

  const startStream = useCallback(async () => {
    setCameraError(null);
    setPeerStatus("connecting");

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

    const { default: Peer } = await import("peerjs");
    const peer = new Peer(token, PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", () => {
      setIsStreaming(true);
      setPeerStatus("live");

      peer.on("call", (call) => {
        call.answer(stream);

        // stream 이벤트가 와야 실제 연결 성공 — 그때만 카운트 증가
        let counted = false;
        call.on("stream", () => {
          if (!counted) {
            counted = true;
            callsRef.current.push(call);
            setViewerCount(callsRef.current.length);
          }
        });

        const removeCall = () => {
          if (counted) {
            callsRef.current = callsRef.current.filter(c => c !== call);
            setViewerCount(callsRef.current.length);
          }
        };
        call.on("close", removeCall);
        call.on("error", removeCall);
      });
    });

    peer.on("error", (err: any) => {
      if (err.type === "unavailable-id") {
        setCameraError("이 접속 코드는 이미 사용 중입니다. 코드를 변경해 주세요.");
      } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
        setCameraError("P2P 서버 연결 실패. 인터넷 연결 확인 후 다시 시도해 주세요.");
      } else {
        setCameraError(`연결 오류 (${err.type}): 감시 중단 후 재시작해 주세요.`);
      }
      stopStream();
    });

    peer.on("disconnected", () => {
      try { peer.reconnect(); } catch {}
    });
  }, [token, stopStream]);

  const resetToken = useCallback(() => {
    if (isStreaming) return;
    setToken(generateToken());
  }, [isStreaming]);

  return (
    <CctvContext.Provider value={{
      token, isStreaming, viewerCount, peerStatus, cameraError,
      streamRef, startStream, stopStream, resetToken,
    }}>
      {children}
    </CctvContext.Provider>
  );
}

export function useCctv() {
  const ctx = useContext(CctvContext);
  if (!ctx) throw new Error("useCctv must be used within CctvProvider");
  return ctx;
}
