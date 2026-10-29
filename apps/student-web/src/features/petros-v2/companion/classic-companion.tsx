'use client';
import { createContext, useEffect, useRef, useState } from 'react';
import { Info, Lightbulb, MessageCircle, X } from 'lucide-react';
import type { M4Snapshot } from '@edrion/schemas';
import type { usePetrosSession } from '../use-petros-session';
import {
  ClassicCloudController,
  classicScope,
  type RequestedClassicHelp,
  type ClassicCloud,
} from './classic-cloud-controller';
import styles from './classic-companion.module.css';
import { ClassicCloudContent } from './classic-cloud-content';
import { ExplanationReader } from '../explanation-reader';
import originalArtwork from '../../../../public/petros/v2/rig/manifest.json';

export const ClassicPresentationContext = createContext({ explain: (_attemptId: string) => {} });
export function ClassicCompanion({
  snapshot: s,
  session,
  typing,
  suspended,
  reducedMotion,
  hidden,
  explanationAttempt,
  compact = false,
}: {
  snapshot: M4Snapshot;
  session: ReturnType<typeof usePetrosSession>;
  typing: boolean;
  suspended: boolean;
  reducedMotion: boolean;
  hidden: boolean;
  explanationAttempt: string | null;
  compact?: boolean;
}) {
  const [controller] = useState(() => new ClassicCloudController());
  const [help, setHelp] = useState<RequestedClassicHelp | null>(null);
  const [message, setMessage] = useState('');
  const [reader, setReader] = useState<string | null>(null);
  const [fading, setFading] = useState<{ cue: ClassicCloud; scope: string; epoch: number } | null>(
    null,
  );
  const [tick, setTick] = useState(0);
  const [cloud, setCloud] = useState<ReturnType<ClassicCloudController['update']>>({
    cloud: null,
    nextAt: undefined,
  });
  const trigger = useRef<HTMLButtonElement>(null);
  const dismissControl = useRef<HTMLButtonElement>(null);
  const flight = useRef(false);
  const scope = classicScope(s);
  useEffect(() => {
    if (!fading) return;
    const id = fading.cue.id;
    const timer = setTimeout(
      () => setFading((current) => (current?.cue.id === id ? null : current)),
      180,
    );
    return () => clearTimeout(timer);
  }, [fading]);
  const shownScope = useRef('');
  const shownEpoch = useRef(-1);
  const recoveredScope = useRef('');
  useEffect(() => {
    setHelp(null);
    setMessage('');
    setReader(null);
  }, [scope]);
  useEffect(() => {
    const storageKey = `petros-classic-displayed:${s.id}`;
    if (recoveredScope.current !== scope) {
      recoveredScope.current = scope;
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
        if (saved?.scope === scope && typeof saved.id === 'string' && saved.id.length <= 512)
          controller.settle(scope, saved.id);
      } catch {
        /* Presentation history is optional. */
      }
    }
    const next = controller.update(
      s,
      {
        interaction: typing ? 'typing' : 'idle',
        visibility: suspended ? 'hidden' : 'visible',
        paused: s.status !== 'active',
        revoked: s.status === 'blocked' || s.status === 'closed',
        reducedMotion,
        pendingOperation: session.busy,
      },
      Date.now(),
      help,
      explanationAttempt,
    );
    if (!next.cloud && document.activeElement === dismissControl.current) trigger.current?.focus();
    setCloud(next);
    if (next.cloud) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ scope, id: next.cloud.id }));
      } catch {
        /* No academic state or message content is stored here. */
      }
    }
    shownScope.current = scope;
    shownEpoch.current = s.epoch;
    if (!next.nextAt) return;
    const timer = setTimeout(
      () => setTick((n) => n + 1),
      Math.max(1, next.nextAt - Date.now() + 1),
    );
    return () => clearTimeout(timer);
  }, [
    s,
    scope,
    typing,
    suspended,
    reducedMotion,
    session.busy,
    help,
    explanationAttempt,
    tick,
    controller,
  ]);
  const dismiss = (button: HTMLButtonElement) => {
    const restore = document.activeElement === button;
    if (!reducedMotion && cloud.cloud) setFading({ cue: cloud.cloud, scope, epoch: s.epoch });
    controller.dismiss();
    setHelp(null);
    setCloud({ cloud: null, nextAt: undefined });
    if (restore) trigger.current?.focus();
  };
  const ask = async () => {
    if (flight.current || session.busy) return;
    // The existing ask handler also admits reviewed-source access during a
    // post-commit teaching checkpoint. Its projection omits ask while participating;
    // the command still revalidates owner, publication, revision and commitment.
    const reviewedTeaching = s.status === 'active' && !!s.teaching && (!s.task || !!s.submission);
    const kind = s.actions.includes('hint')
      ? 'hint'
      : s.actions.includes('ask') || reviewedTeaching
        ? 'ask'
        : null;
    if (!kind) {
      setMessage('Help is unavailable at this stage. Your saved work is still available.');
      return;
    }
    flight.current = true;
    setMessage('Opening the reviewed explanation…');
    try {
      if (session.dirty && (await session.save())?.status !== 'committed') {
        setMessage('Your draft could not be saved. Save it before opening the explanation.');
        return;
      }
      if (s.teaching && (await session.command('interrupt'))?.status !== 'committed') {
        setMessage('The explanation could not be opened. Try again.');
        return;
      }
      const receipt = await session.command(
        kind,
        kind === 'ask'
          ? { text: 'Please bring back the reviewed explanation for this activity.' }
          : {},
      );
      if (receipt?.status !== 'committed') {
        setMessage('The explanation could not be opened. Try again.');
        return;
      }
      const current = session.getSnapshot();
      if (!current || classicScope(current) !== scope || !current.lesson?.explanation) return;
      setHelp({
        id: `help:${crypto.randomUUID()}`,
        scope,
        epoch: current.epoch,
        text: current.lesson.explanation,
        expiresAt: current.companion?.expiresAt ?? Date.now(),
      });
      setMessage('');
    } finally {
      flight.current = false;
    }
  };
  const visible =
    !typing &&
    !suspended &&
    s.status === 'active' &&
    shownScope.current === scope &&
    shownEpoch.current === s.epoch
      ? cloud.cloud
      : null;
  const displayed =
    visible ??
    (!typing &&
    !suspended &&
    !reducedMotion &&
    s.status === 'active' &&
    fading?.scope === scope &&
    fading.epoch === s.epoch
      ? fading.cue
      : null);
  const exiting = !!displayed && displayed !== visible;
  const requested =
    cloud.cloud?.kind === 'thought' &&
    help &&
    shownScope.current === scope &&
    shownEpoch.current === s.epoch &&
    s.status === 'active' &&
    !suspended
      ? cloud.cloud
      : null;
  const longExplanation =
    displayed?.kind === 'thought' &&
    (displayed.text.length > 160 || /\n\s*\n/.test(displayed.text));
  const CloudIcon =
    displayed?.kind === 'thought' ? Lightbulb : displayed?.kind === 'notice' ? Info : MessageCircle;
  return (
    <aside
      className={styles.companion}
      aria-label="Petros companion"
      data-classic-companion
      data-reduced-motion={reducedMotion}
      data-compact={compact}
      data-has-cloud={!!displayed}
    >
      {displayed && (
        <div
          key={displayed.id}
          className={styles.cloud}
          data-cloud-kind={displayed.kind}
          data-cloud-phase={exiting ? 'exit' : 'visible'}
          aria-hidden={exiting || undefined}
        >
          <div className={styles.cloudHeader}>
            <span className={styles.overline}>
              <CloudIcon size={12} strokeWidth={1.75} aria-hidden="true" />
              {displayed.title}
            </span>
            <button
              ref={dismissControl}
              className={styles.close}
              aria-label="Dismiss Petros cloud"
              disabled={exiting}
              tabIndex={exiting ? -1 : undefined}
              onClick={(e) => dismiss(e.currentTarget)}
            >
              <X size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.content} role="status" aria-live="polite" aria-atomic="true">
            {longExplanation ? (
              <p>Your reviewed explanation is ready to read.</p>
            ) : (
              <ClassicCloudContent text={displayed.text} />
            )}
          </div>
          {displayed.kind === 'thought' && (
            <button
              className={styles.read}
              disabled={exiting}
              tabIndex={exiting ? -1 : undefined}
              onClick={() => setReader(displayed.id)}
              aria-haspopup="dialog"
            >
              Read full explanation
            </button>
          )}
          <i className={styles.tail} aria-hidden="true" />
          <i className={styles.bubble} aria-hidden="true" />
        </div>
      )}
      <div className={styles.character}>
        {!hidden && (
          <button
            className={styles.art}
            aria-label="Ask Petros for a hint"
            disabled={session.busy || s.status !== 'active'}
            onClick={() => void ask()}
          >
            <img
              src={originalArtwork.poses.neutral}
              width={384}
              height={512}
              alt="Original Petros"
              draggable={false}
            />
          </button>
        )}
        <button
          ref={trigger}
          className={styles.ask}
          disabled={session.busy || s.status !== 'active'}
          onClick={() => void ask()}
        >
          ✦ Ask Petros
        </button>
      </div>
      {typing && requested && (
        <button
          className={styles.read}
          onClick={() => setReader(requested.id)}
          aria-haspopup="dialog"
        >
          Read full explanation
        </button>
      )}
      {message && (
        <p className={styles.helpStatus} role="status">
          {message}
        </p>
      )}
      {reader && requested?.id === reader && s.lesson && (
        <ExplanationReader text={requested.text} snapshot={s} close={() => setReader(null)} />
      )}
    </aside>
  );
}
