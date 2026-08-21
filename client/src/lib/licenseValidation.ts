import CryptoJS from 'crypto-js';

const skin = import.meta.env.VITE_SKIN || 'v1';
const LICENSE_PREFIX = skin === 'v3' ? 'HOME' : skin === 'v2' ? 'HIZZ' : 'EQUS';
const LICENSE_STORAGE_KEY = import.meta.env.VITE_LICENSE_STORAGE_KEY
  || (skin === 'v3' ? 'rest_hotel_license_v3'
    : skin === 'v2' ? 'rest_hotel_license_v2'
    : 'rest_hotel_license');

export interface LicenseData {
  customerCode: string;
  expiryDate: Date;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
}

function getSecret(): string {
  if (skin === 'v3') {
    // V3 전용 시크릿 (v1/v2 라이센스키와 호환되지 않음)
    const parts = [
      String.fromCharCode(72, 111, 77, 101),
      "2025!",
      String.fromCharCode(72, 109, 50, 52, 83),
      "#HmKy@",
      String.fromCharCode(83, 99, 82, 116, 51, 116)
    ];
    return parts.join('');
  }
  if (skin === 'v2') {
    // V2 전용 시크릿 (v1 라이센스키와 호환되지 않음)
    const parts = [
      String.fromCharCode(82, 101, 83, 111),
      "2025!",
      String.fromCharCode(82, 116, 86, 50, 83),
      "#KyMt@",
      String.fromCharCode(76, 99, 75, 114, 51, 116)
    ];
    return parts.join('');
  }
  // V1 시크릿 (기존)
  const parts = [
    String.fromCharCode(69, 113, 85, 115),
    "2025!",
    String.fromCharCode(72, 111, 84, 51, 76),
    "#MnGt@",
    String.fromCharCode(83, 101, 99, 82, 51, 116)
  ];
  return parts.join('');
}

function generateSignature(data: string): string {
  const secret = getSecret();
  const hash = CryptoJS.HmacSHA256(data, secret);
  return hash.toString(CryptoJS.enc.Hex).substring(0, 8).toUpperCase();
}

function encodeDate(date: Date): string {
  const year = date.getFullYear() - 2020;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const encoded = (year * 10000) + (month * 100) + day;
  return encoded.toString(36).toUpperCase().padStart(4, '0');
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

function encodeCustomerCode(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(4, '0').substring(0, 4);
}

export function generateLicenseKey(customerCode: string, expiryDate: Date): string {
  const encodedCustomer = encodeCustomerCode(customerCode);
  const encodedDate = encodeDate(expiryDate);
  
  const dataPayload = `${encodedCustomer}${encodedDate}`;
  const signature = generateSignature(dataPayload);
  
  return `${LICENSE_PREFIX}-${encodedCustomer}-${encodedDate}-${signature.substring(0, 4)}`;
}

export function validateLicenseKey(licenseKey: string): LicenseData | null {
  try {
    const cleaned = licenseKey.replace(/-/g, '').toUpperCase();
    
    if (cleaned.length !== 16) {
      return null;
    }
    
    if (!cleaned.startsWith(LICENSE_PREFIX)) {
      return null;
    }
    
    const customerEncoded = cleaned.substring(4, 8);
    const dateEncoded = cleaned.substring(8, 12);
    const providedSignature = cleaned.substring(12, 16);
    
    const dataPayload = `${customerEncoded}${dateEncoded}`;
    const expectedSignature = generateSignature(dataPayload).substring(0, 4);
    
    if (providedSignature !== expectedSignature) {
      return null;
    }
    
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

export { LICENSE_STORAGE_KEY };
