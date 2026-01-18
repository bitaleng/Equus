const DEMO_START_DATE_KEY = 'demo_start_date';
const DEMO_TRIAL_MS = 7 * 24 * 60 * 60 * 1000; // 정확히 7일 (168시간)
const DEMO_EXPIRED_PASSWORD = '70557718';

export function isStaticHosting(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname.includes('netlify.app') || 
         hostname.includes('netlify.com') ||
         hostname.includes('vercel.app') ||
         hostname.includes('github.io') ||
         hostname.includes('pages.dev');
}

export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('demo') === 'true';
}

export function initDemoMode(): void {
  if (!isDemoMode()) return;
  
  const existingStartDate = localStorage.getItem(DEMO_START_DATE_KEY);
  if (!existingStartDate) {
    localStorage.setItem(DEMO_START_DATE_KEY, new Date().toISOString());
  }
}

export function getDemoStartDate(): Date | null {
  const dateStr = localStorage.getItem(DEMO_START_DATE_KEY);
  if (!dateStr) return null;
  return new Date(dateStr);
}

export function getDemoRemainingMs(): number {
  const startDate = getDemoStartDate();
  if (!startDate) return DEMO_TRIAL_MS;
  
  const now = new Date();
  const elapsed = now.getTime() - startDate.getTime();
  return Math.max(0, DEMO_TRIAL_MS - elapsed);
}

export function getDemoRemainingDays(): number {
  const remainingMs = getDemoRemainingMs();
  // 남은 시간을 일수로 변환 (올림하여 표시)
  return Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
}

export function isDemoExpired(): boolean {
  if (!isDemoMode()) return false;
  return getDemoRemainingMs() <= 0;
}

export function getDemoPassword(): string {
  if (isDemoExpired()) {
    return DEMO_EXPIRED_PASSWORD;
  }
  return '12345678';
}

export function blockPwaInstall(): void {
  if (!isDemoMode()) return;
  
  // 1. beforeinstallprompt 이벤트 차단
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    return false;
  });
  
  // 2. 서비스 워커 등록 해제
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
  }
  
  // 3. 매니페스트 링크 제거
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    manifestLink.remove();
  }
}

export function getDemoTrialDays(): number {
  return 7;
}
