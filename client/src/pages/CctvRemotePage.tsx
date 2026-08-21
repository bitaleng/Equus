import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, CameraOff, RefreshCw, Link2, Copy, Check, Wifi, WifiOff,
  AlertCircle, ExternalLink, Power,
} from "lucide-react";
import type { Peer as PeerType, DataConnection } from "peerjs";

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  },
  debug: 0,
};

type RemoteStatus = {
  isStreaming: boolean;
  peerStatus: string;
  viewerUrl: string;
  remoteUrl: string;
  screenUrl: string;
  viewerCount: number;
  cameraError: string | null;
  desiredStreaming: boolean;
  token: string;
};

export default function CctvRemotePage() {
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(() => (params.get("token") || "").trim().toUpperCase());
  const [tokenDraft, setTokenDraft] = useState("");

  const peerRef = useRef<PeerType | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const [connState, setConnState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastAck, setLastAck] = useState<string | null>(null);
  const [lastAckOk, setLastAckOk] = useState(true);

  const handleMessage = useCallback((raw: unknown) => {
    let msg: any;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.type === "status") {
      setStatus({
        isStreaming: !!msg.isStreaming,
        peerStatus: msg.peerStatus || "idle",
        viewerUrl: msg.viewerUrl || "",
        remoteUrl: msg.remoteUrl || "",
        screenUrl: msg.screenUrl || "",
        viewerCount: msg.viewerCount || 0,
        cameraError: msg.cameraError || null,
        desiredStreaming: !!msg.desiredStreaming,
        token: msg.token || token,
      });
      setError(null);
    } else if (msg.type === "ack") {
      setLastAck(msg.ok ? (msg.message || "완료") : (msg.message || "실패"));
      setLastAckOk(!!msg.ok);
      setBusy(false);
      if (!msg.ok) {
        setError(msg.message || "명령 실패");
      }
    }
  }, [token]);

  const connect = useCallback(async () => {
    if (!token) return;
    setConnState("connecting");
    setError(null);

    try {
      if (connRef.current) {
        try { connRef.current.close(); } catch {}
        connRef.current = null;
      }
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch {}
        peerRef.current = null;
      }

      const { default: Peer } = await import("peerjs");
      const peer = new Peer(PEER_CONFIG);
      peerRef.current = peer;

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("연결 시간 초과")), 15000);
        peer.on("open", () => { clearTimeout(t); resolve(); });
        peer.on("error", (e: any) => { clearTimeout(t); reject(e); });
      });

      const conn = peer.connect(token, { reliable: true });
      connRef.current = conn;

      conn.on("open", () => {
        setConnState("connected");
        try {
          conn.send(JSON.stringify({ type: "cmd", action: "status" }));
        } catch {}
      });
      conn.on("data", handleMessage);
      conn.on("close", () => {
        setConnState("error");
        setError("태블릿과의 제어 연결이 끊겼습니다. 재연결을 눌러 주세요.");
      });
      conn.on("error", () => {
        setConnState("error");
        setError("제어 연결 오류. 태블릿 앱이 켜져 있는지 확인하세요.");
      });
    } catch (e: any) {
      setConnState("error");
      setError(e?.message || "연결 실패. 태블릿에서 원격제어가 켜져 있는지 확인하세요.");
    }
  }, [handleMessage, token]);

  useEffect(() => {
    if (!token) return;
    connect();
    return () => {
      try { connRef.current?.close(); } catch {}
      try { peerRef.current?.destroy(); } catch {}
    };
  }, [token, connect]);

  const sendCmd = (action: "start" | "stop" | "restart" | "status" | "notify") => {
    if (!connRef.current?.open) {
      setError("제어 채널이 연결되어 있지 않습니다.");
      return;
    }
    setBusy(true);
    setLastAck(null);
    try {
      connRef.current.send(JSON.stringify({ type: "cmd", action }));
    } catch {
      setBusy(false);
      setError("명령 전송 실패");
    }
    // status는 ack 대기 짧게
    if (action === "status") {
      setTimeout(() => setBusy(false), 1500);
    }
  };

  const copyViewer = async () => {
    const url = status?.viewerUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <AlertCircle className="h-10 w-10 text-yellow-400 mx-auto" />
          <p className="text-white font-medium">원격 제어 — 접속 코드 입력</p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            사이트 링크가 열리지 않을 때, 설치된 앱의 원격 제어 화면에서
            Discord에 온 토큰을 붙여넣으세요.
          </p>
          <input
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="20자리 토큰"
            maxLength={20}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-center font-mono text-sm text-white tracking-wider"
            data-testid="input-cctv-remote-offline-token"
          />
          <button
            type="button"
            disabled={tokenDraft.length < 16}
            onClick={() => {
              const next = tokenDraft.trim().toUpperCase();
              window.history.replaceState(null, "", `/cctv/remote?token=${next}`);
              setToken(next);
            }}
            className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            접속
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">원격 감시 제어</p>
          <h1 className="text-xl font-semibold mt-1">카운터 CCTV</h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono break-all">토큰 {token}</p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 flex items-center gap-3">
          {connState === "connected" ? (
            <Wifi className="h-4 w-4 text-emerald-400" />
          ) : connState === "connecting" ? (
            <RefreshCw className="h-4 w-4 text-amber-400 animate-spin" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-400" />
          )}
          <div className="flex-1 text-sm">
            {connState === "connected" && "태블릿 제어 채널 연결됨"}
            {connState === "connecting" && "연결 중..."}
            {connState === "error" && "연결 끊김"}
            {connState === "idle" && "대기"}
          </div>
          <button
            type="button"
            onClick={connect}
            className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
          >
            재연결
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {lastAck && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              lastAckOk
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            {lastAck}
          </div>
        )}

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">감시 상태</span>
            <span className={`text-sm font-medium ${status?.isStreaming ? "text-red-400" : "text-zinc-400"}`}>
              {status?.isStreaming ? "LIVE" : "꺼짐"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>시청자 {status?.viewerCount ?? 0}명</span>
            <span>{status?.peerStatus || "-"}</span>
          </div>
          {status?.cameraError && (
            <p className="text-xs text-amber-400">{status.cameraError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || connState !== "connected"}
            onClick={() => sendCmd("start")}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 py-3 text-sm font-medium"
          >
            <Camera className="h-4 w-4" />
            감시 시작
          </button>
          <button
            type="button"
            disabled={busy || connState !== "connected"}
            onClick={() => sendCmd("stop")}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 py-3 text-sm font-medium"
          >
            <CameraOff className="h-4 w-4" />
            감시 중단
          </button>
          <button
            type="button"
            disabled={busy || connState !== "connected"}
            onClick={() => sendCmd("restart")}
            className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40 py-3 text-sm"
          >
            <Power className="h-4 w-4" />
            재시작
          </button>
          <button
            type="button"
            disabled={busy || connState !== "connected"}
            onClick={() => sendCmd("status")}
            className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 disabled:opacity-40 py-3 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            상태 갱신
          </button>
        </div>

        {status?.viewerUrl && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 space-y-2">
            <p className="text-xs text-zinc-400 flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              뷰어 주소
            </p>
            <code className="block text-[11px] break-all text-zinc-300 bg-black/40 rounded px-2 py-2">
              {status.viewerUrl}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyViewer}
                className="flex-1 flex items-center justify-center gap-1.5 rounded border border-zinc-700 py-2 text-xs hover:bg-zinc-800"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                복사
              </button>
              <a
                href={status.viewerUrl}
                className="flex-1 flex items-center justify-center gap-1.5 rounded border border-zinc-700 py-2 text-xs hover:bg-zinc-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                영상 보기
              </a>
            </div>
          </div>
        )}

        {(status?.screenUrl || status?.token) && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 space-y-2">
            <p className="text-xs text-zinc-400 flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              원격화면 (사용자가 보는 앱)
            </p>
            <code className="block text-[11px] break-all text-zinc-300 bg-black/40 rounded px-2 py-2">
              {status.screenUrl || `${window.location.origin}/screen/view?token=${status.token}`}
            </code>
            <a
              href={status.screenUrl || `/screen/view?token=${status.token}`}
              className="flex items-center justify-center gap-1.5 rounded border border-sky-700/60 bg-sky-950/40 py-2 text-xs hover:bg-sky-900/40"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              원격화면 열기
            </a>
          </div>
        )}

        <p className="text-[11px] text-zinc-600 leading-relaxed">
          태블릿에서 앱이 켜져 있고 와이파이/인터넷이 연결되어 있어야 원격 제어가 가능합니다.
          상시 감시 모드를 켜 두면 네트워크가 살아 있는 동안 자동으로 다시 연결됩니다.
        </p>
      </div>
    </div>
  );
}
