import { useState, useEffect, useRef } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PasswordAuth } from "@/components/PasswordAuth";
import LicenseGate from "@/components/LicenseGate";
import Home from "@/pages/Home";
import LogsPage from "@/pages/LogsPage";
import ScanLogsPage from "@/pages/ScanLogsPage";
import Settings from "@/pages/Settings";
import ExpensesPage from "@/pages/ExpensesPage";
import ClosingPage from "@/pages/ClosingPage";
import SalesReportPage from "@/pages/SalesReportPage";
import CashRegisterPage from "@/pages/CashRegisterPage";
import StaffLogPage from "@/pages/StaffLogPage";
import AdminLicenses from "@/pages/AdminLicenses";
import AdminCctv from "@/pages/AdminCctv";
import CctvPage from "@/pages/CctvPage";
import CctvViewPage from "@/pages/CctvViewPage";
import CctvRemotePage from "@/pages/CctvRemotePage";
import NotFound from "@/pages/not-found";
import { initDatabase, getSettings, restoreSessionFromDatabase } from "@/lib/localDb";
import { Menu, Lock } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import PatternLockDialog from "@/components/PatternLockDialog";
import { useWakeLock } from "@/hooks/useWakeLock";
import { isDemoMode, blockPwaInstall, DEMO_SITE_MARKER } from "@/lib/demoMode";
import { isRouteLocked } from "@/lib/menuLock";
import { UpdateBanner } from "@/components/UpdateBanner";
import { CctvProvider } from "@/contexts/CctvContext";
import { CctvInstallNotifier } from "@/components/CctvInstallNotifier";
import ScreenViewPage from "@/pages/ScreenViewPage";
import { runAutoArchiveIfNeeded } from "@/lib/autoArchive";
import { useToast } from "@/hooks/use-toast";

function AutoArchiveRunner() {
  const { toast } = useToast();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await runAutoArchiveIfNeeded();
        if (result.status === "purged") {
          toast({
            title: "자동 백업 완료",
            description: result.message,
          });
        } else if (result.status === "needs-permission" || result.status === "needs-folder") {
          toast({
            title: "자동 백업 대기",
            description: result.message,
          });
        } else if (result.status === "error") {
          toast({
            title: "자동 백업 실패",
            description: result.message,
            variant: "destructive",
          });
        }
      })();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return null;
}

function isAdminRoute(path: string): boolean {
  return path.startsWith("/admin");
}

function isCctvPublicRoute(path: string): boolean {
  return path.startsWith("/cctv/view") || path.startsWith("/cctv/remote") || path.startsWith("/screen/view");
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/logs" component={LogsPage} />
      <Route path="/scan-logs" component={ScanLogsPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/expenses" component={ExpensesPage} />
      <Route path="/closing" component={ClosingPage} />
      <Route path="/sales-report" component={SalesReportPage} />
      <Route path="/cash-register" component={CashRegisterPage} />
      <Route path="/staff-logs" component={StaffLogPage} />
      <Route path="/cctv" component={CctvPage} />
      <Route path="/admin/licenses" component={AdminLicenses} />
      <Route path="/admin/cctv" component={AdminCctv} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminRouter() {
  return (
    <Switch>
      <Route path="/admin/licenses" component={AdminLicenses} />
      <Route path="/admin/cctv" component={AdminCctv} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RouteGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  // 현재 활성 잠금 해제 경로만 기억 — 다른 경로로 이동하면 자동 초기화
  const [unlockedRoute, setUnlockedRoute] = useState<string | null>(null);
  const [showLock, setShowLock] = useState(false);
  const [blockedRoute, setBlockedRoute] = useState('');
  // 패턴 해제 직후 플래그 — Radix 다이얼로그가 onOpenChange(false)를 자동으로
  // 발생시켜 navigate('/')로 이동하는 문제를 방지
  const patternJustSolved = useRef(false);

  useEffect(() => {
    if (isRouteLocked(location)) {
      if (unlockedRoute !== location) {
        // 잠긴 경로이고 현재 해제된 경로와 다름 → 잠금 표시
        setBlockedRoute(location);
        setShowLock(true);
      } else {
        // 잠긴 경로이지만 방금 해제한 경로 → 통과
        setShowLock(false);
      }
    } else {
      // 잠금이 없는 경로로 이동하면 반드시 해제 상태 초기화
      // → 이후 잠긴 경로로 돌아올 때 다시 패턴 요구
      setUnlockedRoute(null);
      setShowLock(false);
    }
  }, [location, unlockedRoute]);

  const handlePatternCorrect = () => {
    // 패턴 해제 직후임을 표시 — 다이얼로그 닫힐 때 navigate('/') 방지
    patternJustSolved.current = true;
    setUnlockedRoute(blockedRoute);
    setShowLock(false);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setShowLock(false);
      if (patternJustSolved.current) {
        // 패턴을 성공적으로 해제해서 닫힌 경우 → 현재 경로 유지
        patternJustSolved.current = false;
      } else {
        // 사용자가 취소/닫기로 닫은 경우 → 홈으로 이동
        navigate('/');
      }
    }
  };

  if (showLock) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">이 메뉴는 잠금 해제가 필요합니다</p>
        <PatternLockDialog
          open={true}
          onOpenChange={handleDialogClose}
          onPatternCorrect={handlePatternCorrect}
          title="메뉴 잠금 해제"
          description="패턴 또는 비밀번호를 입력하세요."
          testId="dialog-route-pattern"
        />
      </div>
    );
  }

  return <>{children}</>;
}

function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <SidebarProvider open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
      <div className="flex w-full" style={{ height: 'var(--real-vh, 100dvh)' }}>
        <AppSidebar />
        <div className="flex flex-col flex-1 min-h-0">
          <header className="flex items-center justify-between p-2 border-b shrink-0 bg-background">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              data-testid="button-sidebar-toggle"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </header>
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <RouteGuard>
              <Router />
            </RouteGuard>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const [location] = useLocation();

  if (isAdminRoute(location)) {
    return <AdminRouter />;
  }

  if (isCctvPublicRoute(location)) {
    if (location.startsWith("/screen/view")) return <ScreenViewPage />;
    if (location.startsWith("/cctv/remote")) return <CctvRemotePage />;
    return <CctvViewPage />;
  }

  // 데모/정식 모두 LicenseGate 통과 — 데모는 로그인 후에도 서버 체험 재검증
  return (
    <LicenseGate>
      <MainLayout />
    </LicenseGate>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(true);

  useWakeLock(wakeLockEnabled && isAuthenticated && dbReady);

  // 상시 감시·원격 대기 중에는 화면 꺼짐 방지 강제
  useEffect(() => {
    if (!dbReady || !isAuthenticated) return;
    const check = () => {
      try {
        const s = getSettings() as any;
        const desired = localStorage.getItem("cctv_desired_streaming") === "1";
        if (s.cctvAlwaysOn || desired) {
          setWakeLockEnabled(true);
        }
      } catch {}
    };
    check();
    window.addEventListener("cctv-settings-changed", check);
    const iv = setInterval(check, 5000);
    return () => {
      window.removeEventListener("cctv-settings-changed", check);
      clearInterval(iv);
    };
  }, [dbReady, isAuthenticated]);

  useEffect(() => {
    // --real-vh: JS로 정확한 뷰포트 높이 추적
    // dvh/vh/100vh는 Android 분할모드·플로팅 창 리사이즈 시 재계산되지 않아 하단 잘림 발생
    // visualViewport API (지원 시) 또는 window.innerHeight로 정확한 값 획득
    function updateRealVh() {
      const vh = (window.visualViewport?.height ?? window.innerHeight);
      document.documentElement.style.setProperty('--real-vh', `${vh}px`);
    }
    updateRealVh();
    window.addEventListener('resize', updateRealVh);
    window.visualViewport?.addEventListener('resize', updateRealVh);
    return () => {
      window.removeEventListener('resize', updateRealVh);
      window.visualViewport?.removeEventListener('resize', updateRealVh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Chrome PWA: 저장소 영구화 요청 (자동 삭제 방지) — 체험판은 PWA 미지원
        if (!isDemoMode() && navigator.storage?.persist) {
          await navigator.storage.persist();
        }
      } catch {}

      if (isDemoMode()) {
        blockPwaInstall();
        if (DEMO_SITE_MARKER) {
          (window as unknown as { __IVANSAUNA_DEMO__?: string }).__IVANSAUNA_DEMO__ =
            DEMO_SITE_MARKER;
        }
      }

      try {
        await initDatabase();
        if (cancelled) return;
        // DB(IndexedDB)에 남은 라이선스·로그인을 localStorage로 복구
        restoreSessionFromDatabase();
        if (cancelled) return;

        if (localStorage.getItem("authenticated") === "true") {
          setIsAuthenticated(true);
        }
        const settings = getSettings();
        setWakeLockEnabled(settings.screenWakeLock !== false);
        setDbReady(true);
      } catch (error) {
        console.error("Failed to initialize database:", error);
        if (!cancelled) {
          setDbError(
            error instanceof Error
              ? error.message
              : "데이터베이스를 열 수 없습니다."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      const settings = getSettings();
      setWakeLockEnabled(settings.screenWakeLock !== false);
    };

    window.addEventListener('storage', handleStorageChange);

    const interval = setInterval(() => {
      const settings = getSettings();
      setWakeLockEnabled(settings.screenWakeLock !== false);
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [dbReady]);

  // 뷰어·원격제어·원격화면은 앱 비밀번호 없이 토큰만으로 접근
  if (window.location.pathname.startsWith("/screen/view")) {
    return <ScreenViewPage />;
  }
  if (window.location.pathname.startsWith("/cctv/view")) {
    return <CctvViewPage />;
  }
  if (window.location.pathname.startsWith("/cctv/remote")) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CctvRemotePage />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  if (!dbReady) {
    return (
      <div className="flex items-center justify-center p-6" style={{ height: 'var(--real-vh, 100dvh)' }}>
        <div className="text-center max-w-md space-y-3">
          {dbError ? (
            <>
              <p className="text-lg font-medium text-destructive">데이터 로드 실패</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{dbError}</p>
              <Button type="button" onClick={() => window.location.reload()}>
                다시 시도
              </Button>
            </>
          ) : (
            <p className="text-lg">데이터베이스 초기화 중...</p>
          )}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <PasswordAuth onAuthenticated={() => setIsAuthenticated(true)} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CctvProvider>
          <CctvInstallNotifier />
          <AutoArchiveRunner />
          <AppContent />
          <Toaster />
          <UpdateBanner />
        </CctvProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
