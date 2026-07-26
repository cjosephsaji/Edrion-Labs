'use client';
import { usePathname } from 'next/navigation';
import { EmptyState } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { NAV } from '@/lib/nav';

/**
 * Catch-all for modules whose UI isn't built yet. Honest placeholder (clearly "coming soon"),
 * not fake data — the route map is real; the vertical lands in a later phase. Real routes like
 * /dashboard take precedence over this catch-all.
 */
export default function ModulePendingPage() {
  const pathname = usePathname();
  const navItem = NAV.flatMap((g) => g.items).find((i) => i.href === pathname);
  const title = navItem?.label ?? toTitle(pathname);

  return (
    <>
      <Topbar title={title} />
      <div className="page-enter flex flex-1 items-center justify-center p-8">
        <EmptyState
          title={`${title} — coming soon`}
          description="This module is part of the portal roadmap and is being built phase by phase. The navigation, permissions and scope system around it are already live."
        />
      </div>
    </>
  );
}

function toTitle(pathname: string): string {
  const slug = pathname.split('/').filter(Boolean).pop() ?? 'Module';
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
}
