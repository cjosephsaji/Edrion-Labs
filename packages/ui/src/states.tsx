import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { cn } from './cn';

function Shell({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border ' +
          'bg-surface px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background-secondary text-text-muted">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <p className="text-md font-semibold text-text-primary">{title}</p>
        {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return <Shell icon={Inbox} {...props} />;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return <Shell icon={AlertTriangle} title={title} description={description} action={action} />;
}

export function PermissionDenied({
  description = 'You do not have permission to view this. Ask a Platform Owner if you need access.',
}: {
  description?: string;
}) {
  return <Shell icon={Lock} title="Permission required" description={description} />;
}
