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

export default async function handler(request: Request) {
  const url = new URL(request.url);
  // storeId/variant는 _redirects의 쿼리스트링 치환에 의존하지 않고 경로 자체에서 직접
  // 파싱한다 — Netlify 함수(V2)의 request.url은 리다이렉트 목적지가 아니라 브라우저가
  // 요청한 원본 주소를 그대로 반환하기 때문에, ?store=:storeId 같은 치환은 반영되지 않는다.
  const pathMatch = url.pathname.match(/^\/store\/([^/]+)\/icon\/([^/]+)\/?$/);
  const storeId = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : "";
  const variant = pathMatch?.[2] ? decodeURIComponent(pathMatch[2]) : "";
  const hasVersion = url.searchParams.has("v");

  if (!isValidStoreId(storeId) || !isValidIconVariant(variant)) {
    return toGenericFallback(variant);
  }

  try {
    const iconStore = getStore("store-icons");
    const data = (await iconStore.get(iconAssetKey(storeId, variant), {
      type: "arrayBuffer",
    })) as ArrayBuffer | null;

    if (!data) {
      return toGenericFallback(variant);
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
  } catch {
    return toGenericFallback(variant);
  }
}
