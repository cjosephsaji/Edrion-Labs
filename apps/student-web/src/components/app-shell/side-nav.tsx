'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStudentClient } from '@/lib/student-client';
import { usePersona, useStudentTerm } from '@/lib/persona';
import {
  coreNav,
  filterSurfaceNav,
  institutionalNav,
  youNav,
  type NavItem,
  configNav,
} from '@/lib/nav';
import { useT } from '@/i18n/use-t';
import { PetrosMark } from '@/components/ui/primitives';
import { usePortalConfig } from '@/lib/portal-config';

export function NavLink({
  item,
  pathname,
  compact,
}: {
  item: NavItem;
  pathname: string;
  compact?: boolean;
}) {
  const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href));
  if (compact) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={`grid h-10 w-10 place-items-center rounded-[10px] transition ${
          active
            ? 'bg-st-accentDeep/[0.12] text-st-accentDeep'
            : 'text-st-inkSoft hover:bg-st-accentDeep/[0.07] hover:text-st-ink'
        }`}
      >
        <item.icon size={18} strokeWidth={active ? 2 : 1.7} aria-hidden />
        <span className="sr-only">{item.label}</span>
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-[11px] rounded-[10px] px-3 py-[9px] text-[13.5px] font-medium transition ${
        active
          ? 'bg-st-accentDeep/[0.07] text-st-accentDeep'
          : 'text-st-inkSoft hover:bg-st-accentDeep/[0.07] hover:text-st-ink'
      }`}
    >
      <item.icon size={17} strokeWidth={active ? 2 : 1.7} aria-hidden />
      <span className="flex flex-1 items-center gap-1">
        {item.label}
        {item.sparkle && (
          <span className="ml-auto">
            <PetrosMark />
          </span>
        )}
      </span>
    </Link>
  );
}

export function SideNav({ immersive = false }: { immersive?: boolean }) {
  const pathname = usePathname();
  const { me } = usePersona();
  const terms = useStudentTerm();
  const { t } = useT();
  const router = useRouter();
  const client = useStudentClient();
  const { config, stale, offline, refresh } = usePortalConfig();

  const resolvedItems = config ? configNav(config.modules) : [];
  const instItems = config ? resolvedItems : me?.kind === 'institutional' ? institutionalNav(terms) : coreNav;
  const surfaceItems = config ? [] : me?.kind === 'institutional' ? filterSurfaceNav(me.surfaces) : [];

  async function logout() {
    try {
      await client.post('/auth/logout');
    } catch {
      // redirect anyway
    }
    router.push('/login');
  }

  const sub =
    me?.kind === 'institutional'
      ? [me.student?.className, me.student?.curriculumLabel].filter(Boolean).join(' · ') ||
        me.institution?.name
      : t('shell.independentLearner');

  const compactItems: NavItem[] = [
    { href: '/home', label: 'Today', icon: coreNav[0]!.icon },
    ...[...instItems, ...surfaceItems].filter((i) => i.href === '/learn' || i.key === 'learn'),
    ...youNav.slice(0, 2),
  ];

  if (immersive) {
    return (
      <aside className="hidden min-[921px]:flex w-[56px] shrink-0 flex-col items-center border-r border-st-bd1 bg-st-sidebar py-3">
        <Link
          href="/learn"
          title="Edrion Learn"
          className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-st-accentDeep font-display text-[15px] font-bold text-[#F2EFE3]"
        >
          E
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1">
          {compactItems.map((item) => (
            <NavLink key={item.key ?? item.href} item={item} pathname={pathname} compact />
          ))}
        </nav>
        {me && (
          <button
            type="button"
            title={t('shell.logout')}
            onClick={() => void logout()}
            className="mt-2 grid h-9 w-9 place-items-center rounded-full bg-st-accentDeep font-display text-xs font-semibold text-[#F2EFE3]"
          >
            {me.initial}
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside className="hidden min-[921px]:flex w-[238px] shrink-0 flex-col border-r border-st-bd1 bg-st-sidebar">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-[18px]">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-st-accentDeep font-display text-[17px] font-bold text-[#F2EFE3]">
          E
        </span>
        <div className="leading-tight">
          <p className="font-display text-base font-bold text-st-accentDeep">Edrion</p>
          <p className="font-mono-ui text-[9.5px] font-medium tracking-[0.09em] text-st-faint">
            {t('shell.portalLabel')}
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2.5">
        <div className="space-y-0.5">
          {[{ href: '/home', label: 'Today', icon: coreNav[0]!.icon }].map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        {(stale || offline) && typeof navigator !== 'undefined' && !navigator.onLine && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mx-3 mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-left text-[10px] text-amber-800"
          >
            Offline · showing saved navigation · Retry
          </button>
        )}
        {!config && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="mx-3 mt-2 rounded-lg border border-st-bd1 px-2 py-1.5 text-left text-[10px] text-st-muted"
          >
            Portal modules unavailable · Retry
          </button>
        )}

        {instItems.length > 0 && (
          <div className="mt-1">
            <p className="px-3 pb-1.5 pt-3.5 font-mono-ui text-[9.5px] font-semibold tracking-[0.1em] text-[#A5AF9F]">
              {terms.instLabel}
            </p>
            <div className="space-y-0.5">
              {[...instItems, ...surfaceItems].map((item) => (
                <NavLink key={item.key ?? item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-1">
          <p className="px-3 pb-1.5 pt-3.5 font-mono-ui text-[9.5px] font-semibold tracking-[0.1em] text-[#A5AF9F]">
            YOU
          </p>
          <div className="space-y-0.5">
            {youNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </nav>

      {me && (
        <div className="border-t border-st-bd1 p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-st-accentDeep font-display text-sm font-semibold text-[#F2EFE3]">
              {me.initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-st-ink">{me.fullName}</p>
              <p className="truncate text-[11px] text-st-faint">{sub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2.5 w-full rounded-[9px] border border-st-bd2 bg-st-card px-2.5 py-[7px] text-[11.5px] font-semibold text-st-inkSoft transition hover:border-st-accent hover:text-st-accentDeep"
          >
            {t('shell.logout')}
          </button>
        </div>
      )}
    </aside>
  );
}
