'use client';
import type { GlossaryContent } from '@edrion/schemas';
import { Card } from '@/components/ui/card';

export function GlossaryPanel({ content, fromLabel }: { content: GlossaryContent; fromLabel: string }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">KEY-TERMS GLOSSARY</h2>
        <span className="ml-auto text-xs font-medium text-st-violet">✦ AI-generated</span>
      </div>
      <p className="mt-1 text-xs text-st-muted">Made from: {fromLabel.replace(/^From:\s*/i, '')}</p>
      <div className="mt-3 space-y-2">
        {content.entries.map((entry) => (
          <Card key={entry.term}>
            <p className="font-semibold text-st-ink">{entry.term}</p>
            <p className="mt-1 text-sm text-st-muted">{entry.definition}</p>
            <p className="mt-2 font-mono-ui text-[10px] text-st-faint">FROM — {entry.sourceLocation}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
