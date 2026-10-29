'use client';
import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@edrion/ui';
import { useInstitutionChoices } from '@/lib/institutions';

export function SwitchInstitutionLink({
  collapsed = false,
  guardian = false,
  enabled = true,
}: {
  collapsed?: boolean;
  guardian?: boolean;
  enabled?: boolean;
}) {
  const { data } = useInstitutionChoices(enabled);
  if (!data || data.institutions.length < 2) return null;
  return (
    <Link
      href="/choose-institution"
      aria-label="Switch institution"
      title="Switch institution"
      className={
        guardian
          ? 'flex h-9 items-center gap-2 rounded-full px-2 text-sm text-muted hover:bg-line/50'
          : cn(
              'mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-text transition-colors hover:bg-white/[0.08] hover:text-white',
              collapsed && 'justify-center px-0',
            )
      }
    >
      <ArrowLeftRight aria-hidden className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">Switch institution</span>}
    </Link>
  );
}
