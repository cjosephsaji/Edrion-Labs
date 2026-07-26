'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DEBATE_CONSENT_POLICY_VERSION } from '@/lib/debate-consent';
import { useDebateConsent, useDebateRound } from '@/lib/hooks/debate-lab';
import { PillButton } from '@/components/ui/pill-button';
import { PageHeader } from '@/components/ui/primitives';

const SCOPES = [
  { key: 'record_audio', label: 'Record my speeches', required: true },
  { key: 'store_transcript', label: 'Store transcripts for feedback', required: true },
  { key: 'ai_analysis', label: 'AI analysis and judging', required: true },
  { key: 'human_review', label: 'Optional human review (staff)', required: false },
] as const;

export default function DebateConsentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useDebateRound(params.id);
  const consent = useDebateConsent();
  const [scopes, setScopes] = useState<Record<string, boolean>>({
    record_audio: false,
    store_transcript: false,
    ai_analysis: false,
    human_review: false,
  });

  const toggle = (key: string) => setScopes((s) => ({ ...s, [key]: !s[key] }));

  const submit = async () => {
    await consent.mutateAsync({
      id: params.id,
      body: {
        policyVersion: DEBATE_CONSENT_POLICY_VERSION,
        scopes,
        evidence: { ui: 'student-web-consent-v1' },
      },
    });
    router.push(`/lab/debate/rounds/${params.id}/prep`);
  };

  const motion =
    (data?.debate as { motionText?: string; motion?: string } | undefined)?.motionText ??
    (data?.debate as { motion?: string })?.motion;

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-24">
      <PageHeader title="Before you speak" subtitle={motion ?? 'Debate round'} backHref="/lab/debate/new" />
      <ul className="mt-8 space-y-4">
        {SCOPES.map((s) => (
          <li key={s.key} className="flex items-start gap-3 rounded-[14px] border border-st-bd1 bg-st-card p-4">
            <input type="checkbox" checked={scopes[s.key]} onChange={() => toggle(s.key)} className="mt-1" />
            <div>
              <p className="text-sm font-medium">{s.label}</p>
              {s.required && <p className="text-xs text-st-muted">Required</p>}
            </div>
          </li>
        ))}
      </ul>
      <PillButton className="mt-10 w-full" disabled={consent.isPending} onClick={() => void submit()}>
        I agree — continue
      </PillButton>
    </div>
  );
}
