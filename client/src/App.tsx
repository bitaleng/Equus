import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PasswordAuth } from "@/components/PasswordAuth";
import Home from "@/pages/Home";
import LogsPage from "@/pages/LogsPage";
import Settings from "@/pages/Settings";
import ExpensesPage from "@/pages/ExpensesPage";
import ClosingPage from "@/pages/ClosingPage";
import NotFound from "@/pages/not-found";
import { initDatabase, deleteOldData, getSettings } from "@/lib/localDb";
import { getBusinessDay } from "@shared/businessDay";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import PatternLockDialog from "@/components/PatternLockDialog";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/logs" component={LogsPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/expenses" component={ExpensesPage} />
      <Route path="/closing" component={ClosingPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showPatternDialog, setShowPatternDialog] = useState(false);

  const handleSidebarOpenChange = (open: boolean) => {
    console.log('handleSidebarOpenChange called - requested open:', open, 'current isSidebarOpen:', isSidebarOpen);
    
    if (open && !isSidebarOpen) {
      // Trying to open from closed state - show pattern dialog
      console.log('Requesting to open sidebar - showing pattern dialog');
      setShowPatternDialog(true);
      // Don't change sidebar state yet, wait for pattern verification
    } else if (!open && isSidebarOpen) {
      // Closing from open state - allow without pattern
      console.log('Closing sidebar without pattern');
      setIsSidebarOpen(false);
    }
  };

  const handlePatternCorrect = () => {
    console.log('Pattern verified - opening sidebar');
    setIsSidebarOpen(true);
  };

  return (
    <SidebarProvider open={isSidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-start p-2 border-b">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                console.log('Toggle button clicked - current state:', isSidebarOpen);
                handleSidebarOpenChange(!isSidebarOpen);
              }}
              data-testid="button-sidebar-toggle"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>

      <PatternLockDialog
        open={showPatternDialog}
        onOpenChange={setShowPatternDialog}
        onPatternCorrect={handlePatternCorrect}
        title="메뉴 잠금 해제"
        description="패턴을 그려서 메뉴에 접근하세요."
        testId="dialog-menu-pattern"
      />
    </SidebarProvider>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const authenticated = localStorage.getItem("authenticated");
    if (authenticated === "true") {
      setIsAuthenticated(true);
    }

    // Initialize database
    initDatabase().then(() => {
      // Temporarily disabled: Auto-delete data older than 1 year
      // (Will be re-enabled after business_day format normalization)
      /*
      const settings = getSettings();
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      
      const cutoffDate = getBusinessDay(oneYearAgo, settings.businessDayStartHour);
      
      try {
        deleteOldData(cutoffDate);
        console.log(`Deleted data older than ${cutoffDate} (business day start hour: ${settings.businessDayStartHour})`);
      } catch (error) {
        console.error('Failed to delete old data:', error);
      }
      */
      
      setDbReady(true);
    }).catch((error) => {
      console.error('Failed to initialize database:', error);
    });
  }, []);

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
        <MainLayout />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
