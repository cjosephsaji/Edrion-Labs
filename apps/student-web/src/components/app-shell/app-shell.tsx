'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SideNav } from './side-nav';
import { TopBar } from './top-bar';
import { BottomNav } from './bottom-nav';
import { ToastProvider } from '@/components/ui/toast';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-st-page font-body text-st-ink">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main ref={mainRef} className="flex-1 overflow-y-auto pb-24 min-[921px]:pb-6">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
    </ToastProvider>
  );
}
