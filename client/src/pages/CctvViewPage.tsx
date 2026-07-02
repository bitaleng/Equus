import { useState, useEffect, useRef } from "react";
import { Wifi, WifiOff, AlertCircle } from "lucide-react";

export default function CctvViewPage() {
  const imgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastFrameTime, setLastFrameTime] = useState<Date | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  const token = new URLSearchParams(window.location.search).get("token") || "";

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("접속 코드가 없습니다. 올바른 링크를 사용하세요.");
      return;
    }

    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${window.location.host}/ws/camera?role=viewer&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus("waiting");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "viewer_connected") {
          setStatus("waiting");
        } else if (msg.type === "stream_ended") {
          setStatus("ended");
        } else if (msg.type === "error") {
          setStatus("error");
          setErrorMsg(msg.message || "연결 오류");
        } else if (msg.type === "frame" && msg.data) {
          // Render JPEG frame
          if (imgRef.current) {
            imgRef.current.src = msg.data;
          }
          setStatus("live");
          setLastFrameTime(new Date());
          setFrameCount(c => c + 1);
        }
      } catch {
        // binary or parse error — ignore
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setErrorMsg("서버에 연결할 수 없습니다.");
    };

    ws.onclose = (ev) => {
      if (ev.code === 1000) return;
      if (status !== "error") setStatus("ended");
    };

    return () => {
      ws.close();
      if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      {/* Live feed */}
      <div className="relative w-full max-w-2xl">
        <img
          ref={imgRef}
          className={`w-full object-contain ${status === "live" ? "block" : "hidden"}`}
          alt="CCTV"
          data-testid="cctv-view-image"
        />

        {/* Overlay for non-live states */}
        {status !== "live" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-6">
            {status === "connecting" && (
              <>
                <Wifi className="h-12 w-12 text-gray-400 animate-pulse" />
                <p className="text-gray-300 text-sm">서버에 연결 중...</p>
              </>
            )}
            {status === "waiting" && (
              <>
                <Wifi className="h-12 w-12 text-yellow-400 animate-pulse" />
                <p className="text-white font-medium">스트리밍 대기 중</p>
                <p className="text-gray-400 text-sm">
                  태블릿에서 감시 시작 버튼을 눌러주세요
                </p>
              </>
            )}
            {status === "ended" && (
              <>
                <WifiOff className="h-12 w-12 text-gray-400" />
                <p className="text-white font-medium">스트리밍이 종료되었습니다</p>
                <p className="text-gray-400 text-sm">페이지를 새로고침하면 재연결됩니다</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
                >
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
                  className="mt-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-md transition-colors"
                >
                  다시 시도
                </button>
              </>
            )}
          </div>
        )}

        {/* Live status bar */}
        {status === "live" && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 bg-black/60 rounded">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-xs font-bold tracking-wider">LIVE</span>
            </div>
            {lastFrameTime && (
              <span className="text-gray-300 text-xs">
                {lastFrameTime.toLocaleTimeString("ko-KR")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
