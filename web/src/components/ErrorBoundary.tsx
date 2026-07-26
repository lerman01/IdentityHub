import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a crash shows a message instead of a blank
 * page. React unmounts the whole tree on an uncaught render error, which is
 * silent unless you have the console open — this makes it visible.
 *
 * The fallback deliberately uses plain elements rather than our UI components:
 * if the crash originated inside one of those, rendering it again here would
 * throw a second time and defeat the boundary.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The boundary swallows the default logging, so keep the component stack —
    // it is what points at the failing component.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page failed to render. Reloading usually clears it; if it keeps happening, the
            details below and the browser console will say why.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
