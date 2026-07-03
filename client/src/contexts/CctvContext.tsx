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
  // 사용자가 명시적으로 중단했는지 추적 — true이면 자동 재시작 금지
  const isUserStoppedRef = useRef(false);

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
    isUserStoppedRef.current = true; // 자동 재시작 금지
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
    // 사용자가 명시적으로 중단한 경우 재시작 안 함
    if (isUserStoppedRef.current) return;

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
      setCameraError(null);
    });

    peer.on("error", (err: any) => {
      if (isUserStoppedRef.current) return; // 사용자 중단 시 재시도 금지

      if (err.type === "unavailable-id") {
        // 이전 peer가 서버에 아직 등록된 경우 — 15초 후 재시도 (서버 만료 대기)
        setCameraError("재연결 중... (이전 연결 정리 대기)");
        setTimeout(() => {
          if (!isUserStoppedRef.current && streamRef.current) {
            setCameraError(null);
            startPeerJs(streamRef.current);
          }
        }, 15000);
      } else if (
        err.type === "network" || err.type === "server-error" ||
        err.type === "socket-error" || err.type === "socket-closed"
      ) {
        // 서버/네트워크 문제 — 5초 후 재시도
        setPeerStatus("disconnected");
        setTimeout(() => {
          if (!isUserStoppedRef.current && streamRef.current) startPeerJs(streamRef.current);
        }, 5000);
      } else {
        // 기타 오류도 중단하지 않고 8초 후 재시도
        setPeerStatus("disconnected");
        setCameraError(`재연결 시도 중 (${err.type})`);
        setTimeout(() => {
          if (!isUserStoppedRef.current && streamRef.current) {
            setCameraError(null);
            startPeerJs(streamRef.current);
          }
        }, 8000);
      }
    });

    peer.on("disconnected", () => {
      if (isUserStoppedRef.current) return;
      setPeerStatus("disconnected");
      // reconnect() 우선 시도 — 같은 peer 객체 재사용, 핸들러 중복 없음
      setTimeout(() => {
        if (isUserStoppedRef.current) return;
        if (peerRef.current === peer && !peer.destroyed) {
          try {
            peer.reconnect();
            return;
          } catch {}
        }
        // reconnect 실패 시 완전 재시작
        if (streamRef.current) startPeerJs(streamRef.current);
      }, 3000);
    });
  }, [token]);

  // ── LAN 직접 모드 (인터넷 불필요) ────────────────────────────

  // LAN 모드에서는 로컬 IP(host) 후보만 필요 — srflx/relay 제거해 URL 크기 1/3로 감소
  function filterHostCandidates(sdp: string): string {
    return sdp.split("\n").filter(line => {
      if (!line.startsWith("a=candidate:")) return true;
      return line.includes(" host ");
    }).join("\n");
  }

  const startLan = useCallback(async (stream: MediaStream) => {
    const pc = new RTCPeerConnection(PEER_CONFIG.config);
    lanPcRef.current = pc;

    // 카메라 트랙 추가
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // ICE gathering 완료 대기 (최대 5초)
    await new Promise<void>(resolve => {
      if (pc.iceGatheringState === "complete") { resolve(); return; }
      const check = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", check); resolve(); } };
      pc.addEventListener("icegatheringstatechange", check);
      setTimeout(resolve, 5000);
    });

    const desc = pc.localDescription!;
    // encodeURIComponent 없이 순수 btoa — SDP는 ASCII만 포함
    const encoded = btoa(JSON.stringify({ type: desc.type, sdp: filterHostCandidates(desc.sdp) }));
    setLanOffer(encoded);
    setIsStreaming(true);
    setPeerStatus("live");
  }, []);

  // LAN 모드: 뷰어가 입력한 answer 적용
  const applyLanAnswer = useCallback(async () => {
    if (!lanPcRef.current || !lanAnswerInput.trim()) return;
    try {
      // 공백/개행 모두 제거 후 atob (카카오톡 전송 시 공백 삽입 대비)
      const clean = lanAnswerInput.replace(/\s/g, "");
      const decoded = JSON.parse(atob(clean));
      await lanPcRef.current.setRemoteDescription(new RTCSessionDescription(decoded));
      setViewerCount(1);
      setCameraError(null);
    } catch (e) {
      setCameraError("Answer 코드가 올바르지 않습니다. 뷰어 화면에서 '복사' 버튼을 다시 눌러 전송해 주세요.");
    }
  }, [lanAnswerInput]);

  // ── 공통 시작 ────────────────────────────────────────────────
  const startStream = useCallback(async (selectedMode: CctvMode) => {
    isUserStoppedRef.current = false; // 자동 재시작 허용
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
