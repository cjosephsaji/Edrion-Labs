const toneMap = {
  fresh: 'bg-st-mintBg text-st-success',
  fading: 'bg-st-amberSoft text-st-amber',
  due: 'bg-st-dangerSoft text-st-danger',
} as const;

const labelMap = {
  fresh: 'Fresh',
  fading: 'Fading',
  due: 'Due',
} as const;

export function FreshnessChip({ freshness }: { freshness: 'fresh' | 'fading' | 'due' }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${toneMap[freshness]}`}
    >
      {labelMap[freshness]}
    </span>
  );
}
