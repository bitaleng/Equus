import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Minus, Plus, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { Peer as PeerType, DataConnection } from "peerjs";
import { SCREEN_PEER_CONFIG } from "@/lib/screenShare";

type Status = "connecting" | "waiting" | "live" | "ended" | "error";

function dataUrlToObjectUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = /data:([^;]+)/.exec(header)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function readTokenFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("token") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  } catch {
    return "";
  }
}

export default function ScreenViewPage() {
  const [token, setToken] = useState(() => readTokenFromUrl());
  const [status, setStatus] = useState<Status>(readTokenFromUrl() ? "connecting" : "waiting");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const peerRef = useRef<PeerType | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunksRef = useRef<Record<string, { total: number; parts: string[] }>>({});
  const blobUrlRef = useRef<string | null>(null);
  const activeShotIdRef = useRef<string | null>(null);
  const requestInFlightRef = useRef(false);

  const discardShot = useCallback((clearDisplay: boolean) => {
    chunksRef.current = {};
    activeShotIdRef.current = null;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    if (clearDisplay) setImageSrc(null);
  }, []);

  const requestShot = useCallback(() => {
    const conn = connRef.current;
    if (!conn?.open || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setRefreshing(true);
    try {
      conn.send(JSON.stringify({ type: "cmd", action: "screenshot" }));
    } catch {
      requestInFlightRef.current = false;
      setRefreshing(false);
    }
    window.setTimeout(() => {
      requestInFlightRef.current = false;
      setRefreshing(false);
    }, 12000);
  }, []);

  const handleMessage = useCallback((raw: unknown) => {
    let msg: any;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!msg) return;

    if (msg.type === "screenshot_begin") {
      const id = String(msg.id || "shot");
      discardShot(true);
      activeShotIdRef.current = id;
      chunksRef.current = { [id]: { total: Number(msg.total) || 1, parts: [] } };
      return;
    }

    if (msg.type === "screenshot" && typeof msg.chunk === "string") {
      const id = String(msg.id || "shot");
      if (activeShotIdRef.current && id !== activeShotIdRef.current) {
        discardShot(true);
      }
      activeShotIdRef.current = id;
      if (!chunksRef.current[id]) {
        chunksRef.current = { [id]: { total: Number(msg.total) || 1, parts: [] } };
      }
      const index = Number(msg.index) || 0;
      const total = Number(msg.total) || chunksRef.current[id].total;
      chunksRef.current[id].total = total;
      chunksRef.current[id].parts[index] = msg.chunk;
      const got = chunksRef.current[id].parts.filter((p) => typeof p === "string").length;
      if (got >= total) {
        const dataUrl = chunksRef.current[id].parts.join("");
        chunksRef.current = {};
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        const objectUrl = dataUrlToObjectUrl(dataUrl);
        blobUrlRef.current = objectUrl;
        setImageSrc(objectUrl);
        setStatus("live");
        setCapturedAt(new Date());
        setErrorMsg("");
        requestInFlightRef.current = false;
        setRefreshing(false);
      }
      return;
    }

    if (msg.type === "ack" && msg.action === "screenshot") {
      if (!msg.ok) {
        requestInFlightRef.current = false;
        setRefreshing(false);
        setErrorMsg(msg.message || "화면을 가져오지 못했습니다");
        setStatus((prev) => (prev === "live" ? "live" : "waiting"));
      }
    }
  }, [discardShot]);

  const cleanup = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    try {
      connRef.current?.close();
    } catch {}
    connRef.current = null;
    try {
      peerRef.current?.destroy();
    } catch {}
    peerRef.current = null;
    discardShot(true);
  }, [discardShot]);

  const connect = useCallback(async () => {
    if (!token || token.length < 16) return;
    cleanup();
    setStatus("connecting");
    setErrorMsg("");

    try {
      const { default: Peer } = await import("peerjs");
      const peer = new Peer(SCREEN_PEER_CONFIG);
      peerRef.current = peer;

      await new Promise<void>((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error("연결 시간 초과")), 15000);
        peer.on("open", () => {
          window.clearTimeout(t);
          resolve();
        });
        peer.on("error", (e: any) => {
          window.clearTimeout(t);
          reject(e);
        });
      });

      const conn = peer.connect(token, { reliable: true });
      connRef.current = conn;

      conn.on("open", () => {
        setStatus((prev) => (prev === "live" ? "live" : "waiting"));
        requestShot();
      });
      conn.on("data", handleMessage);
      conn.on("close", () => {
        setStatus((prev) => (prev === "live" ? "ended" : "waiting"));
        retryRef.current = setTimeout(() => {
          setRetryCount((c) => c + 1);
          void connect();
        }, 4000);
      });
      conn.on("error", () => {
        setStatus("error");
        setErrorMsg("제어 연결 오류");
      });
    } catch (e: any) {
      const type = e?.type || e?.message || "연결 실패";
      if (type === "peer-unavailable") {
        setStatus("waiting");
        retryRef.current = setTimeout(() => {
          setRetryCount((c) => c + 1);
          void connect();
        }, 4000);
        return;
      }
      setStatus("error");
      setErrorMsg(String(type));
      retryRef.current = setTimeout(() => {
        setRetryCount((c) => c + 1);
        void connect();
      }, 5000);
    }
  }, [cleanup, handleMessage, requestShot, token]);

  useEffect(() => {
    if (!token || token.length < 16) return;
    void connect();
    return () => cleanup();
  }, [token, connect, cleanup]);

  useEffect(() => {
    if (status !== "live" && status !== "waiting") return;
    if (!connRef.current?.open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      requestShot();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [status, requestShot]);

  if (!token || token.length < 16) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <AlertCircle className="h-10 w-10 text-yellow-400 mx-auto" />
          <p className="text-white font-medium">원격 화면보기 — 접속 코드 입력</p>
          <p className="text-gray-400 text-sm">Discord 메시지에 있는 토큰을 붙여넣으세요.</p>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="20자리 토큰"
            maxLength={20}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-center font-mono text-sm text-white tracking-wider"
            data-testid="input-screen-token"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 overflow-auto">
        <div
          className="relative mx-auto"
          style={{
            width: `${zoom * 100}%`,
            minHeight: imageSrc ? undefined : "100dvh",
          }}
        >
          {imageSrc && (
            <img
              src={imageSrc}
              alt="매장 화면"
              className="w-full h-auto bg-black"
              data-testid="screen-share-image"
            />
          )}

          {!imageSrc && (status === "live" || refreshing) && (
            <div className="flex flex-col items-center gap-5 py-10 text-center">
              <Wifi className="h-12 w-12 text-sky-400 animate-pulse" />
              <p className="text-white font-medium">새 화면을 받는 중</p>
            </div>
          )}

          {!imageSrc && status !== "live" && !refreshing && (
            <div className="flex flex-col items-center gap-5 py-10 text-center">
              {status === "connecting" && (
                <>
                  <Wifi className="h-12 w-12 text-gray-400 animate-pulse" />
                  <p className="text-gray-300 text-sm">매장 화면에 연결 중...</p>
                </>
              )}
              {status === "waiting" && (
                <>
                  <Wifi className="h-12 w-12 text-yellow-400 animate-pulse" />
                  <p className="text-white font-medium">매장 앱 대기 중</p>
                  <p className="text-gray-400 text-sm">태블릿/PC에서 앱이 열려 있으면 화면을 받아옵니다</p>
                  <p className="text-gray-500 text-xs">
                    {retryCount > 0 ? `자동 재시도 중 (${retryCount}회)...` : "잠시 후 자동으로 재시도합니다"}
                  </p>
                </>
              )}
              {status === "ended" && (
                <>
                  <WifiOff className="h-12 w-12 text-gray-400" />
                  <p className="text-white font-medium">연결이 끊겼습니다</p>
                  <p className="text-gray-500 text-xs">재연결을 시도합니다...</p>
                </>
              )}
              {status === "error" && (
                <>
                  <AlertCircle className="h-12 w-12 text-red-400" />
                  <p className="text-white font-medium">연결 실패</p>
                  <p className="text-red-300 text-sm">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-2 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md"
                  >
                    <RefreshCw className="h-4 w-4" /> 다시 시도
                  </button>
                </>
              )}
            </div>
          )}

          {(imageSrc || status === "live") && (
            <div className="absolute top-2 left-2 flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-white text-xs font-bold tracking-wider">원격 화면</span>
              {capturedAt && (
                <span className="text-gray-300 text-xs">{capturedAt.toLocaleTimeString("ko-KR")} 캡처</span>
              )}
              {refreshing && <span className="text-sky-300 text-xs">갱신 중</span>}
            </div>
          )}
        </div>
      </div>

      {(imageSrc || status === "live") && (
        <div className="fixed bottom-3 right-3 z-20 flex items-center gap-2 rounded-lg bg-black/70 px-2 py-1.5">
          <button
            type="button"
            onClick={() => requestShot()}
            disabled={refreshing}
            className="flex h-8 items-center gap-1 rounded bg-white/10 px-2 text-xs text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
          <button
            type="button"
            aria-label="축소"
            onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))}
            className="flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center text-xs text-white">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="확대"
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.5) * 10) / 10))}
            className="flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
