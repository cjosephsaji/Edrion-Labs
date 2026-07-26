import type { ReactNode } from 'react';
import { StatSlot } from '@/components/ui/primitives';

type StatCardProps = {
  label: string;
  value: ReactNode;
  from: string;
  className?: string;
};

/** @deprecated Use StatSlot directly */
export function StatCard({ label, value, from, className = '' }: StatCardProps) {
  return <StatSlot label={label} value={value} from={from} className={className} />;
}
