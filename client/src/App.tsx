import { useState, useEffect } from "react";
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
import AdminLicenses from "@/pages/AdminLicenses";
import NotFound from "@/pages/not-found";
import { initDatabase, getSettings } from "@/lib/localDb";
import { Menu, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import PatternLockDialog from "@/components/PatternLockDialog";
import { useWakeLock } from "@/hooks/useWakeLock";
import { isDemoMode, blockPwaInstall } from "@/lib/demoMode";
import { isRouteLocked } from "@/lib/menuLock";

function isAdminRoute(path: string): boolean {
  return path.startsWith("/admin");
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
      <Route path="/admin/licenses" component={AdminLicenses} />
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

  useEffect(() => {
    if (isRouteLocked(location) && unlockedRoute !== location) {
      // 잠긴 경로이고, 현재 해제된 경로와 다르면 잠금 표시
      setBlockedRoute(location);
      setShowLock(true);
    } else {
      setShowLock(false);
    }
  }, [location, unlockedRoute]);

  const handlePatternCorrect = () => {
    // 해당 경로만 해제 — 다른 경로로 이동하면 다시 잠김
    setUnlockedRoute(blockedRoute);
    setShowLock(false);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setShowLock(false);
      navigate('/');
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
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-start p-2 border-b">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              data-testid="button-sidebar-toggle"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </header>
          <main className="flex-1 overflow-auto">
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
    return <AdminLicenses />;
  }

  if (isDemoMode()) {
    return <MainLayout />;
  }

  return (
    <LicenseGate>
      <MainLayout />
    </LicenseGate>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(true);

  useWakeLock(wakeLockEnabled && isAuthenticated && dbReady);

  useEffect(() => {
    if (isDemoMode()) {
      blockPwaInstall();
    }

    const authenticated = localStorage.getItem("authenticated");
    if (authenticated === "true") {
      setIsAuthenticated(true);
    }

    initDatabase().then(() => {
      const settings = getSettings();
      setWakeLockEnabled(settings.screenWakeLock !== false);
      setDbReady(true);
    }).catch((error) => {
      console.error('Failed to initialize database:', error);
    });
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

  if (!dbReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-lg">데이터베이스 초기화 중...</p>
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
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
