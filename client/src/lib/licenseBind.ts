/** 스킨·데모 빌드별 앱 표시명 — 세션 유지만 담당. 기기 바인딩 없음. */

export {
  persistAuthToDatabase,
  persistLicenseToDatabase,
  restoreSessionFromDatabase,
} from "@/lib/localDb";

/** @deprecated 호환용 — 로컬 삭제만 수행 */
export async function unregisterLicenseDevice(): Promise<{
  success: boolean;
  message: string;
}> {
  const { clearLicense } = await import("@/lib/licenseValidation");
  const { persistLicenseToDatabase } = await import("@/lib/localDb");
  clearLicense();
  persistLicenseToDatabase(null);
  return {
    success: true,
    message: "이 기기의 라이선스가 삭제되었습니다. 다시 입력하면 사용할 수 있습니다.",
  };
}

export async function persistAuthenticated(value: boolean): Promise<void> {
  try {
    if (value) localStorage.setItem("authenticated", "true");
    else localStorage.removeItem("authenticated");
  } catch {}
  const { persistAuthToDatabase } = await import("@/lib/localDb");
  persistAuthToDatabase(value);
}

export async function restoreSessionMeta(): Promise<void> {
  const { restoreSessionFromDatabase, loadAppMeta } = await import("@/lib/localDb");
  restoreSessionFromDatabase();

  // DB에 없고 IDB meta에만 있는 경우 보조 복구
  try {
    if (!localStorage.getItem("authenticated")) {
      const auth = await loadAppMeta("app_authenticated");
      if (auth === "true") localStorage.setItem("authenticated", "true");
    }
  } catch {}
}
