/** 스킨·데모 빌드별 앱 표시명 (PowerShell env 한글 깨짐 방지) */

import { isDemoBuild } from "@/lib/demoMode";

export type AppSkin = "v1" | "v2" | "v3" | "demo";

const SKIN_META: Record<
  AppSkin,
  { name: string; shortName: string; description: string }
> = {
  v1: {
    name: "EQUUS LOCKER MANAGER",
    shortName: "LOCKER",
    description: "라이선스 키를 입력하여 시스템을 활성화하세요.",
  },
  v2: {
    name: "He's 입실관리매니저",
    shortName: "He's",
    description: "라이선스 키를 입력하여 시스템을 활성화하세요.",
  },
  v3: {
    name: "home24시 입실관리매니저",
    shortName: "home24시",
    description: "라이선스 키를 입력하여 시스템을 활성화하세요.",
  },
  demo: {
    name: "입실관리 체험판",
    shortName: "체험",
    description: "관리자 시작 코드로 시작하는 체험판입니다.",
  },
};

export function getAppSkin(): AppSkin {
  const skin = import.meta.env.VITE_SKIN;
  if (skin === "demo") return "demo";
  if (skin === "v3") return "v3";
  if (skin === "v2") return "v2";
  return "v1";
}

export function getAppName(): string {
  const base = SKIN_META[getAppSkin()].name;
  if (isDemoBuild() && getAppSkin() !== "demo") {
    return `${base} (체험판)`;
  }
  return base;
}

export function getAppShortName(): string {
  const base = SKIN_META[getAppSkin()].shortName;
  if (isDemoBuild() && getAppSkin() !== "demo") {
    return `${base} 체험`;
  }
  return base;
}

export function getAppDescription(): string {
  if (isDemoBuild()) {
    return "관리자 시작 코드로 시작하는 체험판입니다. 기본 10일(최대 30일 연장). 다른 기기에서는 자동으로 새 체험이 시작되지 않으며, 홈 화면 설치(PWA)는 지원하지 않습니다.";
  }
  return SKIN_META[getAppSkin()].description;
}
