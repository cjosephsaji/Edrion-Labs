'use client';
import Link from 'next/link';
import { artifactHref } from './SourceCard';

export function AlreadyMade({
  artifacts,
}: {
  artifacts: Array<{ id: string; kind: string; title: string; fromLabel: string }>;
}) {
  if (!artifacts.length) {
    return (
      <p className="text-sm text-st-muted">Nothing made from this yet — try an action above.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {artifacts.map((a) => (
        <li key={`${a.kind}-${a.id}`}>
          <Link
            href={artifactHref(a.kind, a.id)}
            className="block min-h-[44px] rounded-[12px] border border-st-bd1 bg-st-card px-3 py-2 transition hover:border-st-accent/40"
          >
            <p className="text-[10px] font-semibold text-st-amber">✦ {a.kind.replace(/_/g, ' ')}</p>
            <p className="text-sm font-medium text-st-ink">{a.title}</p>
            <p className="text-xs text-st-muted">{a.fromLabel}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
