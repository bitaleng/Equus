import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

interface ThemeToggleProps {
  className?: string;
  /** icon = 헤더용, switch-row = 설정용 라벨 포함 */
  variant?: "icon" | "labeled";
}

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  if (variant === "labeled") {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={toggleTheme}
        className={className}
        data-testid="button-theme-toggle"
        aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      >
        {isDark ? (
          <Sun className="h-4 w-4 mr-2" />
        ) : (
          <Moon className="h-4 w-4 mr-2" />
        )}
        {isDark ? "라이트 모드" : "다크 모드"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={className}
      data-testid="button-theme-toggle"
      title={isDark ? "라이트 모드" : "다크 모드"}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
