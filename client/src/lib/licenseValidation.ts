const LICENSE_STORAGE_KEY = 'store_license_key';

/** 서버(license-bind.ts)가 실제로 발급하는 prefix 풀. 새 매장도 이 중 하나를 재사용한다. */
const KNOWN_LICENSE_PREFIXES = ['EQUS', 'HIZZ', 'HOME'];

export interface LicenseData {
  customerCode: string;
  expiryDate: Date;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
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

/**
 * 키 구조(접두사·날짜)만 로컬에서 해석한다 — 서명 비밀키는 더 이상 클라이언트에 없어
 * 진짜 발급된 키인지는 여기서 증명하지 못한다. 실제 인증(서명 검증·기기 바인딩)은
 * netlify/functions/license-bind.ts 서버에서만 이뤄진다 (client/src/lib/licenseBind.ts 참고).
 * 이 함수는 UI 표시용 만료일 파싱과, 이미 기기에 등록된 상태에서의 로컬 보조 잠금
 * (패턴/비밀번호 재설정 등, 물리적 접근이 이미 전제된 화면)에만 쓰인다.
 */
export function validateLicenseKey(licenseKey: string): LicenseData | null {
  try {
    const cleaned = licenseKey.replace(/-/g, '').toUpperCase();

    if (cleaned.length !== 16) {
      return null;
    }

    if (!KNOWN_LICENSE_PREFIXES.some((prefix) => cleaned.startsWith(prefix))) {
      return null;
    }

    const customerEncoded = cleaned.substring(4, 8);
    const dateEncoded = cleaned.substring(8, 12);

    const expiryDate = decodeDate(dateEncoded);
    if (!expiryDate) {
      return null;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const isExpired = expiryDate < now;
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      customerCode: customerEncoded,
      expiryDate,
      isValid: true,
      isExpired,
      daysRemaining: Math.max(0, daysRemaining)
    };
  } catch (error) {
    console.error('License validation error:', error);
    return null;
  }
}

export function getStoredLicense(): string | null {
  return localStorage.getItem(LICENSE_STORAGE_KEY);
}

export function storeLicense(licenseKey: string): void {
  try {
    localStorage.setItem(LICENSE_STORAGE_KEY, licenseKey.toUpperCase());
  } catch (err) {
    console.warn('storeLicense failed', err);
  }
}

export function clearLicense(): void {
  try {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function checkStoredLicenseValidity(): LicenseData | null {
  const storedLicense = getStoredLicense();
  if (!storedLicense) {
    return null;
  }

  return validateLicenseKey(storedLicense);
}

/** 현재 저장된 라이선스 키가 속한 prefix 풀(EQUS/HIZZ/HOME) — 없으면 null. */
export function getCurrentLicensePool(): 'v1' | 'v2' | 'v3' | null {
  const stored = getStoredLicense();
  if (!stored) return null;
  const cleaned = stored.replace(/-/g, '').toUpperCase();
  if (cleaned.startsWith('HIZZ')) return 'v2';
  if (cleaned.startsWith('HOME')) return 'v3';
  if (cleaned.startsWith('EQUS')) return 'v1';
  return null;
}

export { LICENSE_STORAGE_KEY };
