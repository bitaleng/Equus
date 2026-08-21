import { getStore } from "@netlify/blobs";
import { createHmac, createHash } from "node:crypto";

/**
 * 정식 라이선스 1기기 바인딩 (Netlify Blobs)
 * - activate: 키 검증 후 이 기기에 묶기 (이미 다른 기기면 거부)
 * - sync: 이 기기가 여전히 소유자인지 확인
 * - unregister: 현재 기기에서만 등록 해제 → 다른 기기로 이전 가능
 * - reclaim: 유효한 키 소유자가 기존 바인딩을 강제 해제 후 이 기기에 다시 등록
 */

const LICENSE_SECRETS = {
  v1: () =>
    [
      String.fromCharCode(69, 113, 85, 115),
      "2025!",
      String.fromCharCode(72, 111, 84, 51, 76),
      "#MnGt@",
      String.fromCharCode(83, 101, 99, 82, 51, 116),
    ].join(""),
  v2: () =>
    [
      String.fromCharCode(82, 101, 83, 111),
      "2025!",
      String.fromCharCode(82, 116, 86, 50, 83),
      "#KyMt@",
      String.fromCharCode(76, 99, 75, 114, 51, 116),
    ].join(""),
  v3: () =>
    [
      String.fromCharCode(72, 111, 77, 101),
      "2025!",
      String.fromCharCode(72, 109, 50, 52, 83),
      "#HmKy@",
      String.fromCharCode(83, 99, 82, 116, 51, 116),
    ].join(""),
} as const;

const LICENSE_PREFIXES = { v1: "EQUS", v2: "HIZZ", v3: "HOME" } as const;

type Skin = keyof typeof LICENSE_SECRETS;

type BindingRecord = {
  licenseKey: string;
  skin: Skin;
  deviceId: string;
  fingerprintHash: string;
  installIdHash?: string;
  customerCode: string;
  expiresAt: string;
  boundAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

type RequestBody = {
  action?: "sync" | "activate" | "unregister" | "reclaim";
  licenseKey?: string;
  fingerprint?: string;
  installId?: string;
  /** 이 브라우저에 저장된 이전 deviceId — 같으면 동일 기기로 인정 */
  previousDeviceId?: string;
  skin?: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function normalizeSkin(value: unknown): Skin | null {
  if (value === "v1" || value === "v2" || value === "v3") return value;
  return null;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toDeviceId(fingerprintHash: string): string {
  return fingerprintHash.slice(0, 12).toUpperCase();
}

function normalizeLicenseKey(raw: string): string {
  const cleaned = raw.replace(/[\s-]/g, "").toUpperCase();
  if (cleaned.length !== 16) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}`;
}

function licenseId(key: string): string {
  return key.replace(/-/g, "").toUpperCase();
}

function licStoreKey(skin: Skin, key: string) {
  return `lic:${skin}:${licenseId(key)}`;
}

function devStoreKey(skin: Skin, fingerprintHash: string) {
  return `dev:${skin}:${fingerprintHash}`;
}

function decodeDate(encoded: string): Date | null {
  try {
    const num = parseInt(encoded, 36);
    const day = num % 100;
    const month = Math.floor((num % 10000) / 100);
    const year = Math.floor(num / 10000) + 2020;
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020 || year > 2099) {
      return null;
    }
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
}

function validateLicenseCrypto(
  skin: Skin,
  licenseKeyRaw: string
): { licenseKey: string; customerCode: string; expiresAt: Date } | null {
  const licenseKey = normalizeLicenseKey(licenseKeyRaw);
  const cleaned = licenseId(licenseKey);
  const prefix = LICENSE_PREFIXES[skin];
  if (cleaned.length !== 16 || !cleaned.startsWith(prefix)) return null;

  const customerCode = cleaned.slice(4, 8);
  const dateEncoded = cleaned.slice(8, 12);
  const providedSig = cleaned.slice(12, 16);
  const payload = `${customerCode}${dateEncoded}`;
  const expected = createHmac("sha256", LICENSE_SECRETS[skin]())
    .update(payload)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()
    .slice(0, 4);

  if (providedSig !== expected) return null;
  const expiresAt = decodeDate(dateEncoded);
  if (!expiresAt) return null;
  return { licenseKey, customerCode, expiresAt };
}

function isExpired(expiresAt: Date): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return expiresAt < now;
}

function publicOk(record: BindingRecord, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    bound: true,
    licenseKey: record.licenseKey,
    deviceId: record.deviceId,
    expiresAt: record.expiresAt,
    boundAt: record.boundAt,
    lastSeenAt: record.lastSeenAt,
    ...extra,
  };
}

function sameDevice(
  record: BindingRecord,
  fingerprintHash: string,
  installIdHash: string | null,
  previousDeviceId?: string | null
): boolean {
  if (previousDeviceId && record.deviceId === previousDeviceId) return true;
  if (record.fingerprintHash === fingerprintHash) return true;
  if (
    installIdHash &&
    record.installIdHash &&
    record.installIdHash === installIdHash
  ) {
    return true;
  }
  return false;
}

async function loadByLicense(
  store: ReturnType<typeof getStore>,
  skin: Skin,
  licenseKey: string
): Promise<BindingRecord | null> {
  return (await store.get(licStoreKey(skin, licenseKey), {
    type: "json",
  })) as BindingRecord | null;
}

async function loadLicenseIdByDevice(
  store: ReturnType<typeof getStore>,
  skin: Skin,
  fingerprintHash: string
): Promise<string | null> {
  const v = (await store.get(devStoreKey(skin, fingerprintHash), {
    type: "text",
  })) as string | null;
  return v || null;
}

async function saveBinding(
  store: ReturnType<typeof getStore>,
  record: BindingRecord,
  previousFingerprintHash?: string
) {
  await store.setJSON(licStoreKey(record.skin, record.licenseKey), record);
  await store.set(
    devStoreKey(record.skin, record.fingerprintHash),
    licenseId(record.licenseKey)
  );
  if (
    previousFingerprintHash &&
    previousFingerprintHash !== record.fingerprintHash
  ) {
    try {
      await store.delete(devStoreKey(record.skin, previousFingerprintHash));
    } catch {
      // ignore
    }
  }
}

async function deleteBinding(
  store: ReturnType<typeof getStore>,
  record: BindingRecord
) {
  try {
    await store.delete(licStoreKey(record.skin, record.licenseKey));
  } catch {
    // ignore
  }
  try {
    await store.delete(devStoreKey(record.skin, record.fingerprintHash));
  } catch {
    // ignore
  }
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const skin = normalizeSkin(body.skin);
  const fingerprint =
    typeof body.fingerprint === "string" ? body.fingerprint.trim() : "";
  const installId =
    typeof body.installId === "string" ? body.installId.trim() : "";
  const previousDeviceId =
    typeof body.previousDeviceId === "string"
      ? body.previousDeviceId.trim().toUpperCase()
      : "";
  const action =
    body.action === "activate" ||
    body.action === "unregister" ||
    body.action === "reclaim"
      ? body.action
      : "sync";
  const licenseKeyRaw =
    typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";

  if (!skin) {
    return json({ error: "skin 값이 올바르지 않습니다." }, 400);
  }
  if (fingerprint.length < 16 || fingerprint.length > 4000) {
    return json({ error: "fingerprint 값이 올바르지 않습니다." }, 400);
  }
  if (!licenseKeyRaw) {
    return json({ error: "라이선스 키가 필요합니다." }, 400);
  }

  const parsed = validateLicenseCrypto(skin, licenseKeyRaw);
  if (!parsed) {
    return json({ error: "유효하지 않은 라이선스 키입니다." }, 400);
  }
  if (isExpired(parsed.expiresAt)) {
    return json(
      {
        error: `라이선스가 만료되었습니다. (만료일: ${parsed.expiresAt.toLocaleDateString("ko-KR")})`,
        expired: true,
      },
      400
    );
  }

  const fingerprintHash = hashValue(fingerprint);
  const deviceId = toDeviceId(fingerprintHash);
  const installIdHash =
    installId.length >= 16 && installId.length <= 128
      ? hashValue(installId)
      : null;
  const now = new Date().toISOString();
  const expiresAtIso = parsed.expiresAt.toISOString();

  let store;
  try {
    store = getStore("license-bindings");
  } catch {
    return json(
      {
        error:
          "라이선스 서버 저장소를 초기화할 수 없습니다. Netlify Blobs를 확인하세요.",
      },
      503
    );
  }

  let record = await loadByLicense(store, skin, parsed.licenseKey);

  if (action === "sync") {
    if (!record) {
      return json({
        ok: true,
        bound: false,
        unbound: true,
        deviceId,
        licenseKey: parsed.licenseKey,
        expiresAt: expiresAtIso,
        message: "아직 기기에 등록되지 않은 라이선스입니다.",
      });
    }

    if (!sameDevice(record, fingerprintHash, installIdHash, previousDeviceId)) {
      return json(
        {
          ok: false,
          bound: true,
          otherDevice: true,
          deviceId,
          boundDeviceId: record.deviceId,
          error:
            "다른 기기에서 이미 이 라이선스를 사용 중입니다. 기존 기기에서 '기기 등록 해제' 후 다시 시도하세요.",
        },
        409
      );
    }

    const prevFp = record.fingerprintHash;
    record = {
      ...record,
      fingerprintHash,
      installIdHash: installIdHash || record.installIdHash,
      lastSeenAt: now,
      updatedAt: now,
    };
    await saveBinding(store, record, prevFp);
    return json(publicOk(record));
  }

  if (action === "unregister") {
    if (!record) {
      return json({
        ok: true,
        unbound: true,
        deviceId,
        message: "등록된 기기가 없습니다.",
      });
    }
    if (!sameDevice(record, fingerprintHash, installIdHash, previousDeviceId)) {
      return json(
        {
          ok: false,
          error:
            "이 기기에서 등록된 라이선스가 아닙니다. 등록된 기기에서만 해제할 수 있습니다.",
          boundDeviceId: record.deviceId,
        },
        403
      );
    }
    await deleteBinding(store, record);
    return json({
      ok: true,
      unbound: true,
      deviceId,
      message:
        "기기 등록이 해제되었습니다. 다른 기기에서 같은 라이선스로 등록할 수 있습니다.",
    });
  }

  // reclaim: 키 검증 통과 시 기존 기기 바인딩을 지우고 현재 기기에 재등록
  if (action === "reclaim") {
    if (record) {
      await deleteBinding(store, record);
    }
    const existingLicId = await loadLicenseIdByDevice(
      store,
      skin,
      fingerprintHash
    );
    if (existingLicId && existingLicId !== licenseId(parsed.licenseKey)) {
      const old = await loadByLicense(
        store,
        skin,
        `${existingLicId.slice(0, 4)}-${existingLicId.slice(4, 8)}-${existingLicId.slice(8, 12)}-${existingLicId.slice(12, 16)}`
      );
      if (old) await deleteBinding(store, old);
    }

    record = {
      licenseKey: parsed.licenseKey,
      skin,
      deviceId,
      fingerprintHash,
      installIdHash: installIdHash || undefined,
      customerCode: parsed.customerCode,
      expiresAt: expiresAtIso,
      boundAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    await saveBinding(store, record);
    return json({
      ...publicOk(record),
      reclaimed: true,
      message:
        "기존 기기 등록을 해제하고 이 기기에 라이선스를 등록했습니다.",
    });
  }

  // activate
  if (record && !sameDevice(record, fingerprintHash, installIdHash, previousDeviceId)) {
    return json(
      {
        ok: false,
        otherDevice: true,
        boundDeviceId: record.deviceId,
        deviceId,
        error:
          "다른 기기에서 이미 이 라이선스를 사용 중입니다. 기존 기기에서 '기기 등록 해제' 후 다시 시도하세요.",
      },
      409
    );
  }

  // 이 기기에 묶인 다른 라이선스가 있으면 정리 (기기 1개 = 활성 라이선스 1개)
  const existingLicId = await loadLicenseIdByDevice(
    store,
    skin,
    fingerprintHash
  );
  if (existingLicId && existingLicId !== licenseId(parsed.licenseKey)) {
    const old = await loadByLicense(
      store,
      skin,
      `${existingLicId.slice(0, 4)}-${existingLicId.slice(4, 8)}-${existingLicId.slice(8, 12)}-${existingLicId.slice(12, 16)}`
    );
    if (old && sameDevice(old, fingerprintHash, installIdHash, previousDeviceId)) {
      await deleteBinding(store, old);
    }
  }

  if (record && sameDevice(record, fingerprintHash, installIdHash, previousDeviceId)) {
    const prevFp = record.fingerprintHash;
    record = {
      ...record,
      fingerprintHash,
      installIdHash: installIdHash || record.installIdHash,
      lastSeenAt: now,
      updatedAt: now,
      expiresAt: expiresAtIso,
    };
    await saveBinding(store, record, prevFp);
    return json({
      ...publicOk(record),
      message: "이미 이 기기에 등록된 라이선스입니다.",
    });
  }

  record = {
    licenseKey: parsed.licenseKey,
    skin,
    deviceId,
    fingerprintHash,
    installIdHash: installIdHash || undefined,
    customerCode: parsed.customerCode,
    expiresAt: expiresAtIso,
    boundAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
  await saveBinding(store, record);
  return json({
    ...publicOk(record),
    message: "라이선스가 이 기기에 등록되었습니다.",
  });
}
