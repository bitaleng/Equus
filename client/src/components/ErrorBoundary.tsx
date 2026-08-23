import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 화면 어딘가에서 예외가 나면 리액트가 전체 트리를 그냥 지워버려 흰 화면만 남는다.
 * 이 바운더리가 없으면 원인이 무엇이든(캐시 불일치, 코드 버그 등) 사용자는
 * "새로고침하면 되는 이유 모를 흰 화면"만 보게 된다 — 최소한 안내와 복구 버튼을 보여준다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] 화면 렌더링 중 오류:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center p-6" style={{ height: "var(--real-vh, 100dvh)" }}>
          <div className="text-center max-w-md space-y-3">
            <p className="text-lg font-medium text-destructive">화면 표시 중 오류가 발생했습니다</p>
            <p className="text-sm text-muted-foreground">
              새로고침하면 대부분 정상적으로 돌아옵니다. 반복되면 관리자에게 알려주세요.
            </p>
            <Button type="button" onClick={() => window.location.reload()}>
              새로고침
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
