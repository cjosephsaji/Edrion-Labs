'use client';
import { Component, type ReactNode } from 'react';
import { Button, ErrorState } from '@edrion/ui';
import { webEnv } from '@/lib/env';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Best-effort crash report to the API so render crashes land with server errors (Phase 10d). */
function reportRenderCrash(error: Error, componentStack?: string): void {
  try {
    const body = JSON.stringify({
      message: error.message || 'Unknown render error',
      stack: error.stack?.slice(0, 4000),
      componentStack: componentStack?.slice(0, 4000),
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
    void fetch(`${webEnv.apiBaseUrl}/v1/observability/client-error`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* never let reporting throw inside the boundary */
  }
}

/**
 * App-shell error boundary: catches render-time crashes in any page so one broken view does not
 * blank the whole admin app. Shows a recoverable ErrorState; "Reload" remounts the subtree.
 * (React error boundaries must be class components.)
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[app-shell] render error:', error);
    reportRenderCrash(error, info.componentStack ?? undefined);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <ErrorState
            title="This page hit an error"
            description="The view crashed unexpectedly. Reloading usually fixes it; if it persists, contact platform engineering."
            action={
              <Button size="sm" variant="secondary" onClick={this.reset}>
                Reload this view
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
