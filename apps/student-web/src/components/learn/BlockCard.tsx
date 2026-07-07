import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

const toneStyles = {
  accent: { icon: 'accent' as const, className: '' },
  blue: { icon: 'blue' as const, className: '' },
  gold: { icon: 'gold' as const, className: 'border-st-goldBd bg-st-card' },
  violet: { icon: 'violet' as const, className: '' },
  amber: { icon: 'amber' as const, className: 'border-st-amberBd bg-st-amberSoft/40' },
  checkpoint: {
    icon: 'success' as const,
    className: 'border-st-accentDeep/40 bg-st-mintBg',
  },
  wrap: { icon: 'success' as const, className: 'border-st-accentBd bg-st-accentSoft/30' },
} as const;

export function BlockCard({
  eyebrow,
  tone = 'accent',
  icon,
  children,
  className = '',
  footer,
}: {
  eyebrow: string;
  tone?: keyof typeof toneStyles;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  const style = toneStyles[tone];
  return (
    <Card
      className={`animate-st-block-in ${style.className} ${className}`}
      eyebrow={eyebrow}
      icon={icon}
      iconTone={style.icon}
      noPadding
    >
      <div className="p-5">{children}</div>
      {footer && (
        <div className="border-t border-dashed border-st-bd2 px-5 py-3 text-xs text-st-faint">
          {footer}
        </div>
      )}
    </Card>
  );
}
