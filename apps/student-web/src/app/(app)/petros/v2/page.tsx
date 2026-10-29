'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStudentApi } from '@/lib/api-client';
import { PetrosAvatar } from '@/components/petros/petros-avatar';
import styles from '@/features/petros-v2/petros-v2.module.css';
type Lesson = {
  intentId: string;
  title: string;
  subject: string;
  objective: string;
  sessionId: string | null;
};
export default function PetrosV2Entry() {
  const api = useStudentApi(),
    router = useRouter(),
    [lessons, setLessons] = useState<Lesson[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void api
      .get<{ lessons: Lesson[] }>('/student/petros/v2/lessons', abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) {
          setLessons(r.lessons);
          setError('');
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('We could not load your lessons. Please try again.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api]);
  async function start(l: Lesson) {
    if (busy) return;
    setBusy(true);
    try {
      const s = l.sessionId
        ? { id: l.sessionId }
        : await api.post<{ id: string }>('/student/petros/v2/sessions', {
            intentId: l.intentId,
            commandId: crypto.randomUUID(),
          });
      router.push(`/petros/session?session=${s.id}`);
    } catch {
      setError('This lesson is not available right now. Your saved work is preserved.');
      setBusy(false);
    }
  }
  const featured = lessons.find((lesson) => lesson.sessionId) ?? lessons[0];
  const others = lessons.filter((lesson) => lesson !== featured);
  return (
    <main className={styles.page} data-studio-entry>
      <header className={styles.topbar}>
        <Link href="/learn">← Your learning</Link>
        <span className={styles.brand}>
          petros<span>LEARNING STUDIO</span>
          <i aria-hidden="true" />
        </span>
        <span className={styles.edrion}>edrion</span>
      </header>
      {process.env.NEXT_PUBLIC_PETROS_M4_DEMO === '1' && (
        <p className={styles.demo}>
          ISOLATED ENGINEERING PREVIEW{' '}
          <span>· Synthetic students & review records · Text first</span>
        </p>
      )}
      <div className={styles.entry}>
        <section className={styles.welcome}>
          <div>
            <p className={styles.eyebrow}>A space for your curiosity</p>
            <h1>
              {featured?.sessionId ? 'Let’s pick up where you left off.' : 'Ready to explore?'}
            </h1>
            <p className={styles.intro}>
              {featured?.sessionId
                ? 'Welcome back. Your saved learning space is ready.'
                : 'Choose a lesson. We’ll work through the ideas together, then it’s your turn.'}
            </p>
          </div>
          <div className={styles.welcomeCompanion}>
            <PetrosAvatar
              pose="neutral"
              animate={false}
              mouthOverlay={false}
              label="Petros, your learning companion"
            />
            <p>
              {featured?.sessionId
                ? 'Ready to continue where we left off?'
                : 'Let’s find something worth exploring.'}
            </p>
            <span>PETROS · LEARNING WITH YOU</span>
          </div>
        </section>
        {loading ? (
          <p role="status">Finding your available lessons…</p>
        ) : featured ? (
          <>
            <section className={styles.featuredLesson} aria-label="Recommended next action">
              <div className={styles.lessonNumber}>
                01<span>{featured.sessionId ? 'PICK UP HERE' : 'START HERE'}</span>
              </div>
              <div>
                <p className={styles.eyebrow}>{featured.subject}</p>
                <h2>{featured.title}</h2>
                <p>{featured.objective}</p>
                {featured.sessionId && (
                  <small>Saved session available · continue to your checkpoint</small>
                )}
              </div>
              <button
                className={styles.primary}
                onClick={() => void start(featured)}
                disabled={busy}
              >
                {busy
                  ? 'Opening your studio…'
                  : featured.sessionId
                    ? 'Continue learning'
                    : 'Start learning'}{' '}
                <span aria-hidden="true">↗</span>
              </button>
            </section>
            {others.length > 0 && (
              <section className={styles.opportunities} aria-labelledby="opportunities-title">
                <div className={styles.sectionTitle}>
                  <h2 id="opportunities-title">Another direction to explore</h2>
                  <span>{others.length} available</span>
                </div>
                {others.map((lesson, i) => (
                  <div className={styles.lesson} key={lesson.intentId}>
                    <span className={styles.rowNumber}>{String(i + 2).padStart(2, '0')}</span>
                    <div>
                      <p className={styles.eyebrow}>{lesson.subject}</p>
                      <h3>{lesson.title}</h3>
                      <p>{lesson.objective}</p>
                    </div>
                    <button
                      onClick={() => void start(lesson)}
                      disabled={busy}
                      aria-label={`${lesson.sessionId ? 'Continue' : 'Explore'} ${lesson.title}`}
                    >
                      {lesson.sessionId ? 'Continue' : 'Explore'} ↗
                    </button>
                  </div>
                ))}
              </section>
            )}
            <p className={styles.entryNote}>
              From your teacher’s released lessons. Pause whenever you need — saved work will be
              here.
            </p>
          </>
        ) : !error ? (
          <section className={styles.empty}>
            <h2>Your next idea is on its way.</h2>
            <p>Your teacher’s released lessons will appear here when they’re ready for you.</p>
          </section>
        ) : null}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
