'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, LoaderCircle, Trash2 } from 'lucide-react';
import {
  PETROS_DEFAULT_COMPANION_PREFERENCES,
  type PetrosCompanionPreferences,
} from '@edrion/schemas';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import styles from './petros-settings-section.module.css';

type ThreadRow = { id: string; title: string | null; lastActivityAt: string };

const DEPTH: Array<{ id: PetrosCompanionPreferences['responseDepth']; label: string; hint: string }> = [
  { id: 'brief', label: 'Brief', hint: 'Three sentences at most' },
  { id: 'balanced', label: 'Balanced', hint: 'A short answer and one next step' },
  { id: 'thorough', label: 'Thorough', hint: 'More detail when it helps' },
];

const ENERGY: Array<{ id: PetrosCompanionPreferences['energy']; label: string; hint: string }> = [
  { id: 'calm', label: 'Calm', hint: 'Steady and quiet' },
  { id: 'warm', label: 'Warm', hint: 'Friendly and direct' },
  { id: 'upbeat', label: 'Upbeat', hint: 'Bright and encouraging' },
];

const HUMOUR: Array<{ id: PetrosCompanionPreferences['humour']; label: string; hint: string }> = [
  { id: 'off', label: 'Off', hint: 'No jokes at all' },
  { id: 'light', label: 'Light', hint: 'The occasional aside' },
  { id: 'playful', label: 'Playful', hint: 'Jokes once the help lands' },
];

/**
 * Student-controlled companion settings, stored server-side so they follow the account
 * across devices. Everything here changes Petros's next reply, not just the interface.
 */
export function PetrosSettingsSection() {
  const api = useStudentApi();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PetrosCompanionPreferences>(PETROS_DEFAULT_COMPANION_PREFERENCES);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const preferences = useQuery({
    queryKey: ['student', 'petros', 'companion-preferences'],
    queryFn: () => api.get<PetrosCompanionPreferences>('/student/petros/companion/preferences'),
  });

  const threads = useQuery({
    queryKey: ['student', 'petros', 'companion-threads'],
    queryFn: () => api.get<{ items: ThreadRow[] }>('/student/petros/companion/threads'),
  });

  useEffect(() => {
    if (preferences.data) setDraft(preferences.data);
  }, [preferences.data]);

  const save = useMutation({
    mutationFn: (next: PetrosCompanionPreferences) =>
      api.put<PetrosCompanionPreferences>('/student/petros/companion/preferences', next),
    onSuccess: (result) => {
      setDraft(result);
      setSaved(true);
      setError('');
      window.setTimeout(() => setSaved(false), 2200);
      void queryClient.invalidateQueries({ queryKey: ['student', 'petros', 'companion-preferences'] });
      void queryClient.invalidateQueries({ queryKey: ['student', 'petros', 'mentor'] });
    },
    onError: (caught) => setError(formatApiError(caught)),
  });

  const forget = useMutation({
    mutationFn: (threadId: string) => api.del<{ deleted: boolean }>(`/student/petros/companion/threads/${threadId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'petros', 'companion-threads'] }),
    onError: (caught) => setError(formatApiError(caught)),
  });

  function update(patch: Partial<PetrosCompanionPreferences>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    save.mutate(next);
  }

  const conversations = threads.data?.items ?? [];

  return (
    <div className={styles.wrap}>
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2>How Petros talks to you</h2>
          <p>These change his next reply, not just how the portal looks.</p>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>What he should call you</span>
          <input
            className={styles.input}
            value={draft.preferredName ?? ''}
            maxLength={60}
            placeholder="Your first name"
            onChange={(event) => setDraft({ ...draft, preferredName: event.target.value || null })}
            onBlur={() => save.mutate(draft)}
          />
        </label>

        <Choice label="Answer length" options={DEPTH} value={draft.responseDepth} onChange={(responseDepth) => update({ responseDepth })} />
        <Choice label="Tone" options={ENERGY} value={draft.energy} onChange={(energy) => update({ energy })} />
        <Choice label="Humour" options={HUMOUR} value={draft.humour} onChange={(humour) => update({ humour })} />
        <p className={styles.note}>
          Humour is always switched off for results, attendance, fees and anything sensitive, whatever
          you choose here.
        </p>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2>When he speaks first</h2>
          <p>Petros never interrupts an exam, a payment, or a form you are filling in.</p>
        </div>
        <Switch
          label="Let Petros suggest what to do next"
          hint="Suggestions follow your guidance level and deadline urgency. Use the character’s settings for Full, Normal, Minimal, a temporary pause, or the portal tour."
          checked={draft.proactiveCheckIns}
          onChange={(proactiveCheckIns) => update({ proactiveCheckIns })}
        />
        <Switch
          label="Quiet mode"
          hint="Petros stays collapsed until you ask. Ordinary academic notifications keep working."
          checked={draft.quietMode}
          onChange={(quietMode) => update({ quietMode })}
        />
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2>What Petros remembers</h2>
          <p>
            Your conversations, available study time, guidance settings, and the last 80 suggestions you
            started, skipped or postponed. Petros rechecks actual submissions and learning evidence;
            opening a task never counts as completing it. No personality profile is kept.
          </p>
        </div>
        {threads.isLoading ? (
          <p className={styles.note}>Loading your conversations…</p>
        ) : conversations.length === 0 ? (
          <p className={styles.note}>No conversations yet.</p>
        ) : (
          <ul className={styles.threads}>
            {conversations.map((thread) => (
              <li key={thread.id}>
                <span>
                  <strong>{thread.title ?? 'Untitled conversation'}</strong>
                  <small>{new Date(thread.lastActivityAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>
                </span>
                <button
                  type="button"
                  onClick={() => forget.mutate(thread.id)}
                  disabled={forget.isPending}
                  aria-busy={forget.isPending && forget.variables === thread.id}
                  aria-label={`Forget ${thread.title ?? 'this conversation'}`}
                >
                  <Trash2 aria-hidden="true" /> Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={styles.status} role="status">
        {save.isPending ? (
          <>
            <LoaderCircle className={styles.spin} aria-hidden="true" /> Saving…
          </>
        ) : saved ? (
          <>
            <Check aria-hidden="true" /> Saved
          </>
        ) : null}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string; hint: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.choiceRow}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            data-selected={value === option.id || undefined}
            aria-pressed={value === option.id}
          >
            <strong>{option.label}</strong>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.switchRow}>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={styles.switch}
        data-on={checked || undefined}
      >
        <span />
      </button>
    </div>
  );
}
