import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PasswordAuth } from "@/components/PasswordAuth";
import Home from "@/pages/Home";
import LogsPage from "@/pages/LogsPage";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import { initDatabase, deleteOldData, getSettings } from "@/lib/localDb";
import { getBusinessDay } from "@shared/businessDay";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/logs" component={LogsPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
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
        <SidebarProvider>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1">
              <header className="flex items-center justify-start p-2 border-b">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              </header>
              <main className="flex-1 overflow-hidden">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
