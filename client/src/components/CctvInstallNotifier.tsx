import { useEffect, useRef } from "react";
import { useCctv } from "@/contexts/CctvContext";
import {
  buildRemoteUrl,
  buildViewerUrl,
  ensureDeviceNotifyUrl,
  notifyExternalAddress,
  type CctvNotifyEvent,
} from "@/lib/cctvSettings";
import { buildScreenViewerUrl } from "@/lib/screenShare";

const INSTALLATION_ID_KEY = "cctv_installation_id";
const LAST_LAUNCH_NOTIFY_KEY = "cctv_last_launch_notify_at";
/** 같은 실행 중 중복 전송 방지 (StrictMode/빠른 리마운트). 재실행 시에는 다시 전송 */
const LAUNCH_COOLDOWN_MS = 15_000;

function getInstallationId(): string {
  const existing = localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}

function canSendLaunchNotice(token: string): boolean {
  try {
    const raw = sessionStorage.getItem(LAST_LAUNCH_NOTIFY_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { token?: string; at?: number };
    if (parsed.token === token && typeof parsed.at === "number") {
      return Date.now() - parsed.at >= LAUNCH_COOLDOWN_MS;
    }
  } catch {
    // ignore
  }
  return true;
}

function markLaunchNoticeSent(token: string) {
  try {
    sessionStorage.setItem(
      LAST_LAUNCH_NOTIFY_KEY,
      JSON.stringify({ token, at: Date.now() })
    );
  } catch {
    // ignore
  }
}

/**
 * 송출 태블릿: Discord 웹훅을 기기 설정에 자동 입력하고,
 * 설치·업데이트·앱 재실행마다 뷰어/원격 URL을 Discord로 자동 전송합니다.
 * (관리자 페이지에서 URL 입력 → 테스트전송 하던 2단계를 자동화)
 */
export function CctvInstallNotifier() {
  const { token, deviceRole } = useCctv();
  const sendingRef = useRef(false);

  useEffect(() => {
    // 데모(체험) 빌드: Discord 자동 전송·웹훅 주입 없음
    if (import.meta.env.VITE_DEMO_BUILD === "true") return;
    if (deviceRole !== "broadcaster" || !token) return;

    // peerjs 동적 청크를 미리 받아 SW 런타임 캐시에 남김
    void import("peerjs").catch(() => {});

    // 1) 관리자페이지 「이 기기 전용 직접 통지 URL」 자동 입력
    ensureDeviceNotifyUrl();

    const installationId = getInstallationId();

    const sendNotice = async (event: CctvNotifyEvent) => {
      if (sendingRef.current) return;
      if (!canSendLaunchNotice(token)) return;

      sendingRef.current = true;
      try {
        ensureDeviceNotifyUrl();
        const result = await notifyExternalAddress({
          viewerUrl: buildViewerUrl(token),
          remoteUrl: buildRemoteUrl(token),
          screenUrl: buildScreenViewerUrl(token),
          token,
          event,
          installationId,
        });

        if (result.ok) {
          markLaunchNoticeSent(token);
        } else {
          console.warn("[CCTV] 자동 전송 실패:", result.error);
        }
      } finally {
        sendingRef.current = false;
      }
    };

    const handleInstalled = () => {
      void sendNotice("pwa_installed");
    };

    window.addEventListener("appinstalled", handleInstalled);

    // 2) 설치·업데이트·종료 후 재실행 모두: 곧바로 테스트전송과 동일하게 Discord 전송
    void sendNotice("app_launch");

    return () => {
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [deviceRole, token]);

  return null;
}
