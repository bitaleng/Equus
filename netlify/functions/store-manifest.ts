import { getStore } from "@netlify/blobs";
import { profileKey, type StoreProfileRecord } from "./lib/storeProfile";

/**
 * 매장별 PWA manifest를 런타임에 생성한다. 등록되지 않았거나 비활성 매장은
 * client/public/manifest.json과 동일한 제네릭 매니페스트로 폴백해서 설치가 깨지지 않게 한다.
 */

const GENERIC_MANIFEST = {
  id: "/",
  name: "입실관리매니저",
  short_name: "입실관리",
  description: "락카 입실 현황을 실시간으로 관리합니다.",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0F172A",
  orientation: "landscape",
  scope: "/",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    { src: "/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any maskable" },
  ],
};

function manifestResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function buildIcon(storeId: string, variant: string, sizes: string, iconVersion: string) {
  return {
    src: `/store/${storeId}/icon/${variant}?v=${encodeURIComponent(iconVersion)}`,
    sizes,
    type: "image/png",
    purpose: "any maskable",
  };
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("store") || "";

  if (!storeId) {
    return manifestResponse(GENERIC_MANIFEST);
  }

  try {
    const profileStore = getStore("store-profiles");
    const profile = (await profileStore.get(profileKey(storeId), {
      type: "json",
    })) as StoreProfileRecord | null;

    if (!profile || !profile.active) {
      return manifestResponse(GENERIC_MANIFEST);
    }

    const icons = [
      profile.icons.icon192 ? buildIcon(storeId, "icon-192", "192x192", profile.iconVersion) : null,
      profile.icons.icon512 ? buildIcon(storeId, "icon-512", "512x512", profile.iconVersion) : null,
      profile.icons.icon1024 ? buildIcon(storeId, "icon-1024", "1024x1024", profile.iconVersion) : null,
    ].filter(Boolean);

    return manifestResponse({
      id: "/",
      name: profile.displayName,
      short_name: profile.shortName,
      description: profile.description,
      start_url: "/",
      display: "standalone",
      background_color: profile.backgroundColor,
      theme_color: profile.themeColor,
      orientation: "landscape",
      scope: "/",
      icons: icons.length > 0 ? icons : GENERIC_MANIFEST.icons,
    });
  } catch {
    return manifestResponse(GENERIC_MANIFEST);
  }
}
