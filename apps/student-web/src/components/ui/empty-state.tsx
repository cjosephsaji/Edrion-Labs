import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="mt-8 text-center">
      {icon && <p className="text-4xl">{icon}</p>}
      <p className={`font-display text-lg font-semibold text-st-ink ${icon ? 'mt-3' : ''}`}>{title}</p>
      {description && <p className="mt-2 text-sm text-st-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}
