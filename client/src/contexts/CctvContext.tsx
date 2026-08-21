import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import type { Peer as PeerType, MediaConnection, DataConnection } from "peerjs";
import {
  getCctvSettings,
  getCctvDeviceRole,
  buildViewerUrl,
  buildRemoteUrl,
  notifyExternalAddress,
  type CctvFacingMode,
  type CctvDeviceRole,
} from "@/lib/cctvSettings";
import { buildScreenViewerUrl, captureAppJpeg, sendScreenshotChunks } from "@/lib/screenShare";

const STORAGE_KEY = "cctv_access_token";
const DESIRED_KEY = "cctv_desired_streaming";

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
  debug: 0,
};

export type CctvMode = "peerjs" | "lan";

interface CctvContextValue {
  deviceRole: CctvDeviceRole;
  token: string;
  isStreaming: boolean;
  viewerCount: number;
  peerStatus: "idle" | "connecting" | "live" | "disconnected" | "control";
  cameraError: string | null;
  streamRef: React.MutableRefObject<MediaStream | null>;
  mode: CctvMode;
  lanOffer: string | null;
  lanAnswerInput: string;
  setLanAnswerInput: (v: string) => void;
  applyLanAnswer: () => Promise<void>;
  startStream: (mode: CctvMode) => Promise<boolean>;
  stopStream: (opts?: { keepDesired?: boolean }) => void;
  resetToken: () => void;
  /** 상시/원격 모드에서 원하는 감시 ON 상태 */
  desiredStreaming: boolean;
  setDesiredStreaming: (v: boolean) => void;
  controlReady: boolean;
  lastNotifyStatus: string | null;
  notifyNow: () => Promise<void>;
  facingMode: CctvFacingMode;
  /** 송출 중 마이크 트랙 포함 여부 (태블릿 미리보기는 하울링 방지로 항상 음소거) */
  micActive: boolean;
}

const CctvContext = createContext<CctvContextValue | null>(null);

function readDesired(): boolean {
  try {
    return localStorage.getItem(DESIRED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDesired(v: boolean) {
  try {
    localStorage.setItem(DESIRED_KEY, v ? "1" : "0");
  } catch {}
}

export function CctvProvider({ children }: { children: React.ReactNode }) {
  const [deviceRole] = useState<CctvDeviceRole>(() => getCctvDeviceRole());
  const peerRef = useRef<PeerType | null>(null);
  const callsRef = useRef<MediaConnection[]>([]);
  const dataConnsRef = useRef<DataConnection[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const lanPcRef = useRef<RTCPeerConnection | null>(null);
  /** 사용자가 앱에서 명시 중단 — 상시모드여도 재시작 안 함 (원격 start로만 해제) */
  const isUserStoppedRef = useRef(false);
  const startingRef = useRef(false);
  const ensurePeerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef("");
  const desiredRef = useRef(readDesired());
  const isStreamingRef = useRef(false);
  const cameraErrorRef = useRef<string | null>(null);
  const modeRef = useRef<CctvMode>("peerjs");
  const startStreamRef = useRef<(mode: CctvMode) => Promise<boolean>>(async () => false);
  const stopStreamRef = useRef<(opts?: { keepDesired?: boolean }) => void>(() => {});
  const screenshotBusyRef = useRef(false);

  const [token, setToken] = useState<string>(() => {
    if (deviceRole !== "broadcaster") return "";
    const t = localStorage.getItem(STORAGE_KEY) || generateToken();
    tokenRef.current = t;
    return t;
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [peerStatus, setPeerStatus] = useState<"idle" | "connecting" | "live" | "disconnected" | "control">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<CctvMode>("peerjs");
  const [lanOffer, setLanOffer] = useState<string | null>(null);
  const [lanAnswerInput, setLanAnswerInput] = useState("");
  const [desiredStreaming, setDesiredStreamingState] = useState(readDesired());
  const [controlReady, setControlReady] = useState(false);
  const [lastNotifyStatus, setLastNotifyStatus] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<CctvFacingMode>(() => getCctvSettings().cctvFacingMode);
  /** 현재 송출 스트림에 마이크 오디오 트랙이 포함되는지 */
  const [micActive, setMicActive] = useState(false);

  useEffect(() => {
    if (deviceRole === "broadcaster" && token) {
      localStorage.setItem(STORAGE_KEY, token);
    }
    tokenRef.current = token;
  }, [deviceRole, token]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    cameraErrorRef.current = cameraError;
  }, [cameraError]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const setDesiredStreaming = useCallback((v: boolean) => {
    desiredRef.current = v;
    writeDesired(v);
    setDesiredStreamingState(v);
  }, []);

  const getStatusPayload = useCallback(() => {
    const t = tokenRef.current;
    return {
      type: "status" as const,
      isStreaming: isStreamingRef.current,
      peerStatus: peerRef.current && !peerRef.current.destroyed ? (isStreamingRef.current ? "live" : "control") : "idle",
      viewerUrl: buildViewerUrl(t),
      remoteUrl: buildRemoteUrl(t),
      screenUrl: buildScreenViewerUrl(t),
      viewerCount: callsRef.current.length,
      cameraError: cameraErrorRef.current,
      desiredStreaming: desiredRef.current,
      token: t,
    };
  }, []);

  const broadcastStatus = useCallback(() => {
    const payload = JSON.stringify(getStatusPayload());
    dataConnsRef.current = dataConnsRef.current.filter((c) => {
      if (!c.open) return false;
      try {
        c.send(payload);
        return true;
      } catch {
        return false;
      }
    });
  }, [getStatusPayload]);

  const sendNotify = useCallback(async (event: "stream_started" | "token_ready" | "stream_stopped") => {
    if (deviceRole !== "broadcaster" || !tokenRef.current) {
      setLastNotifyStatus("뷰어 기기에서는 송출 토큰을 전송하지 않습니다.");
      return;
    }
    const t = tokenRef.current;
    const result = await notifyExternalAddress({
      viewerUrl: buildViewerUrl(t),
      remoteUrl: buildRemoteUrl(t),
      screenUrl: buildScreenViewerUrl(t),
      token: t,
      event,
    });
    if (result.ok) {
      setLastNotifyStatus(`전송 완료 (${new Date().toLocaleTimeString("ko-KR")})`);
    } else if (result.error && !result.error.includes("설정되지")) {
      setLastNotifyStatus(`전송 실패: ${result.error}`);
    }
  }, [deviceRole]);

  const notifyNow = useCallback(async () => {
    await sendNotify(isStreamingRef.current ? "stream_started" : "token_ready");
  }, [sendNotify]);

  const stopCameraTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    callsRef.current.forEach((c) => {
      try {
        c.close();
      } catch {}
    });
    callsRef.current = [];
    if (lanPcRef.current) {
      try {
        lanPcRef.current.close();
      } catch {}
      lanPcRef.current = null;
    }
    setLanOffer(null);
    setLanAnswerInput("");
    setViewerCount(0);
    setIsStreaming(false);
    isStreamingRef.current = false;
    setMicActive(false);
  }, []);

  const attachDataConnection = useCallback(
    (conn: DataConnection) => {
      dataConnsRef.current.push(conn);

      conn.on("open", () => {
        try {
          conn.send(JSON.stringify(getStatusPayload()));
        } catch {}
      });

      conn.on("data", async (raw) => {
        let msg: any;
        try {
          msg = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return;
        }
        if (!msg || msg.type !== "cmd") return;

        const action = msg.action as string;
        const reply = (ok: boolean, message?: string) => {
          try {
            conn.send(JSON.stringify({ type: "ack", action, ok, message }));
            conn.send(JSON.stringify(getStatusPayload()));
          } catch {}
        };

        if (action === "status") {
          reply(true);
          return;
        }

        if (action === "start") {
          isUserStoppedRef.current = false;
          setDesiredStreaming(true);
          try {
            const started = await startStreamRef.current("peerjs");
            if (started && isStreamingRef.current) {
              reply(true, "감시 시작");
            } else {
              reply(
                false,
                cameraErrorRef.current ||
                  "감시 시작 실패 — 태블릿에서 카메라 권한을 허용했는지 확인하세요."
              );
            }
            broadcastStatus();
          } catch (e: any) {
            reply(false, e?.message || "시작 실패");
            broadcastStatus();
          }
          return;
        }

        if (action === "stop") {
          isUserStoppedRef.current = true;
          setDesiredStreaming(false);
          stopStreamRef.current({ keepDesired: false });
          reply(true, "감시 중단");
          broadcastStatus();
          return;
        }

        if (action === "restart") {
          isUserStoppedRef.current = false;
          setDesiredStreaming(true);
          stopStreamRef.current({ keepDesired: true });
          setTimeout(async () => {
            try {
              const started = await startStreamRef.current("peerjs");
              if (started && isStreamingRef.current) {
                reply(true, "재시작 완료");
              } else {
                reply(
                  false,
                  cameraErrorRef.current ||
                    "재시작 실패 — 태블릿 카메라 권한을 확인하세요."
                );
              }
              broadcastStatus();
            } catch (e: any) {
              reply(false, e?.message || "재시작 실패");
              broadcastStatus();
            }
          }, 800);
          return;
        }

        if (action === "notify") {
          await sendNotify("token_ready");
          reply(true, "통지 전송");
          return;
        }

        if (action === "screenshot") {
          if (screenshotBusyRef.current) {
            reply(false, "이미 화면을 찍는 중입니다");
            return;
          }
          screenshotBusyRef.current = true;
          try {
            const dataUrl = await captureAppJpeg();
            await sendScreenshotChunks((payload) => conn.send(payload), dataUrl);
            reply(true, "화면 전송");
          } catch (e: any) {
            reply(false, e?.message || "화면 캡처 실패");
          } finally {
            screenshotBusyRef.current = false;
          }
          return;
        }

        reply(false, "알 수 없는 명령");
      });

      conn.on("close", () => {
        dataConnsRef.current = dataConnsRef.current.filter((c) => c !== conn);
      });

      conn.on("error", () => {
        dataConnsRef.current = dataConnsRef.current.filter((c) => c !== conn);
      });
    },
    [broadcastStatus, getStatusPayload, sendNotify, setDesiredStreaming]
  );

  const ensureControlPeer = useCallback(async () => {
    if (deviceRole !== "broadcaster" || !tokenRef.current) return;
    const settings = getCctvSettings();
    if (!settings.cctvRemoteEnabled && !settings.cctvAlwaysOn && !desiredRef.current && !isStreamingRef.current) {
      return;
    }

    if (peerRef.current && !peerRef.current.destroyed) {
      setControlReady(true);
      return;
    }

    const { default: Peer } = await import("peerjs");
    const peer = new Peer(tokenRef.current, PEER_CONFIG);
    peerRef.current = peer;

    peer.on("open", () => {
      setControlReady(true);
      setCameraError(null);
      if (isStreamingRef.current) {
        setPeerStatus("live");
      } else {
        setPeerStatus("control");
      }
      broadcastStatus();
    });

    peer.on("connection", (conn) => {
      attachDataConnection(conn);
    });

    peer.on("call", (call) => {
      if (!streamRef.current) {
        try {
          call.close();
        } catch {}
        return;
      }
      call.answer(streamRef.current);
      let counted = false;

      call.on("stream", () => {
        if (!counted) {
          counted = true;
          callsRef.current.push(call);
          setViewerCount(callsRef.current.length);
          broadcastStatus();
        }
      });

      const removeCall = () => {
        if (counted) {
          callsRef.current = callsRef.current.filter((c) => c !== call);
          setViewerCount(callsRef.current.length);
          broadcastStatus();
        }
      };
      call.on("close", removeCall);
      call.on("error", removeCall);
    });

    peer.on("error", (err: any) => {
      setControlReady(false);
      if (isUserStoppedRef.current && !getCctvSettings().cctvRemoteEnabled && !getCctvSettings().cctvAlwaysOn) {
        return;
      }

      const retryMs =
        err.type === "unavailable-id" ? 12000 :
        err.type === "network" || err.type === "server-error" || err.type === "socket-error" || err.type === "socket-closed" ? 4000 :
        7000;

      if (err.type === "unavailable-id") {
        setCameraError("제어 채널 재연결 중... (이전 연결 정리 대기)");
      } else {
        setPeerStatus("disconnected");
        setCameraError(`재연결 시도 중 (${err.type || "error"})`);
      }

      if (ensurePeerTimerRef.current) clearTimeout(ensurePeerTimerRef.current);
      ensurePeerTimerRef.current = setTimeout(() => {
        if (peerRef.current === peer) {
          try {
            peer.destroy();
          } catch {}
          peerRef.current = null;
        }
        ensureControlPeer();
      }, retryMs);
    });

    peer.on("disconnected", () => {
      setControlReady(false);
      setPeerStatus("disconnected");
      setTimeout(() => {
        if (peerRef.current === peer && !peer.destroyed) {
          try {
            peer.reconnect();
            return;
          } catch {}
        }
        if (peerRef.current === peer) {
          try {
            peer.destroy();
          } catch {}
          peerRef.current = null;
        }
        ensureControlPeer();
      }, 2500);
    });
  }, [attachDataConnection, broadcastStatus, deviceRole]);

  // ── PeerJS 미디어 시작 (제어 Peer 재사용) ─────────────────────
  const startPeerJs = useCallback(
    async (stream: MediaStream) => {
      if (isUserStoppedRef.current && !desiredRef.current) return;

      await ensureControlPeer();
      const peer = peerRef.current;
      if (!peer || peer.destroyed) {
        const msg = "P2P 제어 채널 연결 실패";
        setCameraError(msg);
        cameraErrorRef.current = msg;
        setPeerStatus("disconnected");
        setIsStreaming(false);
        isStreamingRef.current = false;
        return;
      }

      setIsStreaming(true);
      isStreamingRef.current = true;
      setPeerStatus("live");
      setCameraError(null);
      cameraErrorRef.current = null;
      broadcastStatus();
      await sendNotify("stream_started");
    },
    [broadcastStatus, ensureControlPeer, sendNotify]
  );

  function filterHostCandidates(sdp: string): string {
    return sdp
      .split("\n")
      .filter((line) => {
        if (!line.startsWith("a=candidate:")) return true;
        return line.includes(" host ");
      })
      .join("\n");
  }

  /**
   * 카메라/마이크 권한 팝업을 띄우지 않기 위해 이미 허용된 상태만 사용합니다.
   * prompt/denied/확인불가면 getUserMedia를 호출하지 않습니다.
   * permissions API가 없거나 실패하면 enumerateDevices의 label 유무로 판별합니다.
   */
  async function hasGrantedMediaPermission(
    name: "camera" | "microphone"
  ): Promise<boolean> {
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({
          name: name as PermissionName,
        });
        if (status.state === "granted") return true;
        if (status.state === "denied") return false;
      } catch {
        // Android 등에서 microphone PermissionName이 거부될 수 있음 → 폴백
      }
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const kind = name === "camera" ? "videoinput" : "audioinput";
      // 권한이 허용된 뒤에만 device.label이 채워짐
      return devices.some((d) => d.kind === kind && !!d.label);
    } catch {
      return false;
    }
  }

  async function hasGrantedMicrophonePermission(): Promise<boolean> {
    return hasGrantedMediaPermission("microphone");
  }

  async function hasGrantedCameraPermission(): Promise<boolean> {
    return hasGrantedMediaPermission("camera");
  }

  const startLan = useCallback(async (stream: MediaStream) => {
    const pc = new RTCPeerConnection(PEER_CONFIG.config);
    lanPcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
      setTimeout(resolve, 5000);
    });

    const desc = pc.localDescription!;
    const encoded = btoa(JSON.stringify({ type: desc.type, sdp: filterHostCandidates(desc.sdp) }));
    setLanOffer(encoded);
    setIsStreaming(true);
    setPeerStatus("live");
  }, []);

  const applyLanAnswer = useCallback(async () => {
    if (!lanPcRef.current || !lanAnswerInput.trim()) return;
    try {
      const clean = lanAnswerInput.replace(/\s/g, "");
      const decoded = JSON.parse(atob(clean));
      await lanPcRef.current.setRemoteDescription(new RTCSessionDescription(decoded));
      setViewerCount(1);
      setCameraError(null);
    } catch {
      setCameraError("Answer 코드가 올바르지 않습니다. 뷰어 화면에서 '복사' 버튼을 다시 눌러 전송해 주세요.");
    }
  }, [lanAnswerInput]);

  const startStream = useCallback(
    async (selectedMode: CctvMode): Promise<boolean> => {
      if (deviceRole !== "broadcaster") {
        const msg = "스마트폰은 뷰어 기기로 등록되어 카메라를 송출할 수 없습니다.";
        setCameraError(msg);
        cameraErrorRef.current = msg;
        setPeerStatus("idle");
        return false;
      }
      if (startingRef.current) {
        return isStreamingRef.current;
      }
      startingRef.current = true;
      isUserStoppedRef.current = false;
      setDesiredStreaming(true);
      setCameraError(null);
      cameraErrorRef.current = null;
      setPeerStatus("connecting");
      setMode(selectedMode);

      try {
        // 기존 카메라 정리 후 재오픈
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const facing = getCctvSettings().cctvFacingMode;
        setFacingMode(facing);

        let stream: MediaStream;
        let microphoneAllowed = false;
        try {
          const cameraAllowed = await hasGrantedCameraPermission();
          if (!cameraAllowed) {
            const msg =
              "카메라 권한이 허용되지 않아 감시를 시작할 수 없습니다. 태블릿 앱/사이트 설정에서 카메라를 허용한 뒤 앱을 다시 실행하세요.";
            setCameraError(msg);
            cameraErrorRef.current = msg;
            setPeerStatus(controlReady ? "control" : "idle");
            setIsStreaming(false);
            isStreamingRef.current = false;
            return false;
          }

          microphoneAllowed = await hasGrantedMicrophonePermission();
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: microphoneAllowed
              ? {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                }
              : false,
          });
        } catch (err: any) {
          // 권한 팝업을 띄우지 않는 것이 원칙이나, 일부 브라우저는
          // permissions API와 실제 상태가 어긋날 수 있어 최후 방어로 처리합니다.
          const msg =
            err.name === "NotAllowedError"
              ? "카메라 권한이 허용되지 않아 감시를 시작할 수 없습니다. 태블릿 앱/사이트 설정에서 카메라를 허용한 뒤 앱을 다시 실행하세요."
              : "카메라를 열 수 없습니다: " + (err.message || err.name || "unknown");
          setCameraError(msg);
          cameraErrorRef.current = msg;
          setPeerStatus(controlReady ? "control" : "idle");
          setIsStreaming(false);
          isStreamingRef.current = false;
          setMicActive(false);
          return false;
        }

        streamRef.current = stream;
        const hasMic = stream.getAudioTracks().some((t) => t.readyState !== "ended");
        setMicActive(hasMic);

        // 트랙이 OS에 의해 끊기면 상시모드에서 자동 재시작
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (isUserStoppedRef.current || !desiredRef.current) return;
            const settings = getCctvSettings();
            if (settings.cctvAlwaysOn || desiredRef.current) {
              setCameraError("카메라 트랙 종료 — 자동 재시작...");
              cameraErrorRef.current = "카메라 트랙 종료 — 자동 재시작...";
              if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
              autoStartTimerRef.current = setTimeout(() => {
                void startStreamRef.current(modeRef.current || "peerjs");
              }, 2000);
            }
          };
        });

        if (selectedMode === "peerjs") {
          await startPeerJs(stream);
        } else {
          await startLan(stream);
        }

        if (!isStreamingRef.current && selectedMode === "peerjs") {
          // startPeerJs가 실패했을 수 있음
          const msg = cameraErrorRef.current || "P2P 송출 시작에 실패했습니다.";
          setCameraError(msg);
          return false;
        }

        if (!hasMic) {
          const micMsg =
            "마이크 권한이 허용되지 않아 영상만 송출합니다. 소리가 필요하면 태블릿 앱/사이트 설정에서 마이크를 허용한 뒤 감시를 다시 시작하세요.";
          setCameraError(micMsg);
          cameraErrorRef.current = micMsg;
        }
        return true;
      } finally {
        startingRef.current = false;
      }
    },
    [controlReady, deviceRole, setDesiredStreaming, startLan, startPeerJs]
  );

  const stopStream = useCallback(
    (opts?: { keepDesired?: boolean }) => {
      if (!opts?.keepDesired) {
        isUserStoppedRef.current = true;
        setDesiredStreaming(false);
      }

      stopCameraTracks();

      const settings = getCctvSettings();
      const keepPeer = settings.cctvRemoteEnabled || settings.cctvAlwaysOn || opts?.keepDesired;

      if (!keepPeer) {
        dataConnsRef.current.forEach((c) => {
          try {
            c.close();
          } catch {}
        });
        dataConnsRef.current = [];
        if (peerRef.current) {
          try {
            peerRef.current.destroy();
          } catch {}
          peerRef.current = null;
        }
        setControlReady(false);
        setPeerStatus("idle");
      } else {
        setPeerStatus(peerRef.current && !peerRef.current.destroyed ? "control" : "idle");
        broadcastStatus();
      }

      void sendNotify("stream_stopped");
    },
    [broadcastStatus, sendNotify, setDesiredStreaming, stopCameraTracks]
  );

  startStreamRef.current = startStream;
  stopStreamRef.current = stopStream;

  const resetToken = useCallback(() => {
    if (deviceRole !== "broadcaster") return;
    if (isStreamingRef.current) return;
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
    }
    setControlReady(false);
    const next = generateToken();
    setToken(next);
    tokenRef.current = next;
    // 새 토큰으로 제어 채널 재연결
    setTimeout(() => {
      ensureControlPeer();
      void sendNotify("token_ready");
    }, 300);
  }, [deviceRole, ensureControlPeer, sendNotify]);

  // 끊긴 call 정리
  useEffect(() => {
    if (!isStreaming || mode !== "peerjs") return;
    const interval = setInterval(() => {
      callsRef.current = callsRef.current.filter((call) => {
        const state = (call as any).peerConnection?.connectionState;
        return state === "connected" || state === "connecting" || state === "new";
      });
      setViewerCount(callsRef.current.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isStreaming, mode]);

  // 설정 변경 / 마운트 시 제어 채널·상시 감시
  useEffect(() => {
    if (deviceRole !== "broadcaster") {
      setControlReady(false);
      setPeerStatus("idle");
      setDesiredStreaming(false);
      return;
    }

    const boot = () => {
      const settings = getCctvSettings();
      setFacingMode(settings.cctvFacingMode);

      if (settings.cctvRemoteEnabled || settings.cctvAlwaysOn || desiredRef.current) {
        ensureControlPeer();
      }

      if (
        (settings.cctvAlwaysOn || desiredRef.current) &&
        !isUserStoppedRef.current &&
        navigator.onLine &&
        !isStreamingRef.current
      ) {
        if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = setTimeout(() => {
          if (!isStreamingRef.current && !isUserStoppedRef.current) {
            startStreamRef.current("peerjs");
          }
        }, 1200);
      }
    };

    boot();

    const onSettings = () => boot();
    const onOnline = () => {
      const settings = getCctvSettings();
      ensureControlPeer();
      if ((settings.cctvAlwaysOn || desiredRef.current) && !isUserStoppedRef.current && !isStreamingRef.current) {
        startStreamRef.current("peerjs");
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const settings = getCctvSettings();
      if (!peerRef.current || peerRef.current.destroyed) {
        if (settings.cctvRemoteEnabled || settings.cctvAlwaysOn || desiredRef.current) {
          ensureControlPeer();
        }
      }
      if (
        (settings.cctvAlwaysOn || desiredRef.current) &&
        !isUserStoppedRef.current &&
        !isStreamingRef.current &&
        navigator.onLine
      ) {
        startStreamRef.current("peerjs");
      }
    };

    window.addEventListener("cctv-settings-changed", onSettings);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    // 주기적 헬스체크 — Peer 끊김·상시모드 복구
    const health = setInterval(() => {
      const settings = getCctvSettings();
      if (settings.cctvRemoteEnabled || settings.cctvAlwaysOn || desiredRef.current) {
        if (!peerRef.current || peerRef.current.destroyed) {
          ensureControlPeer();
        }
      }
      if (
        (settings.cctvAlwaysOn || desiredRef.current) &&
        !isUserStoppedRef.current &&
        navigator.onLine &&
        !isStreamingRef.current &&
        !startingRef.current
      ) {
        startStreamRef.current("peerjs");
      }
    }, 20000);

    return () => {
      window.removeEventListener("cctv-settings-changed", onSettings);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(health);
      if (ensurePeerTimerRef.current) clearTimeout(ensurePeerTimerRef.current);
      if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
    };
  }, [deviceRole, ensureControlPeer, setDesiredStreaming]);

  // 언마운트 시 카메라 정리
  useEffect(() => {
    return () => {
      stopCameraTracks();
      if (peerRef.current) {
        try {
          peerRef.current.destroy();
        } catch {}
        peerRef.current = null;
      }
    };
  }, [stopCameraTracks]);

  return (
    <CctvContext.Provider
      value={{
        deviceRole,
        token,
        isStreaming,
        viewerCount,
        peerStatus,
        cameraError,
        streamRef,
        mode,
        lanOffer,
        lanAnswerInput,
        setLanAnswerInput,
        applyLanAnswer,
        startStream,
        stopStream,
        resetToken,
        desiredStreaming,
        setDesiredStreaming,
        controlReady,
        lastNotifyStatus,
        notifyNow,
        facingMode,
        micActive,
      }}
    >
      {children}
    </CctvContext.Provider>
  );
}

export function useCctv() {
  const ctx = useContext(CctvContext);
  if (!ctx) throw new Error("useCctv must be used within CctvProvider");
  return ctx;
}
