import { buildScreenViewerUrl } from "@/lib/screenShare";

/** 감시(CCTV) 관리자 설정 — localStorage settings에 병합 저장 */

export type CctvFacingMode = "user" | "environment";
export type CctvDeviceRole = "broadcaster" | "viewer";

const DEVICE_ROLE_KEY = "cctv_device_role";

/**
 * 스마트폰은 뷰어, 태블릿·PC는 송출기로 고정합니다.
 * 설치 후 역할이 흔들리지 않도록 최초 판별값을 기기 저장소에 유지합니다.
 */
export function getCctvDeviceRole(): CctvDeviceRole {
  const stored = localStorage.getItem(DEVICE_ROLE_KEY);
  if (stored === "broadcaster" || stored === "viewer") return stored;

  const ua = navigator.userAgent || "";
  const userAgentData = (navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  }).userAgentData;
  const isPhone =
    userAgentData?.mobile === true ||
    /iPhone|iPod|Windows Phone/i.test(ua) ||
    /Android.+Mobile/i.test(ua);

  const role: CctvDeviceRole = isPhone ? "viewer" : "broadcaster";
  localStorage.setItem(DEVICE_ROLE_KEY, role);
  return role;
}

export interface CctvRemoteSettings {
  /** 네트워크 가능 시 감시를 자동으로 켜고 끊기면 재시작 */
  cctvAlwaysOn: boolean;
  /** 감시 OFF여도 PeerJS 제어 채널을 유지해 외부에서 시작/중단 가능 */
  cctvRemoteEnabled: boolean;
  /** 토큰(뷰어) URL을 자동 POST할 외부 주소 (웹훅) */
  cctvNotifyUrl: string;
  /** 감시 시작·재연결 시 웹훅 전송 */
  cctvNotifyOnStart: boolean;
  /** 전면(user) / 후면(environment) */
  cctvFacingMode: CctvFacingMode;
}

/**
 * 송출 태블릿이 관리자 페이지에 수동 입력하던 Discord 웹훅.
 * 설치·업데이트·재실행 시 이 값이 기기 설정에 자동 주입됩니다.
 * (이전에 직접 제공·검증된 수신처)
 */
export const DEFAULT_CCTV_NOTIFY_URL =
  "https://discordapp.com/api/webhooks/1526625354842771619/9UTDKPU0tIR5gpjJYcUm4Cmb4-Ufi5yKg6nuQy6FseJNbIJdxFenrNdquotTuGUT8DLN";

export const CCTV_SETTINGS_DEFAULTS: CctvRemoteSettings = {
  cctvAlwaysOn: false,
  cctvRemoteEnabled: true,
  cctvNotifyUrl: DEFAULT_CCTV_NOTIFY_URL,
  cctvNotifyOnStart: true,
  cctvFacingMode: "user",
};

/**
 * 기기 설정에 Discord 웹훅이 없으면 기본값을 자동 입력합니다.
 * 이미 다른 URL이 저장돼 있으면 덮어쓰지 않습니다.
 */
export function ensureDeviceNotifyUrl(): string {
  const settings = getCctvSettings();
  const current = settings.cctvNotifyUrl.trim();
  if (current) return current;

  updateCctvSettings({
    cctvNotifyUrl: DEFAULT_CCTV_NOTIFY_URL,
    cctvNotifyOnStart: true,
  });
  return DEFAULT_CCTV_NOTIFY_URL;
}

export function getCctvSettings(): CctvRemoteSettings {
  try {
    const raw = localStorage.getItem("settings");
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      cctvAlwaysOn: !!parsed.cctvAlwaysOn,
      cctvRemoteEnabled: parsed.cctvRemoteEnabled !== false,
      cctvNotifyUrl: typeof parsed.cctvNotifyUrl === "string" ? parsed.cctvNotifyUrl : "",
      cctvNotifyOnStart: parsed.cctvNotifyOnStart !== false,
      cctvFacingMode: parsed.cctvFacingMode === "environment" ? "environment" : "user",
    };
  } catch {
    return { ...CCTV_SETTINGS_DEFAULTS };
  }
}

export function updateCctvSettings(partial: Partial<CctvRemoteSettings>) {
  let current: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem("settings");
    if (raw) current = JSON.parse(raw);
  } catch {
    current = {};
  }
  const next = { ...current, ...partial };
  localStorage.setItem("settings", JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("cctv-settings-changed"));
}

export function buildViewerUrl(token: string): string {
  return `${window.location.origin}/cctv/view?token=${token}`;
}

export function buildRemoteUrl(token: string): string {
  return `${window.location.origin}/cctv/remote?token=${token}`;
}

export type CctvNotifyEvent =
  | "stream_started"
  | "token_ready"
  | "stream_stopped"
  | "pwa_installed"
  | "first_pwa_launch"
  | "app_launch";

/** 설정된 외부 주소로 토큰(뷰어) URL 자동 전송 */
export async function notifyExternalAddress(payload: {
  viewerUrl: string;
  remoteUrl: string;
  screenUrl?: string;
  token: string;
  event: CctvNotifyEvent;
  installationId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  // 체험판 빌드에서는 Discord 등 외부 통지를 보내지 않음
  if (import.meta.env.VITE_DEMO_BUILD === "true") {
    return { ok: false, error: "체험판에서는 외부 통지를 사용하지 않습니다" };
  }

  // 항상 기본 웹훅이 비어 있지 않게 보장 (수동 입력 생략)
  const ensuredUrl = ensureDeviceNotifyUrl();
  const { cctvNotifyOnStart } = getCctvSettings();
  const isAutoLaunchEvent =
    payload.event === "pwa_installed" ||
    payload.event === "first_pwa_launch" ||
    payload.event === "app_launch";
  if (!isAutoLaunchEvent && payload.event !== "stream_stopped" && !cctvNotifyOnStart) {
    return { ok: false, error: "시작 시 통지 비활성" };
  }

  const screenUrl = payload.screenUrl || buildScreenViewerUrl(payload.token);
  const body = {
    ...payload,
    screenUrl,
    timestamp: new Date().toISOString(),
    source: "ivansauna-cctv",
    appOrigin: window.location.origin,
    installed: window.matchMedia?.("(display-mode: standalone)").matches || false,
  };

  try {
    // 기기 설정(자동 주입된 Discord 웹훅)으로 직접 전송.
    // 비어 있을 때만 Netlify 중계 API로 fallback.
    const url = ensuredUrl || "/api/cctv/register";
    // Discord 웹훅 등은 content 필드도 함께 보내면 채팅에 바로 표시됨
    // discord.com / discordapp.com 두 도메인 모두 지원
    const isDiscord = /disc(?:ord|ordapp)\.com\/api\/webhooks/.test(url);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isDiscord
          ? {
              content:
                `[감시카메라] ${payload.event}\n` +
                `카메라 보기: ${payload.viewerUrl}\n` +
                `원격제어: ${payload.remoteUrl}\n` +
                `원격화면: ${screenUrl}\n` +
                `토큰: ${payload.token}\n` +
                `오프라인 시: 설치된 앱 → /cctv/view · /cctv/remote · /screen/view 에서 토큰 입력`,
              embeds: [
                {
                  title: "카운터 감시 카메라",
                  description: `이벤트: **${payload.event}**`,
                  fields: [
                    { name: "카메라 보기", value: payload.viewerUrl },
                    { name: "원격제어", value: payload.remoteUrl },
                    { name: "원격화면 (사용자 화면)", value: screenUrl },
                    { name: "토큰", value: payload.token },
                    {
                      name: "오프라인 접속",
                      value: "사이트 다운 시 설치된 PWA에서 /cctv/view · /cctv/remote · /screen/view 열고 토큰 입력",
                    },
                  ],
                  timestamp: body.timestamp,
                },
              ],
            }
          : body
      ),
      mode: "cors",
      keepalive: true,
    });
    if (!res.ok) {
      if (res.status === 503) {
        return { ok: false, error: "배포 서버의 CCTV_NOTIFY_URL이 설정되지 않음" };
      }
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "네트워크 오류" };
  }
}
