import { Sidebar } from '@/components/app-shell/sidebar';
import { AppErrorBoundary } from '@/components/app-shell/error-boundary';

// Authenticated admin pages are always dynamic (per-employee data, URL filter state).
export const dynamic = 'force-dynamic';

/** Authenticated app shell: fixed sidebar + scrollable main. Pages render their own Topbar. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden bg-background">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgb(222_238_228_/_0.65),transparent_34rem),linear-gradient(180deg,var(--background),var(--background-secondary))]">
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </main>
    </div>
  );
}
