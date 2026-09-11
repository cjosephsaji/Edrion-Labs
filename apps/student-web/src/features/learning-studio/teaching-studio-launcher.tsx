'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, Sparkles } from 'lucide-react';
import styles from './teaching-studio-launcher.module.css';

const IntegralsTeachingStudio = dynamic(
  () => import('./integrals-teaching-studio').then((module) => module.IntegralsTeachingStudio),
  { ssr: false },
);

export function TeachingStudioLauncher() {
  const [open, setOpen] = useState(false);
  if (open) return <IntegralsTeachingStudio />;
  return (
    <section className={styles.launcher} aria-labelledby="teaching-proof-title">
      <div className={styles.visual} aria-hidden="true">
        <span>∫</span><i>x³</i><b>+ C</b>
      </div>
      <div>
        <span className={styles.kicker}><Sparkles /> Interactive lesson</span>
        <h2 id="teaching-proof-title">See Petros teach, not just answer.</h2>
        <p>Walk through an animated calculus idea with exact pointing, quiet study, questions, exploration, and a fresh problem.</p>
      </div>
      <button type="button" onClick={() => setOpen(true)}>Open teaching studio <ArrowRight /></button>
    </section>
  );
}
