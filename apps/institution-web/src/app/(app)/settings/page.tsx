'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bell, BookOpen, Building2, GraduationCap, LayoutList, Save, School, ScrollText, ShieldCheck, SlidersHorizontal, UserCog } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  CountrySelect,
  ErrorState,
  Input,
  InternationalPhoneInput,
  Label,
  PermissionDenied,
  Select,
  Skeleton,
  TimezoneSelect,
  NOMENCLATURE_PRESETS,
  SETTINGS_CATEGORY_META,
  SETTINGS_REGISTRY,
  TERM_KEYS,
  currencyForCountry,
  currencyLabel,
  type EffectiveSettings,
  type InstitutionProfile,
  type NomenclatureOverrides,
  type SettingDef,
  type TermKey,
  type UpdateInstitutionProfileInput,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { NavigationSection } from '@/components/settings/navigation-editor';
import { usePermissions } from '@/lib/permissions';
import {
  useEffectiveSettings,
  useInstitutionProfile,
  useSaveEffectiveSettings,
  useSaveInstitutionProfile,
  useSaveNomenclatureOverrides,
} from '@/lib/settings';

type Section = 'profile' | 'preferences' | 'navigation' | 'nomenclature' | 'administration';

const SECTIONS: { key: Section; label: string; icon: typeof Building2 }[] = [
  { key: 'profile', label: 'Institution Profile', icon: Building2 },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { key: 'navigation', label: 'Navigation', icon: LayoutList },
  { key: 'nomenclature', label: 'Nomenclature', icon: BookOpen },
  { key: 'administration', label: 'Administration', icon: ShieldCheck },
];

export default function SettingsPage() {
  const { can } = usePermissions();
  const canManage = can('institution_settings.manage');
  const [section, setSection] = useState<Section>('profile');

  if (!can('institution_settings.view')) {
    return (
      <>
        <Topbar title="Settings" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to view settings." />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Settings" />
      <div className="page-enter mx-auto flex w-full max-w-6xl flex-col gap-6 p-5">
        {/* Section switcher */}
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-muted/40 p-1" aria-label="Settings sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {section === 'profile' && <ProfileSection canManage={canManage} />}
        {section === 'preferences' && <PreferencesSection canManage={canManage} />}
        {section === 'navigation' && <NavigationSection canManage={canManage} />}
        {section === 'nomenclature' && <NomenclatureSection canManage={canManage} />}
        {section === 'administration' && <AdministrationSection />}
      </div>
    </>
  );
}

// =============================================================================
// Institution Profile
// =============================================================================

interface ProfileForm {
  displayName: string;
  legalName: string;
  type: string;
  logoUrl: string;
  country: string;
  region: string;
  timezone: string;
  addrLine1: string;
  addrLine2: string;
  addrCity: string;
  addrPostal: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
}

const TYPE_OPTIONS = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'training_center', label: 'Training center' },
];

function toForm(p: InstitutionProfile): ProfileForm {
  return {
    displayName: p.displayName ?? '',
    legalName: p.legalName ?? '',
    type: p.type ?? 'school',
    logoUrl: p.logoUrl ?? '',
    country: p.country ?? '',
    region: p.region ?? '',
    timezone: p.timezone ?? '',
    addrLine1: p.address?.line1 ?? '',
    addrLine2: p.address?.line2 ?? '',
    addrCity: p.address?.city ?? '',
    addrPostal: p.address?.postalCode ?? '',
    contactName: p.primaryContact?.name ?? '',
    contactEmail: p.primaryContact?.email ?? '',
    contactPhone: p.primaryContact?.phone ?? '',
    contactTitle: p.primaryContact?.title ?? '',
  };
}

function ProfileSection({ canManage }: { canManage: boolean }) {
  const { data: profile, isLoading, isError, refetch } = useInstitutionProfile();
  const save = useSaveInstitutionProfile();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setForm(toForm(profile));
  }, [profile]);

  if (isLoading || !form) {
    return (
      <Card>
        <div className="flex flex-col gap-4 p-5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </Card>
    );
  }
  if (isError || !profile) {
    return (
      <ErrorState
        description="Couldn’t load your institution profile."
        action={
          <Button size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
    setError(null);
  };

  const derivedCurrency = form.country ? currencyForCountry(form.country) : undefined;

  async function onSave() {
    if (!form || !profile) return;
    setError(null);
    const input: UpdateInstitutionProfileInput = {
      displayName: form.displayName.trim(),
      legalName: form.legalName.trim(),
      type: form.type as UpdateInstitutionProfileInput['type'],
      logoUrl: form.logoUrl.trim() ? form.logoUrl.trim() : null,
      country: form.country,
      region: form.region.trim() ? form.region.trim() : null,
      timezone: form.timezone,
      address: {
        line1: form.addrLine1.trim() || undefined,
        line2: form.addrLine2.trim() || undefined,
        city: form.addrCity.trim() || undefined,
        postalCode: form.addrPostal.trim() || undefined,
        country: form.country || undefined,
      },
      primaryContact: {
        name: form.contactName.trim(),
        email: form.contactEmail.trim(),
        phone: form.contactPhone.trim() || undefined,
        title: form.contactTitle.trim() || undefined,
      },
      version: profile.version,
    };
    try {
      await save.mutateAsync(input);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Identity */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Your institution’s public name, type and logo.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{profile.publicId}</Badge>
            <StatusPill status={profile.status} />
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 gap-5 border-t border-border p-5 md:grid-cols-2">
          <Field label="Display name" hint="Shown across the portal and to parents.">
            <Input value={form.displayName} disabled={!canManage} onChange={(e) => set('displayName', e.target.value)} />
          </Field>
          <Field label="Legal name" hint="The registered legal entity name.">
            <Input value={form.legalName} disabled={!canManage} onChange={(e) => set('legalName', e.target.value)} />
          </Field>
          <Field label="Institution type">
            <Select value={form.type} disabled={!canManage} onChange={(e) => set('type', e.target.value)} options={TYPE_OPTIONS} />
          </Field>
          <Field label="Logo URL" hint="A public https link to your logo image.">
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-contain" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text-muted">
                  <School className="h-4 w-4" />
                </span>
              )}
              <Input value={form.logoUrl} placeholder="https://…" disabled={!canManage} onChange={(e) => set('logoUrl', e.target.value)} />
            </div>
          </Field>
        </div>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Location & currency</CardTitle>
          <CardDescription>Your country sets the operating currency automatically.</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-1 gap-5 border-t border-border p-5 md:grid-cols-2">
          <Field label="Country">
            <CountrySelect value={form.country} disabled={!canManage} onChange={(iso2) => set('country', iso2)} />
          </Field>
          <Field label="Operating currency" hint="Set from your country. Used for fees, payroll and reports.">
            <div className="flex h-10 items-center rounded-md border border-border bg-surface-muted/50 px-3 text-sm text-text-secondary">
              {derivedCurrency ? currencyLabel(derivedCurrency) : 'Select a country to set the currency'}
            </div>
          </Field>
          <Field label="State / region">
            <Input value={form.region} disabled={!canManage} onChange={(e) => set('region', e.target.value)} />
          </Field>
          <Field label="Timezone" hint="Drives schedules, attendance, reports and logs.">
            <TimezoneSelect value={form.timezone} countryCode={form.country} disabled={!canManage} onChange={(tz) => set('timezone', tz)} />
          </Field>
          <Field label="Address line 1">
            <Input value={form.addrLine1} disabled={!canManage} onChange={(e) => set('addrLine1', e.target.value)} />
          </Field>
          <Field label="Address line 2">
            <Input value={form.addrLine2} disabled={!canManage} onChange={(e) => set('addrLine2', e.target.value)} />
          </Field>
          <Field label="City">
            <Input value={form.addrCity} disabled={!canManage} onChange={(e) => set('addrCity', e.target.value)} />
          </Field>
          <Field label="Postal code">
            <Input value={form.addrPostal} disabled={!canManage} onChange={(e) => set('addrPostal', e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* Primary contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Primary contact</CardTitle>
          <CardDescription>The main point of contact for this institution.</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-1 gap-5 border-t border-border p-5 md:grid-cols-2">
          <Field label="Contact name">
            <Input value={form.contactName} disabled={!canManage} onChange={(e) => set('contactName', e.target.value)} />
          </Field>
          <Field label="Title / role">
            <Input value={form.contactTitle} disabled={!canManage} onChange={(e) => set('contactTitle', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.contactEmail} disabled={!canManage} onChange={(e) => set('contactEmail', e.target.value)} />
          </Field>
          <Field label="Phone">
            <InternationalPhoneInput
              value={form.contactPhone}
              defaultCountry={form.country}
              disabled={!canManage}
              onChange={(v) => set('contactPhone', v)}
            />
          </Field>
        </div>
      </Card>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button onClick={onSave} loading={save.isPending}>
            <Save className="h-4 w-4" />
            Save profile
          </Button>
          {saved && <span className="text-sm text-success">Profile saved.</span>}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === 'active' ? 'success' : status === 'suspended' ? 'danger' : 'neutral';
  return <Badge tone={tone as 'success' | 'danger' | 'neutral'}>{status}</Badge>;
}

// =============================================================================
// Preferences (registry-driven)
// =============================================================================

/** Derived from Institution Profile — shown read-only here so there is one source of truth. */
const READONLY_KEYS = new Set(['currency', 'timezone']);

function PreferencesSection({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = useEffectiveSettings();
  const save = useSaveEffectiveSettings();
  const [values, setValues] = useState<EffectiveSettings>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.values) setValues(data.values);
  }, [data]);

  const byCategory = useMemo(() => {
    const m = new Map<string, SettingDef[]>();
    for (const def of SETTINGS_REGISTRY) {
      const list = m.get(def.category) ?? [];
      list.push(def);
      m.set(def.category, list);
    }
    return m;
  }, []);

  const set = (key: string, value: string | number | boolean) => {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };

  async function onSave() {
    // Never write the read-only, profile-derived keys back through this form.
    const editable = Object.fromEntries(Object.entries(values).filter(([k]) => !READONLY_KEYS.has(k)));
    await save.mutateAsync(editable);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-text-secondary">
          Institution-wide preferences. Each takes real effect across the platform — the note under a field says where.
        </p>
        {canManage && (
          <Button size="sm" onClick={onSave} loading={save.isPending}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        )}
      </div>
      {saved && (
        <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">Preferences saved.</div>
      )}
      {isLoading && <Skeleton className="h-40 w-full" />}

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_CATEGORY_META.filter((c) => c.key !== 'nomenclature').map((cat) => {
          const defs = byCategory.get(cat.key) ?? [];
          if (defs.length === 0) return null;
          return (
            <Card key={cat.key} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle>{cat.label}</CardTitle>
                {cat.description && <CardDescription>{cat.description}</CardDescription>}
              </CardHeader>
              <div className="flex flex-col gap-5 border-t border-border p-5">
                {defs.map((def) => (
                  <SettingField
                    key={def.key}
                    def={def}
                    value={values[def.key]}
                    disabled={!canManage || READONLY_KEYS.has(def.key)}
                    readOnly={READONLY_KEYS.has(def.key)}
                    onChange={(v) => set(def.key, v)}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SettingField({
  def,
  value,
  disabled,
  readOnly,
  onChange,
}: {
  def: SettingDef;
  value: string | number | boolean | undefined;
  disabled: boolean;
  readOnly: boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const note = readOnly ? 'Set in Institution Profile.' : def.applies;

  if (def.type === 'boolean') {
    return (
      <label className="flex cursor-pointer items-start gap-3">
        <span className="mt-0.5">
          <Checkbox checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        </span>
        <span>
          <span className="text-sm font-medium text-text-primary">{def.label}</span>
          <span className="block text-xs text-text-muted">{note}</span>
        </span>
      </label>
    );
  }
  return (
    <div>
      <Label>{def.label}</Label>
      {def.type === 'select' ? (
        <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} options={def.options ?? []} disabled={disabled} />
      ) : (
        <Input
          type={def.type === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(e) => onChange(def.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
      <p className="mt-1 text-xs text-text-muted">{note}</p>
    </div>
  );
}

// =============================================================================
// Nomenclature (institution-type labels + tenant overrides)
// =============================================================================

const TERM_LABELS: Record<TermKey, string> = {
  academicYear: 'Academic year',
  department: 'Department / programme',
  gradeLevel: 'Grade / year level',
  class: 'Class / section',
  section: 'Section',
  subject: 'Subject / course',
  term: 'Term / semester',
  student: 'Student',
  teacher: 'Teacher / lecturer',
  staff: 'Staff',
  admission: 'Admission',
  enrolment: 'Enrolment',
  programmeStructure: 'Programme structure page',
};

function NomenclatureSection({ canManage }: { canManage: boolean }) {
  const { data: profile } = useInstitutionProfile();
  const { data: effective, isLoading } = useEffectiveSettings();
  const save = useSaveNomenclatureOverrides();
  const [overrides, setOverrides] = useState<NomenclatureOverrides>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const institutionType = profile?.type ?? 'school';
  const preset = NOMENCLATURE_PRESETS[institutionType] ?? NOMENCLATURE_PRESETS.school;

  useEffect(() => {
    if (effective?.nomenclatureOverrides) {
      setOverrides(effective.nomenclatureOverrides);
      setDirty(false);
    }
  }, [effective?.nomenclatureOverrides]);

  function setTerm(key: TermKey, field: 'singular' | 'plural', value: string) {
    setError(null);
    setOverrides((prev: NomenclatureOverrides) => {
      const next = { ...(prev[key] ?? {}), [field]: value };
      const hasValue = !!(next.singular?.trim() || next.plural?.trim());
      if (!hasValue) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: next };
    });
    setDirty(true);
  }

  function resetRow(key: TermKey) {
    setOverrides((prev: NomenclatureOverrides) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDirty(true);
  }

  function resetAll() {
    setOverrides({});
    setDirty(true);
  }

  async function onSave() {
    setError(null);
    try {
      await save.mutateAsync(overrides);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save nomenclature. Please try again.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Nomenclature</CardTitle>
            <CardDescription>
              Your institution type is <strong className="text-text-primary">{institutionType.replace('_', ' ')}</strong>.
              Labels below default from that preset; override any row to customise what staff and families see.
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={resetAll} disabled={!dirty}>
                Reset all
              </Button>
              <Button type="button" size="sm" onClick={() => void onSave()} loading={save.isPending} disabled={!dirty}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        {(error || (save.isSuccess && !dirty)) && (
          <div className="border-t border-border px-5 py-2">
            {error && <p className="text-sm text-danger">{error}</p>}
            {save.isSuccess && !dirty && !error && (
              <p className="text-sm text-success">Nomenclature saved — labels update across the portal.</p>
            )}
          </div>
        )}
      </Card>

      {isLoading && <Skeleton className="h-40 w-full" />}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted/60 text-left text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Concept</th>
              <th className="px-4 py-3 font-semibold">Singular</th>
              <th className="px-4 py-3 font-semibold">Plural</th>
              <th className="px-4 py-3 font-semibold w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {TERM_KEYS.map((key: TermKey) => {
              const override = overrides[key];
              return (
                <tr key={key}>
                  <td className="px-4 py-3 font-medium text-text-primary">{TERM_LABELS[key]}</td>
                  <td className="px-4 py-3">
                    <Input
                      value={override?.singular ?? ''}
                      placeholder={preset[key].singular}
                      disabled={!canManage}
                      onChange={(e) => setTerm(key, 'singular', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      value={override?.plural ?? ''}
                      placeholder={preset[key].plural}
                      disabled={!canManage}
                      onChange={(e) => setTerm(key, 'plural', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {override && canManage && (
                      <button type="button" onClick={() => resetRow(key)} className="text-xs text-primary hover:underline">
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Administration (links to related management modules)
// =============================================================================

const ADMIN_LINKS: { label: string; href: string; permission: string; description: string; icon: typeof Building2 }[] = [
  { label: 'Campuses', href: '/campuses', permission: 'campuses.view', description: 'Add and manage campus sites.', icon: School },
  { label: 'User Management', href: '/users', permission: 'users.view', description: 'Invite users and manage access.', icon: UserCog },
  { label: 'Roles & Permissions', href: '/roles', permission: 'roles.view', description: 'Define custom roles and what they can do.', icon: ShieldCheck },
  { label: 'Notifications', href: '/notifications', permission: 'announcements.view', description: 'Delivery of announcements and alerts.', icon: Bell },
  { label: 'Audit Logs', href: '/audit', permission: 'audit.view', description: 'Review every change made in the portal.', icon: ScrollText },
  { label: 'Student portal', href: '/settings/student-portal', permission: 'student_portal.manage', description: 'Invite students and control what they can see.', icon: GraduationCap },
  { label: 'Calendar types', href: '/settings/calendar-types', permission: 'calendar_events.manage', description: 'Event type labels and colours for the institution calendar.', icon: LayoutList },
];

function AdministrationSection() {
  const { can } = usePermissions();
  const links = ADMIN_LINKS.filter((l) => can(l.permission));

  if (links.length === 0) {
    return (
      <Card>
        <div className="p-6 text-sm text-text-secondary">
          You don’t have access to any administration areas. Ask an administrator for the relevant permissions.
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {links.map((l) => {
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-muted/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-medium text-text-primary">
                {l.label}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="block text-xs text-text-muted">{l.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// =============================================================================
// Small helpers
// =============================================================================

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
