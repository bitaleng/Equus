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
  const storeId = url.searchParams.get("store") || "";
  const variant = url.searchParams.get("variant") || "";
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
