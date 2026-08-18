'use client';
import { Component, type ReactNode } from 'react';
import { Button, ErrorState } from '@edrion/ui';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * App-shell error boundary: catches render-time crashes in any page so one broken view does not
 * blank the whole portal. Shows a recoverable ErrorState; "Reload" remounts the subtree.
 * (React error boundaries must be class components.)
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('[portal] render error:', error);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <ErrorState
            title="This page hit an error"
            description="The view crashed unexpectedly. Reloading usually fixes it; if it persists, contact your administrator."
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
