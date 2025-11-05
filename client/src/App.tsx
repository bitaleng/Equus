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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleMenuClick = () => {
    console.log('handleMenuClick - isSidebarOpen:', isSidebarOpen);
    if (isSidebarOpen) {
      // Sidebar is open, close it without password
      console.log('Closing sidebar without password');
      setIsSidebarOpen(false);
    } else {
      // Sidebar is closed, require password to open
      console.log('Opening password dialog to open sidebar');
      setShowPasswordDialog(true);
      setPasswordInput("");
      setPasswordError("");
    }
  };

  const handleSidebarOpenChange = (open: boolean) => {
    // Allow closing without password, but opening requires password
    if (!open) {
      setIsSidebarOpen(false);
    } else if (!isSidebarOpen) {
      // Trying to open - show password dialog
      setShowPasswordDialog(true);
      setPasswordInput("");
      setPasswordError("");
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const savedPassword = localStorage.getItem("staff_password") || "1234";
    
    if (passwordInput === savedPassword) {
      setShowPasswordDialog(false);
      setPasswordInput("");
      setPasswordError("");
      setIsSidebarOpen(true);
    } else {
      setPasswordError("비밀번호가 올바르지 않습니다.");
    }
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
              onClick={handleMenuClick}
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

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent data-testid="dialog-menu-password">
          <DialogHeader>
            <DialogTitle>비밀번호 확인</DialogTitle>
            <DialogDescription>
              메뉴에 접근하려면 비밀번호를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="비밀번호 입력"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError("");
                }}
                data-testid="input-menu-password"
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-destructive mt-2" data-testid="text-password-error">
                  {passwordError}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPasswordDialog(false)}
                data-testid="button-cancel-password"
              >
                취소
              </Button>
              <Button type="submit" data-testid="button-submit-password">
                확인
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
      // Auto-delete data older than 1 year
      const settings = getSettings();
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      
      // Format as business day string (YYYY-MM-DD) using configured business day start hour
      const cutoffDate = getBusinessDay(oneYearAgo, settings.businessDayStartHour);
      
      try {
        deleteOldData(cutoffDate);
        console.log(`Deleted data older than ${cutoffDate} (business day start hour: ${settings.businessDayStartHour})`);
      } catch (error) {
        console.error('Failed to delete old data:', error);
      }
      
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
