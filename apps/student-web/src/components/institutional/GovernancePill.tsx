const toneMap: Record<string, string> = {
  neutral: 'bg-st-surface2 text-st-muted border-st-bd2',
  info: 'bg-st-accentSoft text-st-accentDeep border-st-accentBd',
  success: 'bg-st-mintBg text-st-success border-st-accentBd',
  warning: 'bg-st-amberSoft text-st-amberInk border-st-amberBd',
  danger: 'bg-st-dangerSoft text-st-danger border-st-danger/30',
};

export function GovernancePill({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 font-mono-ui text-[10px] font-semibold tracking-wide ${toneMap[tone] ?? toneMap.neutral}`}
    >
      {label}
    </span>
  );
}
