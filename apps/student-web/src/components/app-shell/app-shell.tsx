'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SideNav } from './side-nav';
import { TopBar } from './top-bar';
import { BottomNav } from './bottom-nav';
import { ToastProvider } from '@/components/ui/toast';

function isVisualEditorRoute(pathname: string): boolean {
  return /^\/lab\/visual\/[^/]+$/.test(pathname);
}

/** Full-bleed Learn lesson — icon rail only, no top/bottom chrome. */
export function isImmersiveRoute(pathname: string): boolean {
  return /^\/learn\/session(\/|$)/.test(pathname);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const editorRoute = isVisualEditorRoute(pathname);
  const immersive = isImmersiveRoute(pathname);
  const [disabledModule, setDisabledModule] = useState<string | null>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) =>
      setDisabledModule(String((event as CustomEvent<{ module?: string }>).detail?.module ?? 'module'));
    window.addEventListener('edrion:module-disabled', handler);
    return () => window.removeEventListener('edrion:module-disabled', handler);
  }, []);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-st-page font-body text-st-ink">
        <SideNav immersive={immersive} />
        <div className="flex min-w-0 flex-1 flex-col">
          {!editorRoute && !immersive && <TopBar />}
          <main
            ref={mainRef}
            className={`flex-1 min-[921px]:pb-6 ${
              editorRoute || immersive
                ? 'h-dvh overflow-y-auto pb-0'
                : 'overflow-y-auto pb-24'
            }`}
          >
            {disabledModule ? (
              <div className="mx-auto max-w-lg px-5 py-20">
                <div className="rounded-2xl border border-st-bd1 bg-[#f8f5ee] p-7 text-center">
                  <h1 className="font-display text-xl font-semibold">This section is unavailable</h1>
                  <p className="mt-2 text-sm text-st-muted">
                    Your institution has turned this section off.
                  </p>
                  <Link
                    href="/home"
                    onClick={() => setDisabledModule(null)}
                    className="mt-5 inline-block rounded-xl bg-st-accentDeep px-4 py-2 text-sm font-semibold text-white"
                  >
                    Back to Today
                  </Link>
                </div>
              </div>
            ) : (
              children
            )}
          </main>
          {!editorRoute && !immersive && <BottomNav />}
        </div>
      </div>
    </ToastProvider>
  );
}
