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
  // storeId는 _redirects의 쿼리스트링 치환(?store=:storeId)에 의존하지 않고 경로에서
  // 직접 파싱한다 — Netlify 함수(V2)의 request.url이 리다이렉트 목적지가 아니라
  // 브라우저의 원본 요청 주소를 그대로 반환해서 치환이 반영되지 않았던 게 원인이었음.
  const pathMatch = url.pathname.match(/^\/store\/([^/]+)\/manifest\.webmanifest\/?$/);
  const storeId = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : "";
  // 임시 진단용 — 원인 파악 후 제거 예정. Blobs 조회가 실제로 무엇을 찾았는지 응답에 그대로 노출한다.
  const debug = url.searchParams.has("debug");

  if (!storeId) {
    return manifestResponse(debug ? { ...GENERIC_MANIFEST, _debug: { reason: "storeId 쿼리파라미터가 비어있음(리다이렉트 문제 가능성)", rawUrl: request.url } } : GENERIC_MANIFEST);
  }

  try {
    const profileStore = getStore("store-profiles");
    const profile = (await profileStore.get(profileKey(storeId), {
      type: "json",
    })) as StoreProfileRecord | null;

    if (!profile || !profile.active) {
      return manifestResponse(debug ? { ...GENERIC_MANIFEST, _debug: { reason: !profile ? "해당 storeId로 저장된 프로필을 못 찾음" : "프로필은 있으나 active=false", receivedStoreId: storeId, profileFound: !!profile, active: profile?.active ?? null } } : GENERIC_MANIFEST);
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
  } catch (e) {
    return manifestResponse(debug ? { ...GENERIC_MANIFEST, _debug: { reason: "예외 발생", error: e instanceof Error ? e.message : String(e), receivedStoreId: storeId } } : GENERIC_MANIFEST);
  }
}
