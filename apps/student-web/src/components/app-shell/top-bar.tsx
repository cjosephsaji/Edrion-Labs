'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePersona } from '@/lib/persona';
import { useStudentClient } from '@/lib/student-client';

export function TopBar() {
  const pathname = usePathname();
  const { me } = usePersona();
  const router = useRouter();
  const client = useStudentClient();

  async function logout() {
    try {
      await client.post('/auth/logout');
    } catch {
      // continue
    }
    router.push('/login');
  }

  const learnActive = pathname.startsWith('/learn');
  const pathActive = pathname.startsWith('/learn/path');
  const progressActive = pathname.startsWith('/analytics') || pathname.startsWith('/progress');

  return (
    <header className="sticky top-0 z-30 border-b border-st-bd1 bg-st-sidebar min-[921px]:hidden">
      <div className="flex h-12 items-center gap-2 px-3.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-st-accentDeep font-display text-sm font-bold text-[#F2EFE3]">
          E
        </span>
        <span className="font-display text-sm font-bold text-st-accentDeep">Edrion</span>
        <div className="flex-1" />
        <Link
          href="/learn"
          className={`px-2 py-1.5 text-[12.5px] font-semibold ${
            learnActive && !pathActive && !progressActive ? 'text-st-accentDeep' : 'text-st-inkSoft'
          }`}
        >
          Learn
        </Link>
        <Link
          href="/learn/path"
          className={`px-2 py-1.5 text-[12.5px] font-semibold ${
            pathActive ? 'text-st-accentDeep' : 'text-st-inkSoft'
          }`}
        >
          Path
        </Link>
        {me?.kind === 'institutional' && (
          <Link
            href="/analytics"
            className={`px-2 py-1.5 text-[12.5px] font-semibold ${
              progressActive ? 'text-st-accentDeep' : 'text-st-inkSoft'
            }`}
          >
            Progress
          </Link>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="grid h-[30px] w-[30px] place-items-center rounded-full bg-st-accentDeep font-display text-[13px] font-semibold text-[#F2EFE3]"
          aria-label="Account"
        >
          {me?.initial ?? '?'}
        </button>
      </div>
    </header>
  );
}
