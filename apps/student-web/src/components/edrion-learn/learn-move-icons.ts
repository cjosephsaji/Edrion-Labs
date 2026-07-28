/** Move → skeleton icon (hyperspec 2 §8). Lucide names reserved for future @edrion/ui mapping. */
export const LEARN_MOVE_ICONS: Record<string, string> = {
  direct_explanation: '◈',
  worked_example: '☰',
  retrieval_check: '?',
  prereq_pulse: '∿',
  visual_spawn: '▣',
  synthesis_checkpoint: '✎',
  synthesis: '✎',
  artifact_commit: '✦',
  socratic_probe: '◇',
};

export function learnMoveIcon(moveType: string | null | undefined): string {
  if (!moveType) return LEARN_MOVE_ICONS.direct_explanation!;
  return LEARN_MOVE_ICONS[moveType] ?? LEARN_MOVE_ICONS.direct_explanation!;
}
