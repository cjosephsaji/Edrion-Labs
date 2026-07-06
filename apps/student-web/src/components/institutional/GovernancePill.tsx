const toneMap: Record<string, string> = {
  neutral: 'bg-st-surface2 text-st-muted',
  info: 'bg-st-accentSoft text-st-accentDeep',
  success: 'bg-st-greenSoft text-st-green',
  warning: 'bg-st-amberSoft text-st-amber',
  danger: 'bg-st-redSoft text-st-red',
};

export function GovernancePill({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${toneMap[tone] ?? toneMap.neutral}`}>
      {label}
    </span>
  );
}
