import type { LearnSessionDto } from '@edrion/schemas';

const stepLabels: Record<string, string> = {
  understand: 'Understand',
  see_it_visually: 'See it',
  worked_example: 'Example',
  check_understanding: 'Check',
  solve_yourself: 'Practice',
  wrap_up: 'Wrap up',
};

export function SpineRail({ spine }: { spine: LearnSessionDto['spine'] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin" aria-label="Session progress">
      {spine.map((entry) => (
        <div
          key={entry.step}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            entry.status === 'current'
              ? 'bg-st-accent text-white'
              : entry.status === 'done'
                ? 'bg-st-accentSoft text-st-accentDeep'
                : 'bg-st-surface2 text-st-muted'
          }`}
        >
          {stepLabels[entry.step] ?? entry.label}
        </div>
      ))}
    </nav>
  );
}
