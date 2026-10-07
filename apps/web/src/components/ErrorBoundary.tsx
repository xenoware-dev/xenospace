import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StatusPage } from './StatusPage.jsx';
import { Button } from './ui/Button.jsx';
import { Warning } from './icons.jsx';

/**
 * Top-level error boundary.
 *
 * A render error in one page must not leave a blank document — this keeps the
 * app recoverable and gives the user something to act on. In development the
 * message is shown; in production it is logged and withheld.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The place to forward to an error reporter.
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <StatusPage
        fullScreen
        code="500"
        tone="critical"
        icon={<Warning size={22} />}
        title="Something broke on this page"
        message="The error has been logged. Reloading usually clears it; your work on other pages is safe."
        detail={
          import.meta.env.DEV && (
            <pre className="max-h-48 overflow-auto text-left font-mono text-2xs whitespace-pre-wrap text-[var(--status-critical-ink)]">
              {error.message}
              {'\n\n'}
              {error.stack?.split('\n').slice(0, 8).join('\n')}
            </pre>
          )
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="primary" onClick={() => window.location.reload()}>Reload page</Button>
          </>
        }
      />
    );
  }
}
