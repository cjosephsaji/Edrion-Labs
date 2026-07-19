import '../guardian.css';
import { GuardianAppShell } from '@/components/guardian/app-shell';
import { GuardianPortalGate } from '@/components/guardian/guardian-gate';

export const dynamic = 'force-dynamic';

export default function GuardianLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuardianPortalGate>
      <GuardianAppShell>{children}</GuardianAppShell>
    </GuardianPortalGate>
  );
}
