import { getStore } from "@netlify/blobs";
import { createHmac, createHash } from "node:crypto";

const DEFAULT_TRIAL_DAYS = 10;
const MAX_TRIAL_DAYS = 30;
const DEMO_SKIN = "demo" as const;

const EXTENSION_SECRET = "IvDemo-Extend-2026!Unified";

/** 구버전 v1/v2/v3 체험 데이터 호환 */
const LEGACY_SKINS = ["v1", "v2", "v3"] as const;
type LegacySkin = (typeof LEGACY_SKINS)[number];
type SkinKey = typeof DEMO_SKIN | LegacySkin;

type DemoTrialRecord = {
  deviceId: string;
  skin: typeof DEMO_SKIN;
  fingerprintHash: string;
  /** 같은 브라우저 프로필에서 UA 등이 조금 바뀌어도 이어가기 위한 보조 키 */
  installIdHash?: string;
  startDate: string;
  trialDays: number;
  createdAt: string;
  updatedAt: string;
};

type RequestBody = {
  action?: "sync" | "start" | "extend";
  fingerprint?: string;
  installId?: string;
  skin?: string;
  code?: string;
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

function normalizeSkin(value: unknown): typeof DEMO_SKIN | null {
  if (value === DEMO_SKIN || value === "v1" || value === "v2" || value === "v3") {
    return DEMO_SKIN;
  }
  return null;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toDeviceId(fingerprintHash: string): string {
  return fingerprintHash.slice(0, 12).toUpperCase();
}

function remainingMs(startDate: string, trialDays: number): number {
  const elapsed = Date.now() - new Date(startDate).getTime();
  return Math.max(0, trialDays * 24 * 60 * 60 * 1000 - elapsed);
}

function extensionSignature(deviceId: string, totalDays: number): string {
  return createHmac("sha256", EXTENSION_SECRET)
    .update(`${DEMO_SKIN}|${deviceId}|${totalDays}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

/** 체험 시작 코드 — 기기 ID에 묶임. 다른 기기에서는 사용 불가 */
function startSignature(deviceId: string, trialDays: number): string {
  return createHmac("sha256", EXTENSION_SECRET)
    .update(`${DEMO_SKIN}|${deviceId}|START|${trialDays}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

function parseExtensionCode(raw: string): { totalDays: number; signature: string } | null {
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  const match = /^DEMO(\d{2})([A-F0-9]{10})$/.exec(code);
  if (!match) return null;
  return { totalDays: Number(match[1]), signature: match[2] };
}

function parseStartCode(raw: string): { trialDays: number; signature: string } | null {
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  const match = /^START(\d{2})([A-F0-9]{10})$/.exec(code);
  if (!match) return null;
  return { trialDays: Number(match[1]), signature: match[2] };
}

function fpKey(skin: SkinKey, fingerprintHash: string) {
  return `fp:${skin}:${fingerprintHash}`;
}

function installKey(skin: SkinKey, installIdHash: string) {
  return `install:${skin}:${installIdHash}`;
}

function publicRecord(record: DemoTrialRecord) {
  const left = remainingMs(record.startDate, record.trialDays);
  return {
    ok: true,
    needsStart: false,
    deviceId: record.deviceId,
    startDate: record.startDate,
    trialDays: record.trialDays,
    remainingMs: left,
    remainingDays: Math.ceil(left / (1000 * 60 * 60 * 24)),
    expired: left <= 0,
  };
}

function needsStartPayload(deviceId: string) {
  return {
    ok: true,
    needsStart: true,
    deviceId,
    startDate: null,
    trialDays: DEFAULT_TRIAL_DAYS,
    remainingMs: 0,
    remainingDays: 0,
    expired: false,
  };
}

async function readRecordAtKey(
  store: ReturnType<typeof getStore>,
  skin: SkinKey,
  fingerprintHash: string
): Promise<DemoTrialRecord | null> {
  const raw = (await store.get(fpKey(skin, fingerprintHash), {
    type: "json",
  })) as DemoTrialRecord | null;
  if (!raw) return null;
  return {
    ...raw,
    skin: DEMO_SKIN,
    fingerprintHash: raw.fingerprintHash || fingerprintHash,
    deviceId: raw.deviceId || toDeviceId(fingerprintHash),
  };
}

async function loadRecord(
  store: ReturnType<typeof getStore>,
  fingerprintHash: string,
  installIdHash: string | null
): Promise<DemoTrialRecord | null> {
  const byFp = await readRecordAtKey(store, DEMO_SKIN, fingerprintHash);
  if (byFp) return byFp;

  for (const legacy of LEGACY_SKINS) {
    const legacyRecord = await readRecordAtKey(store, legacy, fingerprintHash);
    if (legacyRecord) {
      await saveRecord(store, legacyRecord);
      try {
        await store.delete(fpKey(legacy, fingerprintHash));
      } catch {
        // ignore
      }
      return legacyRecord;
    }

    const legacyDirect = (await store.get(`${legacy}:${fingerprintHash}`, {
      type: "json",
    })) as DemoTrialRecord | null;
    if (legacyDirect) {
      const migrated: DemoTrialRecord = {
        ...legacyDirect,
        skin: DEMO_SKIN,
        fingerprintHash: legacyDirect.fingerprintHash || fingerprintHash,
        deviceId: legacyDirect.deviceId || toDeviceId(fingerprintHash),
      };
      await saveRecord(store, migrated);
      return migrated;
    }
  }

  if (installIdHash) {
    for (const skin of [DEMO_SKIN, ...LEGACY_SKINS] as SkinKey[]) {
      const mappedFp = (await store.get(installKey(skin, installIdHash), {
        type: "text",
      })) as string | null;
      if (mappedFp) {
        const byInstall = await readRecordAtKey(store, skin, mappedFp);
        if (byInstall) {
          if (skin !== DEMO_SKIN) {
            await saveRecord(store, byInstall);
          }
          return byInstall;
        }
      }
    }
  }

  return null;
}

async function saveRecord(
  store: ReturnType<typeof getStore>,
  record: DemoTrialRecord
) {
  await store.setJSON(fpKey(DEMO_SKIN, record.fingerprintHash), record);
  if (record.installIdHash) {
    await store.set(installKey(DEMO_SKIN, record.installIdHash), record.fingerprintHash);
  }
}

async function rebindFingerprintIfNeeded(
  store: ReturnType<typeof getStore>,
  record: DemoTrialRecord,
  fingerprintHash: string,
  installIdHash: string | null,
  now: string
): Promise<DemoTrialRecord> {
  let next = record;

  if (
    next.fingerprintHash !== fingerprintHash &&
    installIdHash &&
    next.installIdHash === installIdHash
  ) {
    const oldFp = next.fingerprintHash;
    next = {
      ...next,
      fingerprintHash,
      updatedAt: now,
    };
    await saveRecord(store, next);
    try {
      await store.delete(fpKey(DEMO_SKIN, oldFp));
    } catch {
      // ignore
    }
  } else if (installIdHash && !next.installIdHash) {
    next = { ...next, installIdHash, updatedAt: now };
    await saveRecord(store, next);
  }

  return next;
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
  const action =
    body.action === "start" || body.action === "extend" ? body.action : "sync";

  if (!skin) {
    return json({ error: "skin 값이 올바르지 않습니다." }, 400);
  }
  if (fingerprint.length < 16 || fingerprint.length > 4000) {
    return json({ error: "fingerprint 값이 올바르지 않습니다." }, 400);
  }

  const fingerprintHash = hashValue(fingerprint);
  const currentDeviceId = toDeviceId(fingerprintHash);
  const installIdHash =
    installId.length >= 16 && installId.length <= 128 ? hashValue(installId) : null;

  let store;
  try {
    store = getStore("demo-trials");
  } catch {
    return json(
      { error: "체험 서버 저장소를 초기화할 수 없습니다. Netlify Blobs를 확인하세요." },
      503
    );
  }

  let record = await loadRecord(store, fingerprintHash, installIdHash);
  const now = new Date().toISOString();

  if (record) {
    record = await rebindFingerprintIfNeeded(
      store,
      record,
      fingerprintHash,
      installIdHash,
      now
    );
  }

  if (action === "sync") {
    if (!record) {
      return json(needsStartPayload(currentDeviceId));
    }
    return json(publicRecord(record));
  }

  if (action === "start") {
    if (record) {
      return json(
        {
          error: "이미 이 기기에 체험이 등록되어 있습니다.",
          ...publicRecord(record),
        },
        400
      );
    }

    const parsed = typeof body.code === "string" ? parseStartCode(body.code) : null;
    if (!parsed) {
      return json(
        {
          error: "체험 시작 코드 형식이 올바르지 않습니다.",
          ...needsStartPayload(currentDeviceId),
        },
        400
      );
    }
    if (
      !Number.isInteger(parsed.trialDays) ||
      parsed.trialDays < DEFAULT_TRIAL_DAYS ||
      parsed.trialDays > MAX_TRIAL_DAYS
    ) {
      return json(
        {
          error: `시작 기간은 ${DEFAULT_TRIAL_DAYS}~${MAX_TRIAL_DAYS}일만 가능합니다.`,
          ...needsStartPayload(currentDeviceId),
        },
        400
      );
    }

    const expected = startSignature(currentDeviceId, parsed.trialDays);
    if (parsed.signature !== expected) {
      return json(
        {
          error: "이 기기에서 사용할 수 없는 시작 코드입니다. 기기 ID를 확인해 주세요.",
          ...needsStartPayload(currentDeviceId),
        },
        400
      );
    }

    record = {
      deviceId: currentDeviceId,
      skin: DEMO_SKIN,
      fingerprintHash,
      installIdHash: installIdHash || undefined,
      startDate: now,
      trialDays: parsed.trialDays,
      createdAt: now,
      updatedAt: now,
    };
    await saveRecord(store, record);

    return json({
      ...publicRecord(record),
      message: `체험이 시작되었습니다. (${record.trialDays}일)`,
    });
  }

  if (!record) {
    return json(
      {
        error: "먼저 체험 시작 코드로 이 기기를 등록해 주세요.",
        ...needsStartPayload(currentDeviceId),
      },
      400
    );
  }

  const parsed = typeof body.code === "string" ? parseExtensionCode(body.code) : null;
  if (!parsed) {
    return json(
      { error: "연장 코드 형식이 올바르지 않습니다.", ...publicRecord(record) },
      400
    );
  }
  const minExtendDays = DEFAULT_TRIAL_DAYS + 1;
  if (
    !Number.isInteger(parsed.totalDays) ||
    parsed.totalDays < minExtendDays ||
    parsed.totalDays > MAX_TRIAL_DAYS
  ) {
    return json(
      {
        error: `연장 기간은 총 ${minExtendDays}일에서 ${MAX_TRIAL_DAYS}일까지만 가능합니다.`,
        ...publicRecord(record),
      },
      400
    );
  }

  const expected = extensionSignature(record.deviceId, parsed.totalDays);
  if (parsed.signature !== expected) {
    return json(
      { error: "이 기기에서 사용할 수 없는 연장 코드입니다.", ...publicRecord(record) },
      400
    );
  }

  if (parsed.totalDays <= record.trialDays) {
    return json(
      {
        error: `이미 총 ${record.trialDays}일 체험 기간이 적용되어 있습니다.`,
        ...publicRecord(record),
      },
      400
    );
  }

  record = {
    ...record,
    trialDays: parsed.totalDays,
    updatedAt: now,
    installIdHash: installIdHash || record.installIdHash,
  };
  await saveRecord(store, record);

  return json({
    ...publicRecord(record),
    message: `체험 기간이 최초 시작일부터 총 ${record.trialDays}일로 연장되었습니다.`,
  });
}
