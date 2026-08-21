import { getStore } from "@netlify/blobs";
import { json } from "./lib/http";
import {
  profileKey,
  keymapKey,
  iconAssetKey,
  isValidStoreId,
  isValidIconVariant,
  iconSetKeyForVariant,
  type StoreProfileRecord,
} from "./lib/storeProfile";

/**
 * 매장 프로필(이름/아이콘/기본설정) 등록·수정 + 라이선스 prefix/고객코드 → storeId 매핑.
 * 코드 빌드 없이 새 매장을 온보딩하기 위한 관리자 전용 함수 — store-admin.html에서 호출한다.
 */

const LICENSE_PREFIXES = ["EQUS", "HIZZ", "HOME"] as const;
const MAX_ICON_BYTES = 2 * 1024 * 1024; // 2MB

type AdminRequestBody =
  | { action: "list-profiles" }
  | { action: "get-profile"; storeId: string }
  | { action: "upsert-profile"; profile: Partial<StoreProfileRecord> & { storeId: string } }
  | { action: "upload-icon"; storeId: string; variant: string; base64Png: string }
  | { action: "map-license"; prefix: string; customerCode: string; storeId: string; force?: boolean }
  | { action: "unmap-license"; prefix: string; customerCode: string };

function checkAuth(request: Request): Response | null {
  const expected = process.env.STORE_ADMIN_KEY;
  if (!expected) {
    return json(
      { error: "관리자 키(STORE_ADMIN_KEY)가 서버에 설정되어 있지 않습니다." },
      503
    );
  }
  const provided = request.headers.get("x-admin-key");
  if (!provided || provided !== expected) {
    return json({ error: "관리자 권한이 필요합니다." }, 401);
  }
  return null;
}

function normalizeCustomerCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizePrefix(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authError = checkAuth(request);
  if (authError) return authError;

  let body: AdminRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  let profileStore;
  try {
    profileStore = getStore("store-profiles");
  } catch {
    return json({ error: "저장소를 초기화할 수 없습니다. Netlify Blobs를 확인하세요." }, 503);
  }

  if (body.action === "list-profiles") {
    const { blobs } = await profileStore.list({ prefix: "profile:" });
    const profiles = await Promise.all(
      blobs.map((b) => profileStore.get(b.key, { type: "json" }) as Promise<StoreProfileRecord | null>)
    );
    return json({ ok: true, profiles: profiles.filter(Boolean) });
  }

  if (body.action === "get-profile") {
    if (!isValidStoreId(body.storeId)) {
      return json({ ok: false, error: "storeId 형식이 올바르지 않습니다." }, 400);
    }
    const profile = (await profileStore.get(profileKey(body.storeId), {
      type: "json",
    })) as StoreProfileRecord | null;
    return json({ ok: true, profile });
  }

  if (body.action === "upsert-profile") {
    const input = body.profile;
    if (!isValidStoreId(input?.storeId)) {
      return json({ ok: false, error: "storeId 형식이 올바르지 않습니다 (영소문자/숫자/하이픈, 2~40자)." }, 400);
    }
    if (!input.displayName || !input.shortName) {
      return json({ ok: false, error: "displayName, shortName은 필수입니다." }, 400);
    }
    const now = new Date().toISOString();
    const existing = (await profileStore.get(profileKey(input.storeId), {
      type: "json",
    })) as StoreProfileRecord | null;
    const record: StoreProfileRecord = {
      storeId: input.storeId,
      displayName: input.displayName,
      shortName: input.shortName,
      description: input.description ?? existing?.description ?? "",
      themeColor: input.themeColor ?? existing?.themeColor ?? "#0F172A",
      backgroundColor: input.backgroundColor ?? existing?.backgroundColor ?? "#ffffff",
      icons: input.icons ?? existing?.icons ?? {},
      iconVersion: existing?.iconVersion ?? "1",
      settingsOverrides: input.settingsOverrides ?? existing?.settingsOverrides,
      active: input.active ?? existing?.active ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await profileStore.setJSON(profileKey(record.storeId), record);
    return json({ ok: true, profile: record });
  }

  if (body.action === "upload-icon") {
    if (!isValidStoreId(body.storeId)) {
      return json({ ok: false, error: "storeId 형식이 올바르지 않습니다." }, 400);
    }
    if (!isValidIconVariant(body.variant)) {
      return json({ ok: false, error: "variant 값이 올바르지 않습니다." }, 400);
    }
    if (typeof body.base64Png !== "string" || !body.base64Png) {
      return json({ ok: false, error: "base64Png가 필요합니다." }, 400);
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(body.base64Png, "base64");
    } catch {
      return json({ ok: false, error: "base64Png 디코딩에 실패했습니다." }, 400);
    }
    if (buf.byteLength === 0 || buf.byteLength > MAX_ICON_BYTES) {
      return json({ ok: false, error: `PNG 파일 크기가 올바르지 않습니다 (최대 ${MAX_ICON_BYTES / 1024 / 1024}MB).` }, 400);
    }
    // PNG magic bytes 검증
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
    if (!PNG_MAGIC.every((b, i) => buf[i] === b)) {
      return json({ ok: false, error: "PNG 파일만 업로드할 수 있습니다." }, 400);
    }

    let iconStore;
    try {
      iconStore = getStore("store-icons");
    } catch {
      return json({ error: "아이콘 저장소를 초기화할 수 없습니다." }, 503);
    }
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    await iconStore.set(iconAssetKey(body.storeId, body.variant), arrayBuffer);

    // 아이콘이 바뀌었으니 icons 맵에 표시하고, 캐시 무효화를 위해 iconVersion을 올린다
    const existing = (await profileStore.get(profileKey(body.storeId), {
      type: "json",
    })) as StoreProfileRecord | null;
    if (existing) {
      const nextVersion = String((parseInt(existing.iconVersion, 10) || 0) + 1);
      const iconSetKey = iconSetKeyForVariant(body.variant);
      await profileStore.setJSON(profileKey(body.storeId), {
        ...existing,
        icons: { ...existing.icons, [iconSetKey]: nextVersion },
        iconVersion: nextVersion,
        updatedAt: new Date().toISOString(),
      });
    }
    return json({ ok: true });
  }

  if (body.action === "map-license") {
    const prefix = normalizePrefix(body.prefix);
    const customerCode = normalizeCustomerCode(body.customerCode);
    if (!LICENSE_PREFIXES.includes(prefix as (typeof LICENSE_PREFIXES)[number])) {
      return json({ ok: false, error: "prefix는 EQUS/HIZZ/HOME 중 하나여야 합니다." }, 400);
    }
    if (!customerCode) {
      return json({ ok: false, error: "customerCode가 필요합니다." }, 400);
    }
    if (!isValidStoreId(body.storeId)) {
      return json({ ok: false, error: "storeId 형식이 올바르지 않습니다." }, 400);
    }
    const key = keymapKey(prefix, customerCode);
    const existingStoreId = (await profileStore.get(key, { type: "text" })) as string | null;
    if (existingStoreId && existingStoreId !== body.storeId && !body.force) {
      return json(
        {
          ok: false,
          error: `이 prefix+고객코드는 이미 다른 매장(${existingStoreId})에 연결되어 있습니다. 덮어쓰려면 force: true로 다시 요청하세요.`,
          existingStoreId,
        },
        409
      );
    }
    await profileStore.set(key, body.storeId);
    return json({ ok: true });
  }

  if (body.action === "unmap-license") {
    const prefix = normalizePrefix(body.prefix);
    const customerCode = normalizeCustomerCode(body.customerCode);
    if (!prefix || !customerCode) {
      return json({ ok: false, error: "prefix, customerCode가 필요합니다." }, 400);
    }
    await profileStore.delete(keymapKey(prefix, customerCode));
    return json({ ok: true });
  }

  return json({ ok: false, error: "알 수 없는 action입니다." }, 400);
}
