'use client';

import { useState } from 'react';
import { Button, Card } from '@edrion/ui';
import { useAcademicContext } from '@/lib/academic-context';
import { useGradingSchemes, useTermRecomputeMutations } from '@/lib/grading';
import { formatPortalError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';

export function TermRecomputeProposeCard() {
  const { can } = usePermissions();
  const { termId } = useAcademicContext();
  const schemes = useGradingSchemes();
  const { propose } = useTermRecomputeMutations();
  const [schemeId, setSchemeId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const scheme = (schemes.data ?? []).find((s) => s.id === schemeId);

  if (!can('academics.manage')) return null;

  async function submit() {
    if (!termId || !scheme) {
      setError('Select an academic term (topbar) and scheme.');
      return;
    }
    setError(null);
    setOk(false);
    try {
      await propose.mutateAsync({
        term_id: termId,
        scheme_id: scheme.id,
        scheme_version: scheme.version,
        reason,
      });
      setOk(true);
      setReason('');
    } catch (err) {
      setError(formatPortalError(err));
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">Request term recompute (§4.4)</h2>
      <p className="text-xs text-text-muted">After a term scheme is stamped, changing it requires a second approver.</p>
      <select className="w-full rounded-lg border px-2 py-2 text-sm" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
        <option value="">Select scheme version</option>
        {(schemes.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} (v{s.version})</option>)}
      </select>
      <textarea className="w-full rounded-lg border p-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (min 10 chars)" rows={3} />
      <Button type="button" size="sm" onClick={submit} disabled={propose.isPending || reason.trim().length < 10}>Submit for approval</Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">Submitted — awaiting registrar approval.</p> : null}
    </Card>
  );
}
