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
} from '@/lib/nav';
import { useT } from '@/i18n/use-t';
import { PetrosMark } from '@/components/ui/primitives';

export function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href));
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

export function SideNav() {
  const pathname = usePathname();
  const { me } = usePersona();
  const terms = useStudentTerm();
  const { t } = useT();
  const router = useRouter();
  const client = useStudentClient();

  const instItems = me?.kind === 'institutional' ? institutionalNav(terms) : [];
  const surfaceItems = me?.kind === 'institutional' ? filterSurfaceNav(me.surfaces) : [];

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
          {coreNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        {instItems.length > 0 && (
          <div className="mt-1">
            <p className="px-3 pb-1.5 pt-3.5 font-mono-ui text-[9.5px] font-semibold tracking-[0.1em] text-[#A5AF9F]">
              {terms.instLabel}
            </p>
            <div className="space-y-0.5">
              {[...instItems, ...surfaceItems].map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
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
