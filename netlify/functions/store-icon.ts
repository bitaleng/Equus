import { getStore } from "@netlify/blobs";
import { iconAssetKey, isValidStoreId, isValidIconVariant } from "./lib/storeProfile";

/** 등록되지 않은 storeId/variant는 항상 client/public/의 제네릭 아이콘으로 302, 절대 404를 내지 않는다. */
const GENERIC_FALLBACK: Record<string, string> = {
  favicon: "/favicon.png",
  "favicon-light": "/favicon-light.png",
  "icon-192": "/icon-192.png",
  "icon-192-light": "/icon-192.png",
  "icon-512": "/icon-512.png",
  "icon-512-light": "/icon-512.png",
  "icon-1024": "/icon-1024.png",
  "icon-1024-light": "/icon-1024.png",
};

function toGenericFallback(variant: string) {
  const target = GENERIC_FALLBACK[variant] || "/icon-512.png";
  return Response.redirect(target, 302);
}

function debugResponse(info: Record<string, unknown>) {
  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  // storeId/variant는 _redirects의 쿼리스트링 치환(?store=:storeId)에 의존하지 않고
  // 경로 자체에서 직접 파싱한다. Netlify 함수(V2, Request/Response 시그니처)에서
  // request.url이 리다이렉트 목적지가 아니라 브라우저가 요청한 원본 주소를 그대로
  // 반환한다는 걸 실제로 확인했음 — 쿼리스트링 치환이 반영되지 않아 계속 빈 값이었음.
  const pathMatch = url.pathname.match(/^\/store\/([^/]+)\/icon\/([^/]+)\/?$/);
  const storeId = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : "";
  const variant = pathMatch?.[2] ? decodeURIComponent(pathMatch[2]) : "";
  const hasVersion = url.searchParams.has("v");
  // 임시 진단용(?debug 붙이면 리다이렉트 대신 사람이 읽을 수 있는 JSON으로 응답) — 원인 파악 후 제거 예정.
  const debug = url.searchParams.has("debug");

  if (!isValidStoreId(storeId) || !isValidIconVariant(variant)) {
    if (debug) {
      return debugResponse({ reason: "storeId 또는 variant 형식이 올바르지 않음", rawUrl: request.url, receivedStoreId: storeId, receivedVariant: variant });
    }
    return toGenericFallback(variant);
  }

  try {
    const iconStore = getStore("store-icons");
    const data = (await iconStore.get(iconAssetKey(storeId, variant), {
      type: "arrayBuffer",
    })) as ArrayBuffer | null;

    if (!data) {
      if (debug) {
        return debugResponse({ reason: "Blobs 저장소에서 해당 키를 못 찾음", receivedStoreId: storeId, receivedVariant: variant, blobKey: iconAssetKey(storeId, variant) });
      }
      return toGenericFallback(variant);
    }

    if (debug) {
      return debugResponse({ reason: "정상 — 이미지 데이터를 찾음", receivedStoreId: storeId, receivedVariant: variant, byteLength: data.byteLength });
    }

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": hasVersion
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    if (debug) {
      return debugResponse({ reason: "예외 발생", error: e instanceof Error ? e.message : String(e), receivedStoreId: storeId, receivedVariant: variant });
    }
    return toGenericFallback(variant);
  }
}
