const DEMO_START_DATE_KEY = 'demo_start_date';
const DEMO_TRIAL_DAYS = 7;
const DEMO_EXPIRED_PASSWORD = '70557718';

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

export function getDemoRemainingDays(): number {
  const startDate = getDemoStartDate();
  if (!startDate) return DEMO_TRIAL_DAYS;
  
  const now = new Date();
  const diffTime = now.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, DEMO_TRIAL_DAYS - diffDays);
}

export function isDemoExpired(): boolean {
  if (!isDemoMode()) return false;
  return getDemoRemainingDays() <= 0;
}

export function getDemoPassword(): string {
  if (isDemoExpired()) {
    return DEMO_EXPIRED_PASSWORD;
  }
  return '12345678';
}

export function blockPwaInstall(): void {
  if (!isDemoMode()) return;
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    return false;
  });
}

export function getDemoTrialDays(): number {
  return DEMO_TRIAL_DAYS;
}
