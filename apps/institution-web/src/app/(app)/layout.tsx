import { Sidebar } from '@/components/app-shell/sidebar';
import { AppErrorBoundary } from '@/components/app-shell/error-boundary';

// Authenticated portal pages are always dynamic (per-user data, scope + filter state).
export const dynamic = 'force-dynamic';

/** Authenticated app shell: fixed sidebar + scrollable main. Pages render their own Topbar. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Keyboard users can jump past the nav straight to the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface-elevated focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-text-primary focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-y-auto focus:outline-none">
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </main>
    </div>
  );
}
