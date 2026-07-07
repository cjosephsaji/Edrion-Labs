import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

const eyebrowColors = {
  faint: 'text-st-faint',
  accent: 'text-st-accent',
  success: 'text-st-success',
  gold: 'text-st-gold',
  amber: 'text-st-amber',
  violet: 'text-st-violet',
  blue: 'text-st-blue',
  inverse: 'text-white/70',
} as const;

export function Eyebrow({
  children,
  color = 'faint',
  className = '',
}: {
  children: ReactNode;
  color?: keyof typeof eyebrowColors;
  className?: string;
}) {
  return (
    <p
      className={`font-mono-ui text-[10px] font-semibold tracking-[0.1em] ${eyebrowColors[color]} ${className}`}
    >
      {children}
    </p>
  );
}

const iconChipTones = {
  accent: 'bg-st-accentSoft text-st-accentDeep',
  success: 'bg-st-mintBg text-st-success',
  gold: 'bg-st-goldSoftBg text-st-goldInk',
  amber: 'bg-st-amberSoft text-st-amberInk',
  violet: 'bg-st-violetSoft text-st-violet',
  blue: 'bg-st-blueSoft text-st-blue',
  danger: 'bg-st-dangerSoft text-st-danger',
} as const;

export function IconChip({
  icon: Icon,
  tone = 'accent',
  className = '',
}: {
  icon: LucideIcon;
  tone?: keyof typeof iconChipTones;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] ${iconChipTones[tone]} ${className}`}
    >
      <Icon size={13} strokeWidth={2} aria-hidden />
    </span>
  );
}

export function PillChip({
  children,
  variant = 'default',
  onClick,
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'primary';
  onClick?: () => void;
  className?: string;
}) {
  const base =
    variant === 'primary'
      ? 'border-st-accentBd bg-st-accentSoft text-st-accentDeep hover:bg-st-accentSoft2'
      : 'border-st-bd2 bg-st-card text-st-inkSoft hover:border-st-accent hover:text-st-accentDeep';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-[15px] py-2 text-[12.5px] font-semibold transition ${base} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function PageTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={`font-display text-[28px] font-semibold tracking-[-0.01em] text-st-ink md:text-[34px] ${className}`}
    >
      {children}
    </h1>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel = 'Back',
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-block text-sm font-semibold text-st-accent hover:text-st-accentDeep"
          >
            ← {backLabel}
          </Link>
        )}
        {eyebrow}
        <PageTitle className={eyebrow ? 'mt-2' : ''}>{title}</PageTitle>
        {subtitle && <p className="mt-2 text-sm text-st-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatSlot({
  label,
  value,
  unit,
  from,
  className = '',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  from: string;
  className?: string;
}) {
  return (
    <div className={`rounded-[15px] border border-st-bd1 bg-st-card p-4 ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold text-st-ink">{value}</span>
        {unit && <span className="text-sm text-st-muted">{unit}</span>}
      </div>
      <div className="mt-3 border-t border-st-divider pt-2">
        <p className="font-mono-ui text-[10px] text-st-faint">FROM — {from}</p>
      </div>
    </div>
  );
}

export function KbdHint({ children = '↵ Enter' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono-ui text-[10.5px] font-medium text-st-faint2">
      <kbd className="rounded-[5px] border border-st-bd1 bg-st-sidebar px-1.5 py-0.5">{children}</kbd>
    </span>
  );
}

export function ProgressSegments({
  total,
  done,
  className = '',
}: {
  total: number;
  done: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-[5px] w-[34px] rounded-[3px] ${
            i < done ? 'bg-[#7FBA9E]' : 'bg-[rgba(246,243,233,0.22)]'
          }`}
        />
      ))}
    </div>
  );
}

export function PetrosMark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-mono-ui text-[11px] font-semibold text-st-amber ${className}`} aria-hidden>
      ✦
    </span>
  );
}
