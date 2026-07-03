import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import type { Peer as PeerType, MediaConnection } from "peerjs";

const STORAGE_KEY = "cctv_access_token";

function generateToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 20).toUpperCase();
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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

export type CctvMode = "peerjs" | "lan";

interface CctvContextValue {
  token: string;
  isStreaming: boolean;
  viewerCount: number;
  peerStatus: "idle" | "connecting" | "live" | "disconnected";
  cameraError: string | null;
  streamRef: React.MutableRefObject<MediaStream | null>;
  mode: CctvMode;
  // LAN 모드 전용
  lanOffer: string | null;
  lanAnswerInput: string;
  setLanAnswerInput: (v: string) => void;
  applyLanAnswer: () => Promise<void>;
  startStream: (mode: CctvMode) => Promise<void>;
  stopStream: () => void;
  resetToken: () => void;
}

const CctvContext = createContext<CctvContextValue | null>(null);

export function CctvProvider({ children }: { children: React.ReactNode }) {
  const peerRef = useRef<PeerType | null>(null);
  const callsRef = useRef<MediaConnection[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // LAN 모드 WebRTC
  const lanPcRef = useRef<RTCPeerConnection | null>(null);

  const [token, setToken] = useState<string>(() =>
    localStorage.getItem(STORAGE_KEY) || generateToken()
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [peerStatus, setPeerStatus] = useState<"idle" | "connecting" | "live" | "disconnected">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<CctvMode>("peerjs");
  const [lanOffer, setLanOffer] = useState<string | null>(null);
  const [lanAnswerInput, setLanAnswerInput] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  // 5초마다 끊긴 PeerJS call 정리
  useEffect(() => {
    if (!isStreaming || mode !== "peerjs") return;
    const interval = setInterval(() => {
      callsRef.current = callsRef.current.filter(call => {
        const state = (call as any).peerConnection?.connectionState;
        return state === "connected" || state === "connecting" || state === "new";
      });
      setViewerCount(callsRef.current.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isStreaming, mode]);

  const stopStream = useCallback(() => {
    // PeerJS 정리
    callsRef.current.forEach(c => { try { c.close(); } catch {} });
    callsRef.current = [];
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch {}
      peerRef.current = null;
    }
    // LAN RTCPeerConnection 정리
    if (lanPcRef.current) {
      try { lanPcRef.current.close(); } catch {}
      lanPcRef.current = null;
    }
    // 카메라 트랙 중지
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
    setPeerStatus("idle");
    setViewerCount(0);
    setLanOffer(null);
    setLanAnswerInput("");
  }, []);

  // ── PeerJS 모드 ──────────────────────────────────────────────
  const startPeerJs = useCallback(async (stream: MediaStream) => {
    const { default: Peer } = await import("peerjs");

    // 이전 인스턴스 제거
    if (peerRef.current) { try { peerRef.current.destroy(); } catch {} peerRef.current = null; }

    const peer = new Peer(token, PEER_CONFIG);
    peerRef.current = peer;

    // peer.on("open") 바깥에 call 핸들러 등록 → reconnect 시 중복 방지
    peer.on("call", (call) => {
      call.answer(stream);
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

    peer.on("open", () => {
      setIsStreaming(true);
      setPeerStatus("live");
    });

    peer.on("error", (err: any) => {
      if (err.type === "unavailable-id") {
        setCameraError("이 접속 코드는 이미 사용 중입니다. 코드를 변경 후 재시작하세요.");
        stopStream();
      } else if (err.type === "network" || err.type === "server-error" || err.type === "socket-error") {
        setCameraError(`P2P 서버 연결 실패 (${err.type}). 잠시 후 자동 재시작합니다.`);
        // 5초 후 재시작
        setTimeout(() => {
          if (streamRef.current) startPeerJs(streamRef.current);
        }, 5000);
      } else {
        setCameraError(`연결 오류 (${err.type}). 감시를 중단 후 재시작하세요.`);
        stopStream();
      }
    });

    peer.on("disconnected", () => {
      setPeerStatus("disconnected");
      // 완전 재시작 (단순 reconnect는 핸들러 중복 위험)
      setTimeout(() => {
        if (streamRef.current && peerRef.current === peer) {
          startPeerJs(streamRef.current);
        }
      }, 3000);
    });
  }, [token, stopStream]);

  // ── LAN 직접 모드 (인터넷 불필요) ────────────────────────────
  const startLan = useCallback(async (stream: MediaStream) => {
    const pc = new RTCPeerConnection(PEER_CONFIG.config);
    lanPcRef.current = pc;

    // 카메라 트랙 추가
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // ICE gathering 완료 대기 (최대 4초)
    await new Promise<void>(resolve => {
      if (pc.iceGatheringState === "complete") { resolve(); return; }
      const check = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", check); resolve(); } };
      pc.addEventListener("icegatheringstatechange", check);
      setTimeout(resolve, 4000);
    });

    // offer를 base64로 인코딩해 QR로 보여줌
    const offerJson = JSON.stringify(pc.localDescription);
    const encoded = btoa(encodeURIComponent(offerJson));
    setLanOffer(encoded);
    setIsStreaming(true);
    setPeerStatus("live");
  }, []);

  // LAN 모드: 뷰어가 입력한 answer 적용
  const applyLanAnswer = useCallback(async () => {
    if (!lanPcRef.current || !lanAnswerInput.trim()) return;
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(lanAnswerInput.trim())));
      await lanPcRef.current.setRemoteDescription(decoded);
      setViewerCount(1);
    } catch {
      setCameraError("Answer 코드가 올바르지 않습니다. 뷰어 화면의 코드를 다시 확인해 주세요.");
    }
  }, [lanAnswerInput]);

  // ── 공통 시작 ────────────────────────────────────────────────
  const startStream = useCallback(async (selectedMode: CctvMode) => {
    setCameraError(null);
    setPeerStatus("connecting");
    setMode(selectedMode);

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

    if (selectedMode === "peerjs") {
      await startPeerJs(stream);
    } else {
      await startLan(stream);
    }
  }, [startPeerJs, startLan]);

  const resetToken = useCallback(() => {
    if (isStreaming) return;
    setToken(generateToken());
  }, [isStreaming]);

  return (
    <CctvContext.Provider value={{
      token, isStreaming, viewerCount, peerStatus, cameraError,
      streamRef, mode, lanOffer, lanAnswerInput, setLanAnswerInput,
      applyLanAnswer, startStream, stopStream, resetToken,
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
