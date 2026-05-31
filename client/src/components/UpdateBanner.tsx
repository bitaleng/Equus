import { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setShow(true);
    window.addEventListener("swUpdated", handleUpdate);
    return () => window.removeEventListener("swUpdated", handleUpdate);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-primary text-primary-foreground px-4 py-3 rounded-md shadow-lg">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">새 버전이 설치됐습니다</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => window.location.reload()}
        data-testid="button-pwa-update"
      >
        지금 업데이트
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-primary-foreground"
        onClick={() => setShow(false)}
        data-testid="button-pwa-update-dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
