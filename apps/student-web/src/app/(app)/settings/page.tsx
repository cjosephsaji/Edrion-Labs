'use client';
import { useEffect, useState } from 'react';
import { usePersona } from '@/lib/persona';
import { usePreferences, useStudentMe } from '@/lib/hooks';
import { useTheme, type StudentThemeName } from '@/lib/theme';
import { useT } from '@/i18n/use-t';
import { useToast } from '@/components/ui/toast';
import { Card } from '@/components/ui/card';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';
import { useStudentClient } from '@/lib/student-client';
import { useStudentTerm } from '@/lib/persona';

type SectionId =
  | 'appearance'
  | 'profile'
  | 'learning'
  | 'notifications'
  | 'school'
  | 'privacy'
  | 'account';

const themeOrder: StudentThemeName[] = ['standard', 'dim', 'dark'];
type TodayPreferences={version:number;homeStatChips:string[];moduleNotifications:Record<string,boolean>};

function ThemeCard({
  name,
  theme,
  active,
  onSelect,
}: {
  name: StudentThemeName;
  theme: { name: string; desc: string };
  active: boolean;
  onSelect: () => void;
}) {
  const swatches: Record<StudentThemeName, string[]> = {
    standard: ['#F3F0E7', '#FFFFFF', '#1E7A5E'],
    dim: ['#221E18', '#302A23', '#48B78C'],
    dark: ['#14110D', '#221D17', '#5FCB9E'],
  };
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[15px] border p-4 text-left transition ${
        active ? 'border-st-accent bg-st-accentSoft/40 ring-2 ring-st-accent/20' : 'border-st-bd2 bg-st-card hover:border-st-accent/40'
      }`}
    >
      <div className="flex gap-1">
        {swatches[name].map((c) => (
          <span key={c} className="h-6 w-6 rounded-full border border-st-bd1" style={{ background: c }} />
        ))}
      </div>
      <p className="mt-3 font-display font-semibold text-st-ink">{theme.name}</p>
      <p className="text-xs text-st-muted">{theme.desc}</p>
      {active && <p className="mt-2 text-xs font-semibold text-st-accent">✓ Selected</p>}
    </button>
  );
}

export default function SettingsPage() {
  const { t } = useT();
  const { me } = usePersona();
  const { data: profile } = useStudentMe();
  const { update } = usePreferences();
  const {
    theme,
    matchSystem,
    reducedMotion,
    textSize,
    setTheme,
    setMatchSystem,
    setReducedMotion,
    setTextSize,
  } = useTheme();
  const terms = useStudentTerm();
  const { say } = useToast();
  const client = useStudentClient();
  const [section, setSection] = useState<SectionId>('appearance');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [todayPrefs,setTodayPrefs]=useState<TodayPreferences>();

  useEffect(()=>{if(section!=='notifications'||todayPrefs)return;void client.get<TodayPreferences>('/me/today-preferences').then(setTodayPrefs).catch(()=>undefined);},[client,section,todayPrefs]);

  async function updateToday(patch:{home_stat_chips?:string[];module_notifications?:Record<string,boolean>}){if(!todayPrefs)return;try{const row=await client.patch<TodayPreferences>('/me/today-preferences',{version:todayPrefs.version,...patch});setTodayPrefs(row);say('Today preferences saved.');}catch{say("Couldn't save Today preferences.");}}

  const sections: { id: SectionId; label: string; show?: boolean }[] = [
    { id: 'appearance', label: t('settings.sections.appearance') },
    { id: 'profile', label: t('settings.sections.profile') },
    { id: 'learning', label: t('settings.sections.learning') },
    { id: 'notifications', label: t('settings.sections.notifications') },
    {
      id: 'school' as const,
      label: me?.persona === 'college' ? t('settings.sections.institution') : t('settings.sections.school'),
      show: me?.kind === 'institutional',
    },
    { id: 'account', label: t('settings.sections.account') },
    { id: 'privacy', label: t('settings.sections.privacy') },
  ].filter((s) => s.show !== false) as { id: SectionId; label: string; show?: boolean }[];

  const prefs = profile?.preferences;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 pb-24 md:flex-row md:py-10">
      <nav className="flex gap-2 overflow-x-auto md:w-48 md:flex-col md:overflow-visible">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`shrink-0 rounded-[10px] px-4 py-2.5 text-left text-sm font-medium md:w-full ${
              section === s.id ? 'bg-st-accentDeep/[0.07] text-st-accentDeep' : 'text-st-muted hover:bg-st-accentSoft/40'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-4">
        <PageHeader eyebrow={<Eyebrow>SETTINGS</Eyebrow>} title={t('settings.title')} />

        {section === 'appearance' && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              {themeOrder.map((name) => (
                <ThemeCard
                  key={name}
                  name={name}
                  theme={{
                    name: t(`settings.appearance.themes.${name}.name`),
                    desc: t(`settings.appearance.themes.${name}.desc`),
                  }}
                  active={theme === name}
                  onSelect={() => setTheme(name)}
                />
              ))}
            </div>
            <ToggleRow
              label={t('settings.appearance.matchSystem')}
              hint={t('settings.appearance.matchSystemHint')}
              checked={matchSystem}
              onChange={setMatchSystem}
            />
            <ToggleRow
              label={t('settings.appearance.reduceMotion')}
              hint={t('settings.appearance.reduceMotionHint')}
              checked={reducedMotion}
              onChange={setReducedMotion}
            />
            <div>
              <p className="text-sm font-medium text-st-ink">{t('settings.appearance.textSize')}</p>
              <div className="mt-2 flex gap-2">
                {(['S', 'M', 'L'] as const).map((size) => (
                  <PillChip key={size} variant={textSize === size ? 'primary' : 'default'} onClick={() => setTextSize(size)}>
                    {size}
                  </PillChip>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'profile' && me && (
          <Card>
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-st-accentSoft text-lg font-bold text-st-accentDeep">
                {me.initial}
              </span>
              <div>
                <p className="font-display text-lg font-semibold">{me.fullName}</p>
                <p className="text-sm text-st-muted">
                  {me.kind === 'institutional'
                    ? [me.student?.className, me.student?.gradeLevel].filter(Boolean).join(' · ')
                    : 'Independent learner'}
                </p>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-sm font-medium">{t('settings.profile.language')}</p>
              <p className="text-xs text-st-muted">{t('settings.profile.languageHint')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  { code: 'en', label: 'English' },
                  { code: 'hi', label: 'हिन्दी' },
                  { code: 'es', label: 'Español' },
                  { code: 'bn', label: 'বাংলা' },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => update.mutate({ language: lang.code as 'en' | 'hi' | 'es' | 'bn' })}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      prefs?.language === lang.code ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
              {prefs?.language && prefs.language !== 'en' && (
                <p className="mt-2 text-xs text-st-muted">{t('settings.profile.translationsSoon')}</p>
              )}
            </div>
            {me.kind === 'institutional' ? (
              <p className="mt-4 text-xs text-st-muted">{t('settings.profile.gradeReadonly')}</p>
            ) : null}
          </Card>
        )}

        {section === 'learning' && prefs && (
          <div className="space-y-6">
            <ChipGroup
              label={t('settings.learning.hints')}
              helper={t('settings.learning.hintsHelper')}
              options={[
                { value: 'gentle', label: t('settings.learning.hintsGentle') },
                { value: 'balanced', label: t('settings.learning.hintsBalanced') },
                { value: 'direct', label: t('settings.learning.hintsDirect') },
              ]}
              value={prefs.hintGenerosity}
              onChange={(v) => update.mutate({ hintGenerosity: v as 'gentle' | 'balanced' | 'direct' })}
            />
            <ChipGroup
              label={t('settings.learning.celebrations')}
              helper={t('settings.learning.celebrationsHelper')}
              options={[
                { value: 'warm', label: t('settings.learning.celebrationsWarm') },
                { value: 'calm', label: t('settings.learning.celebrationsCalm') },
              ]}
              value={prefs.celebration}
              onChange={(v) => update.mutate({ celebration: v as 'warm' | 'calm' })}
            />
            <div>
              <p className="text-sm font-medium">{t('settings.learning.weeklyGoal')}</p>
              <input
                type="range"
                min={4}
                max={14}
                value={prefs.weeklyGoal}
                onChange={(e) => update.mutate({ weeklyGoal: Number(e.target.value) })}
                className="mt-2 w-full accent-st-accent"
              />
              <p className="text-sm text-st-muted">
                {t('settings.learning.weeklyGoalHelper', { n: prefs.weeklyGoal })}
              </p>
            </div>
          </div>
        )}

        {section === 'notifications' && prefs && (
          <div className="space-y-4">
            <ToggleRow
              label={t('settings.notifications.sessionReminders')}
              hint={t('settings.notifications.sessionRemindersDesc')}
              checked={prefs.notifSessionReminders}
              onChange={(v) => update.mutate({ notifSessionReminders: v })}
            />
            <ToggleRow
              label={t('settings.notifications.revisionDue')}
              hint={t('settings.notifications.revisionDueDesc')}
              checked={prefs.notifRevisionDue}
              onChange={(v) => update.mutate({ notifRevisionDue: v })}
            />
            <ToggleRow
              label={t('settings.notifications.announcements')}
              hint={
                me?.kind === 'institutional'
                  ? t('settings.notifications.announcementsDescInstitutional')
                  : t('settings.notifications.announcementsDescIndependent')
              }
              checked={prefs.notifAnnouncements}
              onChange={(v) => update.mutate({ notifAnnouncements: v })}
            />
            {todayPrefs&&<Card><p className="font-medium text-st-ink">Today screen</p><p className="mt-1 text-xs text-st-muted">Choose up to three quick stats and which updates may send a push. Updates still remain in Today when push is off.</p><div className="mt-4"><p className="text-xs font-semibold text-st-muted">QUICK STATS</p><div className="mt-2 flex flex-wrap gap-2">{[
              ['attendance_pct','Attendance'],['gpa_term','Published average'],['streak','Streak'],['review_due_count','Review due'],['fees_balance','Fee balance'],['mock_percentile','Mock percentile'],
            ].map(([value,label])=>{const selected=todayPrefs.homeStatChips.includes(value!);return <button key={value} type="button" onClick={()=>{const next=selected?todayPrefs.homeStatChips.filter(key=>key!==value):[...todayPrefs.homeStatChips,value!].slice(-3);void updateToday({home_stat_chips:next});}} className={`rounded-full px-3 py-1.5 text-xs font-medium ${selected?'bg-st-accent text-white':'bg-st-surface2 text-st-muted'}`}>{label}</button>;})}</div></div><div className="mt-5 space-y-2">{[['announcements','Announcements'],['results','Results'],['fees','Fees'],['requests','Requests'],['clubs','Clubs']].map(([module,label])=><ToggleRow key={module} label={label!} checked={todayPrefs.moduleNotifications[module!]!==false} onChange={(checked)=>void updateToday({module_notifications:{...todayPrefs.moduleNotifications,[module!]:checked}})}/>)}</div></Card>}
            <p className="text-xs text-st-muted">{t('settings.notifications.footer')}</p>
          </div>
        )}

        {section === 'school' && me?.kind === 'institutional' && (
          <div className="space-y-4">
            <Card>
              <p className="text-[10px] font-semibold tracking-wider text-st-faint">
                {t('settings.school.linkedAccount')}
              </p>
              <p className="mt-1 font-display text-lg font-semibold">{me.institution?.name}</p>
              <p className="text-sm text-st-muted">{t('settings.school.managedBy')}</p>
            </Card>
            <Card>
              <p className="font-medium">{t('settings.school.petrosGraded')}</p>
              <p className="text-sm text-st-muted">{t('settings.school.petrosGradedDesc')}</p>
              <p className="mt-2 text-xs text-st-muted">
                {t('settings.school.petrosGradedDefault').replace('school', terms.unitP.toLowerCase())}
              </p>
            </Card>
            <PillButton variant="ghost" onClick={() => say(t('settings.school.unlinkToast'))}>
              {t('settings.school.unlink')}
            </PillButton>
          </div>
        )}

        {section === 'privacy' && (
          <Card>
            {me?.kind === 'institutional' ? (
              <>
                <p className="font-medium">{t('settings.privacy.institutionalTitle')}</p>
                <p className="mt-2 text-sm text-st-muted">{t('settings.privacy.institutionalNever')}</p>
              </>
            ) : (
              <p className="text-sm text-st-muted">{t('settings.privacy.independent')}</p>
            )}
          </Card>
        )}

        {section === 'account' && (
          <div className="space-y-4">
            <Card>
              <p className="font-medium">{t('settings.account.export')}</p>
              <p className="text-sm text-st-muted">{t('settings.account.exportDesc')}</p>
              <PillButton
                className="mt-3"
                onClick={async () => {
                  await client.post('/account/export');
                  say(t('settings.account.exportRequested'));
                }}
              >
                {t('settings.account.export')}
              </PillButton>
            </Card>
            <Card>
              <p className="font-medium text-st-danger">{t('settings.account.delete')}</p>
              <p className="text-sm text-st-muted">{t('settings.account.deleteDesc')}</p>
              <input
                className="mt-3 w-full rounded-xl border border-st-bd1 bg-st-card px-3 py-2 text-sm"
                placeholder={t('settings.account.deleteConfirm')}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
              <PillButton
                variant="ghost"
                className="mt-3 border-st-danger/30 text-st-danger"
                disabled={deleteConfirm !== 'DELETE'}
                onClick={async () => {
                  await client.post('/account/delete-request');
                  say('Deletion request recorded.');
                }}
              >
                {t('settings.account.delete')}
              </PillButton>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[15px] border border-st-bd1 bg-st-card p-4">
      <div>
        <p className="text-sm font-medium text-st-ink">{label}</p>
        {hint && <p className="text-xs text-st-muted">{hint}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-st-accent"
      />
    </label>
  );
}

function ChipGroup({
  label,
  helper,
  options,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {helper && <p className="text-xs text-st-muted">{helper}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => (
          <PillChip key={opt.value} variant={value === opt.value ? 'primary' : 'default'} onClick={() => onChange(opt.value)}>
            {opt.label}
          </PillChip>
        ))}
      </div>
    </div>
  );
}
