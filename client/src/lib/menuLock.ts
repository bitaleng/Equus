const DEFAULT_LOCKED_ROUTES = ['/logs', '/scan-logs', '/settings', '/closing', '/expenses', '/sales-report'];

export function getLockedRoutes(): string[] {
  const stored = localStorage.getItem('locked_menu_routes');
  if (stored) {
    try { return JSON.parse(stored); }
    catch { return DEFAULT_LOCKED_ROUTES; }
  }
  return DEFAULT_LOCKED_ROUTES;
}

export function setLockedRoutes(routes: string[]): void {
  localStorage.setItem('locked_menu_routes', JSON.stringify(routes));
}

export function isRouteLocked(route: string): boolean {
  if (localStorage.getItem("security_enabled") === "false") return false;
  const locked = getLockedRoutes();
  return locked.includes(route);
}

// 오늘현황/매출집계 패널 전용 잠금 여부
// 전역 보안이 ON이고, security_today_status_enabled 가 "false" 가 아닐 때만 잠금
export function isTodayStatusLocked(): boolean {
  if (localStorage.getItem("security_enabled") === "false") return false;
  return localStorage.getItem("security_today_status_enabled") !== "false";
}

// 매출집계 탭 전용 잠금 여부 (탭 모드)
export function isSalesTabLocked(): boolean {
  if (localStorage.getItem("security_enabled") === "false") return false;
  return localStorage.getItem("security_sales_tab_enabled") !== "false";
}

export const MENU_ITEMS = [
  { url: '/logs',          label: '상세 기록' },
  { url: '/closing',       label: '정산하기' },
  { url: '/cash-register', label: '시재금관리' },
  { url: '/expenses',      label: '지출관리' },
  { url: '/sales-report',  label: '매출리포트' },
  { url: '/settings',      label: '시스템 설정' },
  { url: '/scan-logs',     label: '스캔정보' },
];
