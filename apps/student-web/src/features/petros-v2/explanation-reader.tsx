'use client';
import type { M4Snapshot } from '@edrion/schemas';
import { StudioDialog } from './studio-dialog';
import { ClassicCloudContent } from './companion/classic-cloud-content';
import { TeachingSources } from './teaching-support';
import styles from './classic-studio.module.css';

/** A second view of already admitted content. Opening it issues no assistance command. */
export function ExplanationReader({
  text,
  snapshot,
  close,
}: {
  text: string;
  snapshot: M4Snapshot;
  close: () => void;
}) {
  return (
    <StudioDialog title="Full reviewed explanation" close={close}>
      <article className={styles.reader}>
        <p className={styles.context}>Reviewed source</p>
        <h3>{snapshot.lesson?.title}</h3>
        <ClassicCloudContent text={text} />
        <footer>
          <TeachingSources snapshot={snapshot} />
        </footer>
      </article>
    </StudioDialog>
  );
}
