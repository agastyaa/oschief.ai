import { Component, type ErrorInfo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundaryClass extends Component<Props & { navigate?: (path: string) => void }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
          <p className="text-lg font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.navigate?.("/");
            }}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            Back to home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Wrapper that injects navigate for use inside Router
export function ErrorBoundary({ children, fallback, onError }: Props) {
  const navigate = useNavigate();
  return (
    <ErrorBoundaryClass navigate={navigate} fallback={fallback} onError={onError}>
      {children}
    </ErrorBoundaryClass>
  );
}
