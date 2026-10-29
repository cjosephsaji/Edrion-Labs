'use client';
import { LearningCard } from './learning-format';
import type { LearningUIFamily } from '@edrion/schemas';
import styles from './learning-format.module.css';
const examples: {
  family: LearningUIFamily;
  title: string;
  description: string;
  role: string;
}[] = [
  {
    family: 'reading',
    title: 'Read and explain',
    description:
      'Source passages, a clear purpose, and comparisons drawn from the supplied material.',
    role: 'reading-preview',
  },
  {
    family: 'equation',
    title: 'Calculate and reason',
    description: 'Worked quantities, visual models, units, and a separate saved answer.',
    role: 'method-preview',
  },
  {
    family: 'relationships',
    title: 'Build connections',
    description:
      'A shared relationship board with explicit arrow directions and editable reasoning.',
    role: 'relationship-preview',
  },
  {
    family: 'relationships',
    title: 'Claims and evidence',
    description:
      'Inspect a passage, connect evidence to a claim, and explain the warrant. Interpretation remains open to review.',
    role: 'argument-preview',
  },
  {
    family: 'graph',
    title: 'Graphs and comparisons',
    description:
      'Inspect graph points, compare table rows, and read the same data in an accessible table.',
    role: 'graph-preview',
  },
  {
    family: 'process',
    title: 'Processes and code traces',
    description:
      'A step sequence with recorded state, clear navigation, and an equivalent text view.',
    role: 'process-preview',
  },
  {
    family: 'experiment',
    title: 'Predict, change, explain',
    description:
      'Make a prediction, adjust labeled inputs, and compare a checked observation with your reasoning.',
    role: 'experiment-preview',
  },
];
export function LearningFormatsGallery() {
  return (
    <main className={styles.gallery}>
      <p className={styles.hint}>
        Isolated engineering preview · synthetic content and review records
      </p>
      <h1>Edrion Labs Intelligent UI</h1>
      <p>
        One learning design, automatically composed from the source and activity
        structure.
      </p>
      <div className={styles.galleryGrid}>
        {examples.map((example) => (
          <LearningCard family={example.family} title={example.title} key={example.role}>
            <p className={styles.hint}>{example.description}</p>
            <a href={`http://127.0.0.1:4943/demo/${example.role}?fresh=1`}>
              Open this learning format →
            </a>
          </LearningCard>
        ))}
      </div>
      <p className={styles.hint}>
        These links open the real isolated learning workflow with a sample state ready to
        inspect. Explore one format at a time; each link signs into its own synthetic
        learner.
      </p>
    </main>
  );
}
