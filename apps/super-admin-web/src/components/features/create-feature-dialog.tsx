'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Label } from '@edrion/ui';
import { ApiClientError, useCreateFeature, type FeatureDefinitionDto } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const ALL_SCOPES = [
  'global',
  'plan',
  'institution',
  'campus',
  'institution_user',
  'independent_user',
  'employee_role',
] as const;

/** Register a feature in the registry. Inert default (OFF) until assignments/rollouts apply. */
export function CreateFeatureDialog({ onCreated }: { onCreated?: (f: FeatureDefinitionDto) => void }) {
  const createMut = useCreateFeature();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [defaultValue, setDefaultValue] = useState(false);
  const [releaseStage, setReleaseStage] = useState('internal');
  const [scopes, setScopes] = useState<string[]>(['global', 'institution']);

  function reset() {
    setError(null);
    setKey('');
    setName('');
    setModuleName('');
    setDefaultValue(false);
    setReleaseStage('internal');
    setScopes(['global', 'institution']);
  }

  function toggleScope(s: string) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function submit() {
    setError(null);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key.trim())) {
      return setError('Key: lower_snake_case, starts with a letter (2–64 chars).');
    }
    if (name.trim().length < 2) return setError('Feature name is required (min 2 characters).');
    if (moduleName.trim().length < 2) return setError('Module is required (min 2 characters).');

    createMut.mutate(
      {
        key: key.trim(),
        name: name.trim(),
        module: moduleName.trim(),
        defaultValue,
        releaseStage,
        availableScopes: scopes,
      },
      {
        onSuccess: (f) => {
          setOpen(false);
          reset();
          onCreated?.(f);
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not create the feature.'),
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4" /> New feature
      </Button>

      <ConfirmDialog
        open={open}
        title="Register a feature"
        description="Add a feature to the registry. It resolves OFF by default until you assign values or roll it out."
        requireReason={false}
        confirmLabel="Create feature"
        loading={createMut.isPending}
        error={error}
        onConfirm={submit}
        onClose={() => { setOpen(false); reset(); }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="f-key">Key</Label>
            <input id="f-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ai_copilot" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="f-name">Name</Label>
            <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="AI Copilot" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="f-module">Module</Label>
            <input id="f-module" value={moduleName} onChange={(e) => setModuleName(e.target.value)} placeholder="copilot" className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="f-stage">Release stage</Label>
            <select id="f-stage" value={releaseStage} onChange={(e) => setReleaseStage(e.target.value)} className={fieldClass}>
              <option value="internal">Internal</option>
              <option value="alpha">Alpha</option>
              <option value="beta">Beta</option>
              <option value="ga">GA</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={defaultValue} onChange={(e) => setDefaultValue(e.target.checked)} />
          Default value ON (resolves ON when nothing more specific applies)
        </label>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Available scopes</div>
          <div className="flex flex-wrap gap-2">
            {ALL_SCOPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleScope(s)}
                className={
                  'rounded-full border px-2.5 py-1 text-xs ' +
                  (scopes.includes(s)
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border text-text-muted hover:text-text-primary')
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
