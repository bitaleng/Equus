import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setupServiceWorker } from "./lib/serviceWorker";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { ThemeProvider } from "./hooks/useTheme";

applyTheme(getStoredTheme());
setupServiceWorker();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
