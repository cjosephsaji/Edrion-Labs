'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, X } from 'lucide-react';
import type { PetrosBriefing } from '@edrion/schemas';
import { useStudentApi } from '@/lib/api-client';
import { usePetrosCompanionOptional } from './petros-companion-context';
import styles from './petros-briefing-strip.module.css';

/**
 * One deterministic line from Petros, above the day's work.
 *
 * The priority order comes from the API's fixed bands, not from a model, and no AI request
 * is made to render this. It shows the single most pressing thing rather than repeating the
 * priority cards below it.
 */
export function PetrosBriefingStrip({ firstName }: { firstName: string }) {
  const api = useStudentApi();
  const companion = usePetrosCompanionOptional();
  const queryClient = useQueryClient();

  const briefing = useQuery({
    queryKey: ['student', 'petros', 'briefing'],
    queryFn: () => api.get<PetrosBriefing>('/student/petros/companion/briefing'),
    staleTime: 5 * 60_000,
  });

  const dismiss = useMutation({
    mutationFn: (nudgeKey: string) =>
      api.post<{ nudgeKey: string }>('/student/petros/companion/briefing/dismiss', { nudgeKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'petros', 'briefing'] }),
  });

  if (briefing.isLoading || briefing.error || !briefing.data) return null;
  // The student switched proactive help off; honour it silently rather than showing a
  // strip that explains why it is empty.
  if (briefing.data.mutedBy) return null;
  const { headline, items, quiet } = briefing.data;
  const lead = items[0];

  return (
    <aside className={styles.strip} data-quiet={quiet || undefined} aria-label="Petros briefing">
      <span className={styles.mark} aria-hidden="true">
        <Image src="/petros/petros-pointing.png" alt="" width={724} height={760} unoptimized />
      </span>

      <div className={styles.copy}>
        <p className={styles.headline}>
          {quiet ? `Nothing urgent, ${firstName}. Good time to get ahead.` : headline}
        </p>
        {lead ? (
          <p className={styles.lead}>
            <strong>{lead.title}</strong>
            <span>{lead.detail}</span>
          </p>
        ) : null}
      </div>

      <div className={styles.actions}>
        {lead?.href ? (
          <Link href={lead.href} className={styles.open}>
            Open <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
        {companion ? (
          <button
            type="button"
            className={styles.plan}
            onClick={() =>
              companion.openWith(quiet ? 'What could I get ahead on today?' : 'Help me plan today.')
            }
          >
            {quiet ? 'Get ahead' : 'Plan my day'}
          </button>
        ) : null}
      </div>

      {lead ? (
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => dismiss.mutate(`${lead.kind}:${lead.entityId ?? lead.title}`)}
          disabled={dismiss.isPending}
          aria-busy={dismiss.isPending}
          aria-label={`Dismiss ${lead.title}`}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}
