'use client';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Drawer } from './drawer';

/** One label/value line in a detail panel. `value` may be any node (a badge, an EntityRef, text…). */
export interface DetailField {
  label: string;
  value: ReactNode;
  /** Render across the full width instead of the label/value two-column grid (e.g. long notes). */
  full?: boolean;
}

/** A titled group of fields. */
export interface DetailSection {
  title?: string;
  fields: DetailField[];
}

const isEmpty = (v: ReactNode) => v === null || v === undefined || v === '';

/**
 * Read-only record inspector built on {@link Drawer}. Shows an optional header block (avatar / name
 * / status) followed by grouped label→value sections. This is the portal's answer to "you had to
 * click Edit just to see a record" — every list opens this on row click; Edit stays a separate,
 * explicit action. Purely presentational: the caller maps its row to `header` + `sections`.
 */
export function DetailPanel({
  open,
  onClose,
  title,
  description,
  header,
  sections,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  header?: ReactNode;
  sections: DetailSection[];
  footer?: ReactNode;
}) {
  return (
    <Drawer open={open} onClose={onClose} title={title} description={description} footer={footer}>
      {header && <div className="mb-5">{header}</div>}
      <div className="flex flex-col gap-6">
        {sections.map((section, si) => (
          <section key={section.title ?? si}>
            {section.title && (
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{section.title}</h3>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {section.fields.map((f, fi) => (
                <div key={f.label + fi} className={cn('min-w-0', f.full && 'col-span-2')}>
                  <dt className="text-xs text-text-muted">{f.label}</dt>
                  <dd className="mt-0.5 break-words text-sm text-text-primary">
                    {isEmpty(f.value) ? <span className="text-text-muted">—</span> : f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
