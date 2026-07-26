import { useCallback, useEffect, useState } from 'react';
import { useStudentClient } from '@/lib/student-client';

export type OrchestratorBlock = {
  id: string;
  sequence: number;
  blockType: string;
  content: Record<string, unknown>;
  moveType: string | null;
};

export type OrchestratorSessionDto = {
  id: string;
  topicKey: string;
  orchestratorStatus: string;
  blocks: OrchestratorBlock[];
};

export function useOrchestratorSession(sessionId: string, enabled: boolean) {
  const client = useStudentClient();
  const [session, setSession] = useState<OrchestratorSessionDto | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await client.get<OrchestratorSessionDto>(`/edrion-learn/sessions/${sessionId}`);
      setSession(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [client, enabled, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const endSession = useCallback(async () => {
    await client.post(`/edrion-learn/sessions/${sessionId}/end`, {});
    await refresh();
  }, [client, refresh, sessionId]);

  return { session, loading, error, refresh, endSession };
}
