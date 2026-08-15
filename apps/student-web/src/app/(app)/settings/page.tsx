'use client';

import { useState } from 'react';
import { Check, Download, LockKeyhole, Trash2 } from 'lucide-react';
import { ActionButton, Card, PageHeader } from '@/components/design-system';
import { useStudentMe } from '@/lib/hooks';
import { useStudentPreferences, type StudentTheme, type TextSize } from '@/lib/preferences';

type Section = 'appearance' | 'profile' | 'notifications' | 'institution' | 'privacy' | 'account';

const themeCards: Array<{
  id: StudentTheme;
  name: string;
  description: string;
  palette: { page: string; card: string; border: string; ink: string; muted: string; accent: string };
}> = [
  {
    id: 'standard',
    name: 'Editorial',
    description: 'Forest ink on warm paper',
    palette: { page: '#F5F2E9', card: '#FBFAF5', border: '#DDD9CD', ink: '#17372F', muted: '#8B958F', accent: '#1D674F' },
  },
  {
    id: 'dim',
    name: 'Dim',
    description: 'Softer light for evening',
    palette: { page: '#221E18', card: '#302A23', border: '#443D33', ink: '#ECE7DC', muted: '#938C80', accent: '#48B78C' },
  },
  {
    id: 'dark',
    name: 'Ink',
    description: 'True dark, easy on the eyes',
    palette: { page: '#14110D', card: '#221D17', border: '#332C22', ink: '#EDE7DB', muted: '#8B8478', accent: '#5FCB9E' },
  },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--s-accent)]' : 'bg-[var(--s-bd2)]'}`}
    >
      <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left] ${checked ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

function Segmented<T extends string>({ values, value, onChange, label }: { values: T[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="inline-flex border border-[var(--s-bd1)] bg-[var(--s-surface2)] p-[2px]" aria-label={label}>
      {values.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`px-4 py-1.5 text-[10px] font-semibold transition-colors ${value === item ? 'bg-[#0C3F31] text-[#F6F3E9]' : 'text-[var(--s-inkSoft)]'}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { data: me } = useStudentMe();
  const preferences = useStudentPreferences();
  const [section, setSection] = useState<Section>('appearance');
  const [announcements, setAnnouncements] = useState(true);
  const [deadlines, setDeadlines] = useState(true);
  const [feeReminders, setFeeReminders] = useState(false);
  const college = Boolean(me?.programmeName);
  const institutionLabel = college ? 'College' : 'School';
  const institutionName = me?.programmeName || me?.className || `Your ${institutionLabel.toLowerCase()}`;
  const sections: Array<{ id: Section; label: string }> = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'profile', label: 'Profile' },
    { id: 'notifications', label: 'Notifications' },
    ...(me?.kind === 'institutional' ? [{ id: 'institution' as const, label: institutionLabel }] : []),
    { id: 'privacy', label: 'Privacy' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <PageHeader eyebrow="Settings" title="Make Edrion yours" description="Choose how the portal looks, moves, and keeps you informed." />

      <div className="flex flex-col gap-6 min-[700px]:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto pb-1 min-[700px]:w-[170px] min-[700px]:flex-col" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`whitespace-nowrap border-l px-[13px] py-2.5 text-left text-[11px] font-semibold transition-colors ${section === item.id ? 'border-[var(--s-accent)] bg-[var(--s-accentSoft)] text-[var(--s-accentDeep)]' : 'border-transparent text-[var(--s-inkSoft)] hover:bg-[var(--s-surface2)]'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === 'appearance' ? (
            <Card>
              <h2 className="font-display text-[15px] font-semibold text-[var(--s-ink)]">Theme</h2>
              <p className="mt-1 text-[11px] leading-5 text-[var(--s-faint)]">Warm paper, forest ink and quiet rules. Dusk and Ink retain the same academic character after dark.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {themeCards.map((item) => {
                  const active = !preferences.matchSystem && preferences.theme === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => preferences.setTheme(item.id)}
                      className="overflow-hidden text-left"
                      style={{ border: `${active ? 2.5 : 1.5}px solid ${active ? item.palette.accent : item.palette.border}` }}
                      aria-pressed={active}
                    >
                      <span className="block p-3" style={{ background: item.palette.page }}>
                        <span className="block p-2.5" style={{ background: item.palette.card, border: `1px solid ${item.palette.border}` }}>
                          <span className="block h-[7px] w-3/5 rounded-full" style={{ background: item.palette.ink }} />
                          <span className="mt-1.5 block h-[5px] w-4/5 rounded-full" style={{ background: item.palette.muted }} />
                          <span className="mt-2 inline-block rounded-full px-2 py-1 font-mono-ui text-[7px] font-bold" style={{ background: item.palette.accent, color: item.palette.page }}>EDRION</span>
                        </span>
                      </span>
                      <span className="block px-3 pb-3 pt-2" style={{ background: item.palette.card }}>
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: item.palette.ink }}>
                          {item.name}
                          {active ? <Check className="ml-auto h-3.5 w-3.5" style={{ color: item.palette.accent }} /> : null}
                        </span>
                        <span className="mt-0.5 block text-[10.5px]" style={{ color: item.palette.muted }}>{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-[18px] flex items-center gap-3 border-t border-[var(--s-divider)] pt-4">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[var(--s-ink)]">Match system</p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--s-faint)]">Follow your device&apos;s light or dark setting automatically</p>
                </div>
                <Toggle checked={preferences.matchSystem} onChange={preferences.setMatchSystem} label="Match system theme" />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[var(--s-ink)]">Reduce motion</p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--s-faint)]">Calmer transitions everywhere — your OS setting is respected too</p>
                </div>
                <Toggle checked={preferences.reduceMotion} onChange={preferences.setReduceMotion} label="Reduce motion" />
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-semibold text-[var(--s-ink)]">Text size</p>
                <Segmented<TextSize> values={['S', 'M', 'L']} value={preferences.textSize} onChange={preferences.setTextSize} label="Text size" />
              </div>
            </Card>
          ) : null}

          {section === 'profile' ? (
            <Card>
              <div className="flex items-center gap-3.5">
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#0C3F31] font-display text-[21px] font-semibold text-[#F2EFE3]">{me?.fullName?.slice(0, 1).toUpperCase() || 'S'}</div>
                <div>
                  <h2 className="font-display text-base font-semibold text-[var(--s-ink)]">{me?.fullName || 'Student'}</h2>
                  <p className="mt-0.5 text-xs text-[var(--s-faint)]">{[me?.className, me?.sectionName, me?.termName].filter(Boolean).join(' · ') || me?.email}</p>
                </div>
              </div>
              <div className="mt-[18px] border-t border-[var(--s-divider)] pt-4">
                <p className="text-[13px] font-semibold text-[var(--s-ink)]">Interface language</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--s-faint)]">More portal languages will appear as your institution enables them.</p>
                <div className="mt-3"><ActionButton>English</ActionButton></div>
              </div>
            </Card>
          ) : null}

          {section === 'notifications' ? (
            <Card className="space-y-4">
              {[
                { label: 'Teacher announcements', description: `New posts from your ${institutionLabel.toLowerCase()}`, checked: announcements, change: setAnnouncements },
                { label: 'Assignment deadlines', description: 'One useful reminder before work is due', checked: deadlines, change: setDeadlines },
                { label: 'Fee reminders', description: 'When a published invoice is approaching its due date', checked: feeReminders, change: setFeeReminders },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[var(--s-ink)]">{item.label}</p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--s-faint)]">{item.description}</p>
                  </div>
                  <Toggle checked={item.checked} onChange={item.change} label={item.label} />
                </div>
              ))}
              <p className="border-t border-[var(--s-divider)] pt-3 text-[11.5px] leading-5 text-[var(--s-faint)]">No guilt notifications, ever. Nothing here nags you for stepping away.</p>
            </Card>
          ) : null}

          {section === 'institution' ? (
            <Card>
              <p className="eyebrow">LINKED ACCOUNT</p>
              <h2 className="mt-2 font-display text-base font-semibold text-[var(--s-ink)]">{institutionName}</h2>
              <p className="mt-1 text-xs text-[var(--s-faint)]">Your academic record and campus services are managed here.</p>
              <div className="mt-4 rounded-xl border border-[var(--s-bd1)] bg-[var(--s-surface2)] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--s-inkSoft)]"><LockKeyhole className="h-3.5 w-3.5 text-[var(--s-faint)]" /> Institutional controls</div>
                <p className="mt-2 font-display text-sm font-semibold text-[var(--s-accentDeep)]">Your permissions follow your student record</p>
                <p className="mt-1 text-[11.5px] leading-5 text-[var(--s-faint)]">Modules are shown only when your {institutionLabel.toLowerCase()} has enabled them for you. Contact the office if something expected is missing.</p>
              </div>
            </Card>
          ) : null}

          {section === 'privacy' ? (
            <Card>
              <h2 className="text-[13px] font-semibold text-[var(--s-ink)]">What your {institutionLabel.toLowerCase()} can see</h2>
              <div className="mt-3 space-y-2 text-[12.5px] text-[var(--s-inkSoft)]">
                <p>✓ Submitted assignments and teacher feedback</p>
                <p>✓ Attendance, timetable, results, and service requests</p>
                <p>✗ Your private device preferences</p>
                <p>✗ Anything outside your linked institution account</p>
              </div>
              <p className="mt-4 border-t border-[var(--s-divider)] pt-3 text-[11.5px] leading-5 text-[var(--s-faint)]">Your portal only shows records your institution has published to you.</p>
            </Card>
          ) : null}

          {section === 'account' ? (
            <Card>
              <h2 className="text-[13px] font-semibold text-[var(--s-ink)]">Your data</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-[var(--s-faint)]">Everything in your account is yours. Take a copy with you any time.</p>
              <div className="mt-3"><ActionButton variant="secondary"><Download className="h-4 w-4" /> Export my data</ActionButton></div>
              <div className="mt-5 border-t border-[var(--s-divider)] pt-4">
                <h3 className="text-[13px] font-semibold text-[var(--s-danger)]">Delete account</h3>
                <p className="mt-1 text-[11.5px] leading-5 text-[var(--s-faint)]">Permanent, after a 14-day grace period. Your institution may still retain official academic records it is legally required to keep.</p>
                <div className="mt-3"><ActionButton variant="danger"><Trash2 className="h-4 w-4" /> Delete my account</ActionButton></div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
