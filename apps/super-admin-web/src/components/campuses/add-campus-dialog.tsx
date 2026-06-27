'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Label } from '@edrion/ui';
import {
  ApiClientError,
  useCampusChargePreview,
  useCreateCampus,
  type CampusChargeBreakdownDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CampusChargeBreakdown } from './campus-charge-breakdown';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/** Local date (YYYY-MM-DD) → ISO datetime the schema accepts. Undefined when empty. */
function toIso(date: string): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Add-campus flow with preview-before-confirm: form → POST /campuses/charge-preview →
 * confirm dialog showing the CampusChargeBreakdown → POST /campuses. No charge is created
 * until the operator confirms the exact next-invoice impact. Mirrors the 4b pattern.
 */
export function AddCampusDialog({
  institutionId,
  institutionName,
  onAdded,
}: {
  institutionId: string;
  institutionName?: string;
  onAdded?: () => void;
}) {
  const previewMut = useCampusChargePreview();
  const createMut = useCreateCampus();

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'form' | 'confirm'>('form');
  const [charge, setCharge] = useState<CampusChargeBreakdownDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [capacity, setCapacity] = useState('');
  const [timezone, setTimezone] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [forcePaidAddon, setForcePaidAddon] = useState(false);
  const [discountPct, setDiscountPct] = useState('');

  function reset() {
    setStage('form');
    setCharge(null);
    setError(null);
    setName('');
    setCode('');
    setCapacity('');
    setTimezone('');
    setEffectiveDate('');
    setForcePaidAddon(false);
    setDiscountPct('');
  }

  const discountBps = discountPct ? Math.round(Number(discountPct) * 100) : undefined;

  function runPreview() {
    setError(null);
    if (name.trim().length < 2) return setError('Campus name is required (min 2 characters).');
    if (!/^[A-Za-z0-9_-]{2,24}$/.test(code.trim())) {
      return setError('Code: 2–24 chars, letters, numbers, dash or underscore only.');
    }
    if (discountBps !== undefined && (discountBps < 0 || discountBps > 10000)) {
      return setError('Discount must be between 0 and 100%.');
    }
    previewMut.mutate(
      {
        institutionId,
        effectiveDate: toIso(effectiveDate),
        forcePaidAddon,
        customDiscountBps: discountBps,
      },
      {
        onSuccess: (data) => {
          setCharge(data);
          setStage('confirm');
        },
        onError: (e) =>
          setError(
            e instanceof ApiClientError
              ? e.message
              : 'Could not price this campus. The institution may have no active subscription.',
          ),
      },
    );
  }

  function runCreate() {
    setError(null);
    createMut.mutate(
      {
        institutionId,
        name: name.trim(),
        code: code.trim(),
        studentCapacity: capacity ? Number(capacity) : undefined,
        timezoneOverride: timezone.trim() || undefined,
        effectiveBillingDate: toIso(effectiveDate),
        forcePaidAddon,
        customDiscountBps: discountBps,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
          onAdded?.();
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not add the campus.'),
      },
    );
  }

  const isForm = stage === 'form';

  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4" /> Add campus
      </Button>

      <ConfirmDialog
        open={open}
        title={isForm ? (institutionName ? `Add a campus to ${institutionName}` : 'Add a campus') : 'Confirm campus charge'}
        description={
          isForm
            ? 'Additional campuses are chargeable. You will review the exact charge before it is created.'
            : 'Review the charge below. Adding the campus is logged to the audit trail and applied to the next invoice.'
        }
        requireReason={false}
        confirmLabel={isForm ? 'Review charge' : 'Add campus'}
        loading={isForm ? previewMut.isPending : createMut.isPending}
        error={error}
        onConfirm={isForm ? runPreview : runCreate}
        onClose={() => { setOpen(false); reset(); }}
      >
        {isForm ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="campus-name">Campus name</Label>
                <input id="campus-name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="campus-code">Code</Label>
                <input id="campus-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MAIN-01" className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="campus-capacity">Student capacity</Label>
                <input id="campus-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="campus-tz">Timezone override</Label>
                <input id="campus-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="campus-effective">Effective billing date</Label>
                <input id="campus-effective" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="campus-discount">Custom discount (%)</Label>
                <input id="campus-discount" type="number" min={0} max={100} step="0.01" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} className={fieldClass} />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={forcePaidAddon} onChange={(e) => setForcePaidAddon(e.target.checked)} />
              Force paid add-on (charge even if base allowance has room)
            </label>
          </>
        ) : charge ? (
          <>
            <div className="rounded-md border border-border bg-surface p-3 text-sm">
              <div className="font-medium text-text-primary">{name.trim()}</div>
              <div className="text-xs text-text-muted">Code {code.trim()}</div>
            </div>
            <CampusChargeBreakdown charge={charge} />
            <button
              type="button"
              onClick={() => { setStage('form'); setError(null); }}
              className="text-xs text-text-muted underline-offset-2 hover:text-text-primary hover:underline"
            >
              ← Edit details
            </button>
          </>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
