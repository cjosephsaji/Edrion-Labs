'use client';
import { useState, type ReactNode } from 'react';
import { StudioDialog } from './studio-dialog';
import styles from './petros-v2.module.css';
export function TextAlternative({
  children,
  title = 'Plain text alternative',
  primary = false,
  onOpen,
}: {
  children: ReactNode;
  title?: string;
  primary?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (primary)
    return (
      <section aria-label={title} className={styles.reader}>
        {children}
      </section>
    );
  return (
    <>
      <button
        className={styles.readerButton}
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        {title}
      </button>
      {open && (
        <StudioDialog title={title} close={() => setOpen(false)}>
          <div className={styles.reader}>{children}</div>
        </StudioDialog>
      )}
    </>
  );
}
