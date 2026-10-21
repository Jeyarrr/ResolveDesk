import { Component, type ReactNode } from 'react';
import { Button } from '../ui/button';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="grid min-h-screen place-items-center p-6">
          <div className="card max-w-lg p-8">
            <h1 className="text-2xl font-semibold">We hit an unexpected problem</h1>
            <p className="my-4 text-muted-foreground">
              Reload the workspace to try again. If the issue persists, clear this site's demo data
              in your browser settings.
            </p>
            <Button onClick={() => window.location.reload()}>Reload workspace</Button>
          </div>
        </main>
      );
    return this.props.children;
  }
}
