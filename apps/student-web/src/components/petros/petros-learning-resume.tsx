'use client';

import { useEffect, useRef, useState } from 'react';
import { formatApiError, useStudentApi } from '@/lib/api-client';

type LearningContext = {
  status: 'available';
  objectiveStatement: string;
  objective: { id: string; version: number };
  pack: { id: string; version: number };
  currentEvidence: { observedResponses: number; demonstratedApplications: number;
    assistedResponses: number; uncertainResponses: number; declaredExternalAssistanceResponses: number };
};

/** Read current authority only when requested; never treats saved content or self-recall as mastery. */
export function PetrosLearningResume({ artifactId, revision }: { artifactId: string; revision: number }) {
  const api = useStudentApi();
  const identity = `${artifactId}:${revision}`;
  const current = useRef(identity);
  const [context, setContext] = useState<LearningContext | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    current.current = identity;
    setContext(null); setLegacy(false); setLoading(false); setError('');
  }, [identity]);

  const load = async () => {
    const requested = identity;
    setLoading(true); setContext(null); setError(''); setLegacy(false);
    try {
      const value = await api.get<LearningContext | { status: 'legacy' }>(`/student/petros/artifacts/${artifactId}/learning-resume`);
      if (current.current !== requested) return;
      if (value.status === 'legacy') { setLegacy(true); return; }
      const counts = value.currentEvidence;
      if (value.status !== 'available' || !value.objectiveStatement || !value.objective?.version || !value.pack?.version ||
        !counts || !Object.values(counts).filter(item => typeof item === 'number').every(item => Number.isInteger(item) && item >= 0) ||
        !['observedResponses','demonstratedApplications','assistedResponses','uncertainResponses','declaredExternalAssistanceResponses']
          .every(key => typeof counts[key as keyof typeof counts] === 'number'))
        throw new Error('Current learning context is unavailable.');
      setContext(value);
    } catch (caught) {
      if (current.current === requested) setError(formatApiError(caught));
    } finally {
      if (current.current === requested) setLoading(false);
    }
  };

  return <section aria-label="Current learning context">
    <button type="button" disabled={loading} onClick={() => void load()} aria-busy={loading}>
      {loading ? 'Checking learning context…' : error ? 'Retry learning context' : 'View current objective and evidence'}
    </button>
    {error && <p role="status">Learning context is unavailable under current access or versions. {error}</p>}
    {legacy && <p>No reviewed objective evidence is attached to this artifact.</p>}
    {context && <div role="status">
      <p><strong>{context.objectiveStatement}</strong></p>
      <p>Objective version {context.objective.version} · Teaching pack version {context.pack.version}</p>
      <p>{context.currentEvidence.observedResponses} recorded responses · {context.currentEvidence.demonstratedApplications} demonstrated applications</p>
      <p>{context.currentEvidence.assistedResponses} responses with observed Petros help · {context.currentEvidence.uncertainResponses} uncertain responses</p>
      <p>{context.currentEvidence.declaredExternalAssistanceResponses} responses with declared external help. Other external help is unknown.</p>
      <p>Material covered and saved artifacts are not evidence of mastery. Card reviews record your reported recall.</p>
    </div>}
  </section>;
}
