'use client';

import type { VisualArchetype } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { Eyebrow, PetrosMark, PillChip } from '@/components/ui/primitives';

const ARCHETYPE_LABELS: Record<VisualArchetype, string> = {
  mind_map: 'Mind map',
  flowchart: 'Flowchart',
  cycle: 'Cycle',
  timeline: 'Timeline',
  hierarchy: 'Hierarchy',
  comparison: 'Comparison',
};

const ARCHETYPES = Object.keys(ARCHETYPE_LABELS) as VisualArchetype[];

export type ProposalView = {
  proposal_id: string;
  title: string;
  archetype: VisualArchetype;
  estimated_nodes: { min: number; max: number };
  rationale: string;
  source_label?: string;
  expires_at: string;
};

type Props = {
  proposal: ProposalView;
  archetypeOverride?: VisualArchetype;
  onArchetypeChange: (archetype: VisualArchetype) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirming?: boolean;
  showShapePicker?: boolean;
  onToggleShapePicker?: () => void;
};

export function GenerationProposalCard({
  proposal,
  archetypeOverride,
  onArchetypeChange,
  onConfirm,
  onCancel,
  confirming,
  showShapePicker,
  onToggleShapePicker,
}: Props) {
  const archetype = archetypeOverride ?? proposal.archetype;

  return (
    <Card className="mt-6" eyebrow="PETROS SUGGESTS" noPadding>
      <div className="space-y-4 p-5">
        <div>
          <Eyebrow color="violet">PETROS SUGGESTS</Eyebrow>
          <p className="mt-2 font-display text-xl font-semibold text-st-ink">{proposal.title}</p>
          <p className="mt-1 text-sm text-st-muted">
            {ARCHETYPE_LABELS[archetype]} · About {proposal.estimated_nodes.min}–{proposal.estimated_nodes.max}{' '}
            ideas
          </p>
          {proposal.source_label ? (
            <p className="mt-2 text-xs text-st-faint">From {proposal.source_label}</p>
          ) : null}
          <p className="mt-3 text-sm text-st-inkSoft">{proposal.rationale}</p>
        </div>

        {showShapePicker ? (
          <div className="flex flex-wrap gap-2">
            {ARCHETYPES.map((key) => (
              <PillChip
                key={key}
                variant={archetype === key ? 'primary' : 'default'}
                onClick={() => onArchetypeChange(key)}
              >
                {ARCHETYPE_LABELS[key]}
              </PillChip>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PillButton onClick={() => void onConfirm()} disabled={confirming}>
            Make this canvas <PetrosMark className="ml-1" />
          </PillButton>
          <PillButton variant="soft" onClick={onToggleShapePicker} disabled={confirming}>
            Change the shape
          </PillButton>
          <PillButton variant="soft" onClick={onCancel} disabled={confirming}>
            Back
          </PillButton>
        </div>
      </div>
    </Card>
  );
}
