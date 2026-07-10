'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SideNav } from './side-nav';
import { TopBar } from './top-bar';
import { BottomNav } from './bottom-nav';
import { ToastProvider } from '@/components/ui/toast';

function isVisualEditorRoute(pathname: string): boolean {
  return /^\/lab\/visual\/[^/]+$/.test(pathname);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const editorRoute = isVisualEditorRoute(pathname);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-st-page font-body text-st-ink">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          {!editorRoute && <TopBar />}
          <main
            ref={mainRef}
            className={`flex-1 min-[921px]:pb-6 ${
              editorRoute ? 'h-dvh overflow-hidden pb-0' : 'overflow-y-auto pb-24'
            }`}
          >
            {children}
          </main>
          {!editorRoute && <BottomNav />}
        </div>
      </div>
    </ToastProvider>
  );
}
