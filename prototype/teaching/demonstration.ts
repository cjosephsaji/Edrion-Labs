import type { VisualState } from './types';
/** Manual, prepared presentation steps. Academic answer history is never changed here. */
export function demonstrate(v: VisualState, step: number): VisualState {
  switch (v.kind) {
    case 'topic':
      return v;
    case 'tree':
      return {
        ...v,
        reveal: step,
        pruneStep: step >= 4 ? 6 : 0,
        selected:
          step === 0
            ? 'root'
            : step === 2
              ? 'branch-0'
              : step === 3
                ? 'branch-0'
                : v.selected,
      };
    case 'kb':
      return {
        ...v,
        derived:
          step >= 3 && v.facts.includes('Bird(Tweety)')
            ? [...new Set([...v.derived, 'HasWings(Tweety)'])]
            : v.derived,
        query: step >= 4 ? 'HasWings(Tweety)' : v.query,
        direction: step === 5 ? 'backward' : v.direction,
      };
    case 'hazards':
      return {
        ...v,
        selected: ['', 'edge', 'ladder', 'power', 'edge', ''][step] ?? '',
        safer: step === 4 ? true : v.safer,
      };
    case 'river':
      return {
        ...v,
        selected: ['', 'sewage', 'runoff', 'waste', 'oil', ''][step] ?? '',
        controls:
          step === 4 ? [...new Set([...v.controls, 'oil'])] : v.controls,
      };
    case 'network':
      return { ...v, input: 2, weight: step >= 5 ? 1.5 : 0.5 };
    case 'clocks':
      return { ...v, earthYears: 10, speed: step >= 4 ? 0.8 : 0.6 };
  }
}
