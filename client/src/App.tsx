import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import LogsPage from "@/pages/LogsPage";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";

function Router() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const storedLogs = localStorage.getItem('lockerLogs');
      if (storedLogs) {
        setLogs(JSON.parse(storedLogs));
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/logs">
        {() => <LogsPage logs={logs} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
