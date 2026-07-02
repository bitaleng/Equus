import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
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
