import { getStoredLicense, storeLicense, clearLicense, LICENSE_STORAGE_KEY } from "@/lib/licenseValidation";
import { persistLicenseToDatabase } from "@/lib/localDb";
import { cacheStoreProfile, getCachedStoreProfile, seedSettingsFromProfileIfNeeded, type StoreProfile } from "@/lib/storeProfile";

/**
 * 정식 라이선스의 실제 인증 창구. 서명 검증·기기 바인딩은 전부
 * netlify/functions/license-bind.ts(서버, Netlify Blobs)에서만 이뤄진다 —
 * 클라이언트에는 비밀키가 없으므로 위조된 키는 서버가 거부한다.
 *
 * 오프라인 앱 특성상, 최초 등록(activate)만 인터넷이 필요하고
 * 그 이후에는 서버 확인 성공 시각 기준 OFFLINE_GRACE_MS 동안은
 * 인터넷 없이도 계속 사용할 수 있다(온라인일 때마다 자동으로 갱신됨).
 */

const DEVICE_ID_KEY = `${LICENSE_STORAGE_KEY}_device_id`;
const LAST_SYNC_KEY = `${LICENSE_STORAGE_KEY}_synced_at`;
const INSTALL_ID_KEY = `${LICENSE_STORAGE_KEY}_install_id`;
const IDB_NAME = 'ivansauna-license';
const IDB_STORE = 'meta';

/** 서버 확인 성공 후 오프라인 허용 기간 */
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export type BindResult = {
  ok: boolean;
  deviceId?: string;
  expiresAt?: string;
  offline?: boolean;
  otherDevice?: boolean;
  boundDeviceId?: string;
  needsReconnect?: boolean;
  error?: string;
  message?: string;
};

/** 변동이 적은 항목만 사용 — 데모 지문 로직과 동일한 패턴 */
function getFingerprint(): string {
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
  ].join("|");
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openIdb();
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
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/** localStorage + IndexedDB 이중 보관 — 사이트 데이터 전부 삭제 시에만 사라짐 */
async function getInstallId(): Promise<string> {
  const fromLs = localStorage.getItem(INSTALL_ID_KEY);
  if (fromLs && fromLs.length >= 16) {
    void idbSet(INSTALL_ID_KEY, fromLs);
    return fromLs;
  }
  const fromIdb = await idbGet(INSTALL_ID_KEY);
  if (fromIdb && fromIdb.length >= 16) {
    localStorage.setItem(INSTALL_ID_KEY, fromIdb);
    return fromIdb;
  }
  const created = createInstallId();
  localStorage.setItem(INSTALL_ID_KEY, created);
  await idbSet(INSTALL_ID_KEY, created);
  return created;
}

function saveSyncState(deviceId: string): void {
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

function clearSyncState(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

function getLastSyncAgeMs(): number | null {
  const syncedAt = localStorage.getItem(LAST_SYNC_KEY);
  if (!syncedAt) return null;
  const age = Date.now() - new Date(syncedAt).getTime();
  return age >= 0 ? age : null;
}

export function getBoundDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY);
}

async function callApi(
  action: "activate" | "sync" | "unregister" | "reclaim",
  licenseKey: string
): Promise<any> {
  const installId = await getInstallId();
  const response = await fetch("/.netlify/functions/license-bind", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      licenseKey,
      fingerprint: getFingerprint(),
      installId,
      previousDeviceId: getBoundDeviceId() || undefined,
    }),
  });

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`서버 응답이 올바르지 않습니다. (HTTP ${response.status})`);
  }
  return { httpOk: response.ok, status: response.status, data };
}

/** 새 라이선스 키 최초 등록. 반드시 온라인이어야 하며, 오프라인 폴백이 없다. */
export async function activateLicense(licenseKeyRaw: string): Promise<BindResult> {
  const licenseKey = licenseKeyRaw.trim().toUpperCase();
  let result: { httpOk: boolean; status: number; data: any };
  try {
    result = await callApi("activate", licenseKey);
  } catch {
    return {
      ok: false,
      error: "라이선스 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.",
    };
  }

  const { httpOk, data } = result;
  if (!httpOk || !data.ok) {
    return {
      ok: false,
      otherDevice: !!data.otherDevice,
      boundDeviceId: typeof data.boundDeviceId === "string" ? data.boundDeviceId : undefined,
      error: typeof data.error === "string" ? data.error : "라이선스 등록에 실패했습니다.",
    };
  }

  storeLicense(licenseKey);
  persistLicenseToDatabase(licenseKey);
  saveSyncState(String(data.deviceId));
  const storeProfile = (data.storeProfile as StoreProfile | null) ?? null;
  cacheStoreProfile(storeProfile);
  seedSettingsFromProfileIfNeeded(storeProfile);
  return { ok: true, deviceId: String(data.deviceId), expiresAt: String(data.expiresAt), message: data.message };
}

/**
 * 저장된 라이선스가 여전히 유효한지 서버에 확인.
 * 온라인이면 서버 응답이 진실. 오프라인이면 마지막 성공 확인 시각으로부터
 * OFFLINE_GRACE_MS 이내일 때만 계속 사용 허용(offline:true로 표시).
 */
export async function syncLicenseBinding(): Promise<BindResult> {
  const licenseKey = getStoredLicense();
  if (!licenseKey) return { ok: false, error: "등록된 라이선스가 없습니다." };

  try {
    const { httpOk, data } = await callApi("sync", licenseKey);
    if (!httpOk || !data.ok) {
      // 서버가 명확히 거부(만료·다른 기기 등) — 오프라인 유예 없이 즉시 반영
      return {
        ok: false,
        otherDevice: !!data.otherDevice,
        boundDeviceId: typeof data.boundDeviceId === "string" ? data.boundDeviceId : undefined,
        error: typeof data.error === "string" ? data.error : "라이선스 확인에 실패했습니다.",
      };
    }
    if (data.unbound) {
      // 서버 기록이 없음(다른 서버로 이전 등) — 재등록 필요
      clearSyncState();
      return { ok: false, error: data.message || "이 기기에 등록된 라이선스 기록이 없습니다. 다시 등록해주세요." };
    }
    saveSyncState(String(data.deviceId));
    cacheStoreProfile((data.storeProfile as StoreProfile | null) ?? null);
    return { ok: true, deviceId: String(data.deviceId), expiresAt: String(data.expiresAt) };
  } catch {
    // 관리자가 이 매장에 "영구 오프라인" 을 켜준 경우 — 유예기간 없이 계속 허용
    if (getCachedStoreProfile()?.offlineModeEnabled) {
      return { ok: true, offline: true, deviceId: getBoundDeviceId() || undefined };
    }
    // 네트워크 실패 — 유예기간 내면 오프라인 계속 허용
    const age = getLastSyncAgeMs();
    if (age !== null && age < OFFLINE_GRACE_MS) {
      return { ok: true, offline: true, deviceId: getBoundDeviceId() || undefined };
    }
    return {
      ok: false,
      needsReconnect: true,
      error:
        age === null
          ? "인터넷에 연결한 뒤 라이선스를 다시 확인해주세요."
          : "오프라인 사용 가능 기간이 지났습니다. 인터넷에 연결한 뒤 다시 열어주세요.",
    };
  }
}

export async function unregisterLicenseDevice(): Promise<{ success: boolean; message: string }> {
  const licenseKey = getStoredLicense();
  if (licenseKey) {
    try {
      await callApi("unregister", licenseKey);
    } catch {
      // 서버 연결 실패해도 이 기기의 로컬 등록은 지운다 (재시도 가능하도록)
    }
  }
  clearLicense();
  clearSyncState();
  persistLicenseToDatabase(null);
  cacheStoreProfile(null);
  return {
    success: true,
    message: "이 기기의 라이선스가 삭제되었습니다. 다시 입력하면 사용할 수 있습니다.",
  };
}

/** "다른 기기에서 이미 사용 중" 충돌 시, 기존 등록을 강제로 해제하고 이 기기로 옮긴다 */
export async function reclaimLicenseDevice(licenseKeyRaw: string): Promise<BindResult> {
  const licenseKey = licenseKeyRaw.trim().toUpperCase();
  try {
    const { httpOk, data } = await callApi("reclaim", licenseKey);
    if (!httpOk || !data.ok) {
      return { ok: false, error: typeof data.error === "string" ? data.error : "기기 이전에 실패했습니다." };
    }
    storeLicense(licenseKey);
    persistLicenseToDatabase(licenseKey);
    saveSyncState(String(data.deviceId));
    cacheStoreProfile((data.storeProfile as StoreProfile | null) ?? null);
    return { ok: true, deviceId: String(data.deviceId), expiresAt: String(data.expiresAt), message: data.message };
  } catch {
    return { ok: false, error: "라이선스 서버에 연결하지 못했습니다. 인터넷 연결을 확인해주세요." };
  }
}
