import CryptoJS from "crypto-js";

const DEMO_START_DATE_KEY = "demo_start_date";
const DEMO_TRIAL_DAYS_KEY = "demo_trial_days";
const DEMO_DEVICE_ID_KEY = "demo_device_id";
const DEMO_SYNC_AT_KEY = "demo_sync_at";
const DEMO_REMAINING_MS_KEY = "demo_remaining_ms_at_sync";
const DEMO_INSTALL_ID_KEY = "demo_install_id";
const DEMO_NEEDS_START_KEY = "demo_needs_start";
const DEFAULT_DEMO_TRIAL_DAYS = 10;
const MAX_DEMO_TRIAL_DAYS = 30;
/** 서버 확인 성공 후 오프라인 허용 시간 (만료 우회용 아님 — remainingMs도 함께 감소) */
const OFFLINE_GRACE_MS = 48 * 60 * 60 * 1000;
const IDB_NAME = "ivansauna-demo";
const IDB_STORE = "meta";

export type DemoTrialSnapshot = {
  deviceId: string;
  startDate: string | null;
  trialDays: number;
  remainingMs: number;
  remainingDays: number;
  expired: boolean;
  /** true면 아직 서버에 체험 미등록 — 시작 코드 필요 */
  needsStart: boolean;
  source: "server" | "cache";
};

/**
 * 빌드 타임 플래그: 데모 전용 사이트용 zip에서만 true.
 */
export function isDemoBuild(): boolean {
  return import.meta.env.VITE_DEMO_BUILD === "true";
}

export const DEMO_SITE_MARKER =
  import.meta.env.VITE_DEMO_BUILD === "true" ? "IVANSAUNA_DEMO_SITE" : "";

export function isStaticHosting(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname.includes("netlify.app") ||
    hostname.includes("netlify.com") ||
    hostname.includes("vercel.app") ||
    hostname.includes("github.io") ||
    hostname.includes("pages.dev")
  );
}

export function isDemoMode(): boolean {
  return isDemoBuild();
}

function getSkin(): "demo" {
  return "demo";
}

/** 변동이 적은 항목만 사용 — languages 배열·colorDepth 등은 제외 */
export function getDemoFingerprint(): string {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const scr = typeof screen !== "undefined" ? screen : ({} as Screen);
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
      : "";

  return [
    nav.userAgent || "",
    nav.language || "",
    tz,
    `${scr.width || 0}x${scr.height || 0}`,
    String(nav.hardwareConcurrency || 0),
    nav.platform || "",
    String(nav.maxTouchPoints || 0),
    getSkin(),
  ].join("|");
}

function fingerprintToDeviceId(fingerprint: string): string {
  return CryptoJS.SHA256(fingerprint)
    .toString(CryptoJS.enc.Hex)
    .substring(0, 12)
    .toUpperCase();
}

function openDemoIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDemoIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(typeof v === "string" ? v : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDemoIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function createInstallId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

/** localStorage + IndexedDB에 보관 — 사이트 데이터 전부 삭제 시에만 사라짐 */
export async function getDemoInstallId(): Promise<string> {
  const fromLs = localStorage.getItem(DEMO_INSTALL_ID_KEY);
  if (fromLs && fromLs.length >= 16) {
    void idbSet(DEMO_INSTALL_ID_KEY, fromLs);
    return fromLs;
  }
  const fromIdb = await idbGet(DEMO_INSTALL_ID_KEY);
  if (fromIdb && fromIdb.length >= 16) {
    localStorage.setItem(DEMO_INSTALL_ID_KEY, fromIdb);
    return fromIdb;
  }
  const created = createInstallId();
  localStorage.setItem(DEMO_INSTALL_ID_KEY, created);
  await idbSet(DEMO_INSTALL_ID_KEY, created);
  return created;
}

function saveLocalSnapshot(snapshot: DemoTrialSnapshot): void {
  localStorage.setItem(DEMO_DEVICE_ID_KEY, snapshot.deviceId);
  if (snapshot.startDate) {
    localStorage.setItem(DEMO_START_DATE_KEY, snapshot.startDate);
  } else {
    localStorage.removeItem(DEMO_START_DATE_KEY);
  }
  localStorage.setItem(DEMO_TRIAL_DAYS_KEY, String(snapshot.trialDays));
  localStorage.setItem(DEMO_SYNC_AT_KEY, new Date().toISOString());
  localStorage.setItem(DEMO_REMAINING_MS_KEY, String(snapshot.remainingMs));
  localStorage.setItem(DEMO_NEEDS_START_KEY, snapshot.needsStart ? "1" : "0");
}

function readCachedSnapshot(): DemoTrialSnapshot | null {
  const deviceId = localStorage.getItem(DEMO_DEVICE_ID_KEY);
  const startDate = localStorage.getItem(DEMO_START_DATE_KEY);
  const trialDays = Number(localStorage.getItem(DEMO_TRIAL_DAYS_KEY));
  const syncAt = localStorage.getItem(DEMO_SYNC_AT_KEY);
  const remainingAtSync = Number(localStorage.getItem(DEMO_REMAINING_MS_KEY));
  const needsStart = localStorage.getItem(DEMO_NEEDS_START_KEY) === "1";

  if (!deviceId || !syncAt || !Number.isInteger(trialDays)) {
    return null;
  }

  const syncAge = Date.now() - new Date(syncAt).getTime();
  if (syncAge < 0 || syncAge > OFFLINE_GRACE_MS) return null;

  // 시작 전 / 만료 캐시는 오프라인으로 우회 허용하지 않음
  if (needsStart) return null;

  const remainingMs = Math.max(
    0,
    (Number.isFinite(remainingAtSync) ? remainingAtSync : 0) - syncAge
  );

  return {
    deviceId,
    startDate,
    trialDays: Math.min(MAX_DEMO_TRIAL_DAYS, Math.max(DEFAULT_DEMO_TRIAL_DAYS, trialDays)),
    remainingMs,
    remainingDays: Math.ceil(remainingMs / (1000 * 60 * 60 * 24)),
    expired: remainingMs <= 0,
    needsStart: false,
    source: "cache",
  };
}

async function callDemoTrialApi(
  action: "sync" | "start" | "extend",
  code?: string
): Promise<DemoTrialSnapshot & { message?: string }> {
  const installId = await getDemoInstallId();
  let response: Response;
  try {
    response = await fetch("/.netlify/functions/demo-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        fingerprint: getDemoFingerprint(),
        installId,
        skin: getSkin(),
        code,
      }),
    });
  } catch {
    throw new Error(
      "체험 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요."
    );
  }

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `체험 서버 응답이 올바르지 않습니다. (HTTP ${response.status}) 데모 사이트를 다시 배포해 주세요.`
    );
  }

  if (!response.ok || !data?.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `체험 서버에 연결하지 못했습니다. (HTTP ${response.status})`
    );
  }

  const needsStart = !!data.needsStart;
  const snapshot: DemoTrialSnapshot = {
    deviceId: String(data.deviceId || fingerprintToDeviceId(getDemoFingerprint())),
    startDate: data.startDate ? String(data.startDate) : null,
    trialDays: Number(data.trialDays) || DEFAULT_DEMO_TRIAL_DAYS,
    remainingMs: Math.max(0, Number(data.remainingMs) || 0),
    remainingDays: Math.max(0, Number(data.remainingDays) || 0),
    expired: !!data.expired,
    needsStart,
    source: "server",
  };
  saveLocalSnapshot(snapshot);
  return {
    ...snapshot,
    message: typeof data.message === "string" ? data.message : undefined,
  };
}

/**
 * 서버에 체험 상태를 조회합니다. 미등록이면 needsStart=true (자동 생성하지 않음).
 */
export async function syncDemoTrial(): Promise<DemoTrialSnapshot> {
  if (!isDemoMode()) {
    throw new Error("체험판에서만 사용할 수 있습니다.");
  }

  try {
    return await callDemoTrialApi("sync");
  } catch (err) {
    const cached = readCachedSnapshot();
    // 만료된 캐시만 오프라인 허용 — 사용 중이었다가 잠깐 끊긴 경우
    if (cached && !cached.needsStart) return cached;
    throw err instanceof Error
      ? err
      : new Error("체험 서버에 연결하지 못했습니다. 인터넷 연결 후 다시 열어주세요.");
  }
}

/** 체험이 활성(미만료·시작 완료)인지 */
export function isDemoTrialActive(snapshot: DemoTrialSnapshot): boolean {
  return !snapshot.needsStart && !snapshot.expired && snapshot.remainingMs > 0;
}

export function initDemoMode(): void {
  if (!isDemoMode()) return;
  const fingerprint = getDemoFingerprint();
  const deviceId = fingerprintToDeviceId(fingerprint);
  if (!localStorage.getItem(DEMO_DEVICE_ID_KEY)) {
    localStorage.setItem(DEMO_DEVICE_ID_KEY, deviceId);
  }
}

export function getDemoDeviceId(): string {
  const stored = localStorage.getItem(DEMO_DEVICE_ID_KEY);
  if (stored) return stored;
  const id = fingerprintToDeviceId(getDemoFingerprint());
  localStorage.setItem(DEMO_DEVICE_ID_KEY, id);
  return id;
}

export function getDemoStartDate(): Date | null {
  const dateStr = localStorage.getItem(DEMO_START_DATE_KEY);
  if (!dateStr) return null;
  return new Date(dateStr);
}

export function getDemoTrialDays(): number {
  const stored = Number(localStorage.getItem(DEMO_TRIAL_DAYS_KEY));
  if (!Number.isInteger(stored)) return DEFAULT_DEMO_TRIAL_DAYS;
  return Math.min(MAX_DEMO_TRIAL_DAYS, Math.max(DEFAULT_DEMO_TRIAL_DAYS, stored));
}

export function getDemoRemainingMs(): number {
  const needsStart = localStorage.getItem(DEMO_NEEDS_START_KEY) === "1";
  if (needsStart) return 0;

  const syncAt = localStorage.getItem(DEMO_SYNC_AT_KEY);
  const remainingAtSync = Number(localStorage.getItem(DEMO_REMAINING_MS_KEY));
  if (syncAt && Number.isFinite(remainingAtSync)) {
    const syncAge = Date.now() - new Date(syncAt).getTime();
    return Math.max(0, remainingAtSync - syncAge);
  }

  const startDate = getDemoStartDate();
  if (!startDate) return 0;
  const trialMs = getDemoTrialDays() * 24 * 60 * 60 * 1000;
  return Math.max(0, trialMs - (Date.now() - startDate.getTime()));
}

export function getDemoRemainingDays(): number {
  return Math.ceil(getDemoRemainingMs() / (1000 * 60 * 60 * 24));
}

export function isDemoExpired(): boolean {
  if (!isDemoMode()) return false;
  if (localStorage.getItem(DEMO_NEEDS_START_KEY) === "1") return false;
  if (!localStorage.getItem(DEMO_START_DATE_KEY)) return false;
  return getDemoRemainingMs() <= 0;
}

export function isDemoNeedsStart(): boolean {
  if (!isDemoMode()) return false;
  return localStorage.getItem(DEMO_NEEDS_START_KEY) === "1";
}

/** 체험 활성일 때만 직원 비밀번호. 만료/미시작 시에는 로그인 불가. */
export function getDemoPassword(): string | null {
  if (!isDemoMode()) return null;
  if (isDemoNeedsStart() || isDemoExpired()) return null;
  if (getDemoRemainingMs() <= 0) return null;
  return "12345678";
}

export function clearDemoAuthSession(): void {
  try {
    localStorage.removeItem("authenticated");
  } catch {}
}

export function blockPwaInstall(): void {
  if (!isDemoMode()) return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  }

  document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());

  document.querySelectorAll('meta[name="mobile-web-app-capable"]').forEach((el) => el.remove());
  document.querySelectorAll('meta[name="apple-mobile-web-app-capable"]').forEach((el) => el.remove());
  document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').forEach((el) => el.remove());
}

export type DemoCodeResult = {
  success: boolean;
  message: string;
  totalDays: number;
  snapshot?: DemoTrialSnapshot;
};

export async function applyDemoStartCode(rawCode: string): Promise<DemoCodeResult> {
  if (!isDemoMode()) {
    return { success: false, message: "체험판에서만 사용할 수 있습니다.", totalDays: 0 };
  }

  try {
    const snapshot = await callDemoTrialApi("start", rawCode);
    return {
      success: true,
      message: snapshot.message || `체험이 시작되었습니다. (${snapshot.trialDays}일)`,
      totalDays: snapshot.trialDays,
      snapshot,
    };
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error ? err.message : "시작에 실패했습니다. 인터넷 연결을 확인하세요.",
      totalDays: 0,
    };
  }
}

export async function applyDemoExtensionCode(
  rawCode: string
): Promise<DemoCodeResult> {
  if (!isDemoMode()) {
    return { success: false, message: "체험판에서만 사용할 수 있습니다.", totalDays: 0 };
  }

  try {
    const snapshot = await callDemoTrialApi("extend", rawCode);
    return {
      success: true,
      message:
        snapshot.message ||
        `체험 기간이 최초 시작일부터 총 ${snapshot.trialDays}일로 연장되었습니다.`,
      totalDays: snapshot.trialDays,
      snapshot,
    };
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error ? err.message : "연장에 실패했습니다. 인터넷 연결을 확인하세요.",
      totalDays: getDemoTrialDays(),
    };
  }
}
