'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Pause,
  Play,
  BookOpen,
  MessageCircle,
  SlidersHorizontal,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import { learningUIFor, type M4Snapshot } from '@edrion/schemas';
import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { usePetrosSession } from './use-petros-session';
import { useStudioExperience } from './use-studio-experience';
import { TeachingCanvas } from './canvas/session-teaching-canvas';
import { AssessmentPanel } from './assessment-panel';
import { LearningStage, TextLearningStage } from './learning-stage';
import { StudioDialog } from './studio-dialog';
import { studioExcerpt } from './studio-presentation';
import feedbackStyles from './feedback.module.css';
import { FeedbackBadge } from './feedback';
import { feedbackSummary } from './feedback-state';
import { DemoInformation, TeachingSources } from './teaching-support';
import styles from './petros-v2.module.css';
import classicStyles from './classic-studio.module.css';
import { ClassicCompanion, ClassicPresentationContext } from './companion/classic-companion';
import {
  ClassicLessonLayout,
  LessonHeading,
  LearningStageIndicator,
  LearningFeedback,
} from './classic-learning';

type Session = ReturnType<typeof usePetrosSession>;
function Studio({ session, snapshot: s }: { session: Session; snapshot: M4Snapshot }) {
  const router = useRouter();
  const learningUI = learningUIFor(s);
  const [editingWork, setEditingWork] = useState(false);
  const [manipulating, setManipulating] = useState(false);
  const [inspectingWork, setInspectingWork] = useState(false);
  const [explanationAttempt, setExplanationAttempt] = useState<string | null>(null);
  const classicVM = !!s.canvas?.elements.some((element) => element.kind === 'allocation');
  const [panel, setPanel] = useState<'ask' | 'source' | 'preferences' | 'demo' | null>(null),
    [question, setQuestion] = useState(''),
    [reply, setReply] = useState<string | null>(null);
  const experience = useStudioExperience(s, panel === 'ask');
  const { controller, state } = experience;
  const teaching = s.status === 'active' && (!s.task || !!s.submission) && !!s.lesson;
  const open = async (name: typeof panel) => {
    controller?.interrupt();
    if (s.teaching && s.status === 'active') {
      const receipt = await session.command('interrupt');
      if (receipt?.status !== 'committed') return;
    }
    if (name === 'ask') {
      setReply(null);
      if (s.actions.includes('ask') && !s.teaching) {
        const receipt = await session.command('interrupt');
        if (receipt?.status !== 'committed') return;
      }
    }
    setPanel(name);
  };
  const exit = async () => {
    controller?.interrupt();
    const receipt = await session.leave();
    if (receipt?.status === 'committed') router.push('/petros/v2');
  };
  const ask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!s.actions.includes('ask') || (s.task && !s.submission) || !question.trim()) return;
    const target = s.lesson ? studioExcerpt(s.lesson, state?.selectedId)?.reference : undefined;
    const receipt = await session.command('ask', {
      text: question,
      ...(target ? { target } : {}),
    });
    if (receipt?.status === 'committed')
      setReply(
        'Here is the reviewed wording. This is a source reread, not a generated answer to your question.',
      );
  };
  const phase = s.submission ? 2 : s.task ? 1 : 0;
  const selectedExcerpt = state?.canvas.elements.find(
    (element) => element.id === state.selectedId && element.kind === 'text',
  );
  return (
    <main
      className={`${styles.page} ${feedbackStyles.scope} ${classicStyles.page}`}
      data-studio
      data-learning-ui={learningUI.version}
      data-learning-family={learningUI.family}
      data-action-engine={!!s.teaching || s.task?.responseKind === 'canvas_snapshot'}
      data-text-only={experience.textOnly}
      data-reduced-motion={experience.reducedMotion}
      onFocusCapture={(event) =>
        setEditingWork(
          event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement,
        )
      }
      onBlurCapture={(event) =>
        setEditingWork(
          event.relatedTarget instanceof HTMLInputElement ||
            event.relatedTarget instanceof HTMLTextAreaElement ||
            event.relatedTarget instanceof HTMLSelectElement,
        )
      }
      onPointerDownCapture={(event) => {
        if (
          (event.target as HTMLElement).closest(
            '[data-resource-count], [draggable="true"], [data-diagram-editor]',
          )
        )
          setManipulating(true);
      }}
      onPointerUpCapture={() => setManipulating(false)}
      onPointerCancelCapture={() => setManipulating(false)}
    >
      <a className={styles.skip} href="#learning-stage">
        Skip to your learning stage
      </a>
      <header className={styles.topbar}>
        <button
          onClick={() => void exit()}
          disabled={session.busy || session.hasUnconfirmedSubmission}
        >
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Your lessons</span>
        </button>
        <button
          onClick={() => void exit()}
          disabled={session.busy || session.hasUnconfirmedSubmission}
          className={styles.brand}
          aria-label="Petros learning studio"
        >
          petros<span>LEARNING STUDIO</span>
          <i aria-hidden="true" />
        </button>
        <div className={styles.topActions}>
          <button
            disabled={session.busy}
            aria-label="Learning preferences"
            onClick={() => void open('preferences')}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
          </button>
          {s.status === 'active' && (
            <button
              onClick={() => {
                controller?.interrupt();
                void session.pause();
              }}
              disabled={session.busy || session.hasUnconfirmedSubmission}
            >
              <Pause size={15} aria-hidden="true" />
              <span>Pause lesson</span>
            </button>
          )}
        </div>
      </header>
      {process.env.NEXT_PUBLIC_PETROS_M4_DEMO === '1' && (
        <div className={styles.demo}>
          <span>
            <strong>Demo preview</strong> · Sample content and simulated reviews
          </span>
          <button onClick={() => void open('demo')} aria-haspopup="dialog">
            <Info size={14} aria-hidden="true" /> About this demo
          </button>
        </div>
      )}
      <div className={`${styles.studio} ${classicStyles.studio}`}>
        <ClassicPresentationContext.Provider value={{ explain: setExplanationAttempt }}>
          <ClassicLessonLayout
            stage={s.status === 'active' ? phase : s.status}
            companion={
              <>
                <ClassicCompanion
                  snapshot={s}
                  session={session}
                  typing={editingWork || manipulating}
                  suspended={
                    experience.pageHidden ||
                    !!panel ||
                    inspectingWork ||
                    session.hasUnconfirmedSubmission
                  }
                  reducedMotion={experience.reducedMotion}
                  hidden={experience.hidden || experience.textOnly}
                  compact={experience.compact}
                  explanationAttempt={explanationAttempt}
                />
                {s.submission && !s.teaching && (
                  <FeedbackBadge
                    state={feedbackSummary(s).state}
                    label={feedbackSummary(s).label}
                  />
                )}
              </>
            }
          >
            <LessonHeading
              context={s.lesson?.subject}
              title={
                classicVM
                  ? 'How many virtual machines fit?'
                  : (s.lesson?.title ?? 'Your learning session')
              }
              objective={s.lesson?.objective.label}
            />
            {!classicVM && (
              <LearningStageIndicator
                labels={['Explore', 'Your turn', 'Reflect']}
                current={
                  s.teaching
                    ? s.teaching.status === 'presenting'
                      ? 0
                      : s.teaching.status === 'participating'
                        ? 1
                        : 2
                    : phase
                }
              />
            )}
            {s.status === 'blocked' ? (
              <div className={styles.pause}>
                <BookOpen size={30} aria-hidden="true" />
                <h2>This lesson isn’t available right now.</h2>
                <p>{s.message}</p>
                <p>Your committed work is preserved. Further learning actions are unavailable.</p>
                <Link href="/petros/v2">Back to your lessons →</Link>
              </div>
            ) : s.status === 'paused' ? (
              <section className={styles.pause}>
                <span className={styles.pauseGlyph}>
                  <Pause size={26} />
                </span>
                <p className={styles.eyebrow}>A pause, not a reset</p>
                <h2>Take your time.</h2>
                <p>Your saved work and current task are ready when you are.</p>
                <button
                  className={styles.primary}
                  onClick={() => void session.command('resume')}
                  disabled={session.busy}
                >
                  <Play size={16} aria-hidden="true" />
                  Continue learning
                </button>
              </section>
            ) : s.status === 'closed' ? (
              <section className={styles.pause}>
                <h2>Your session is closed.</h2>
                <p>Your submitted work is preserved in this saved session.</p>
                <Link href="/petros/v2">Find your next lesson →</Link>
              </section>
            ) : s.teaching ? (
              <TeachingCanvas
                snapshot={s}
                session={session}
                textOnly={experience.textOnly}
                reducedMotion={experience.reducedMotion}
                onSources={() => void open('source')}
                onInspectionChange={setInspectingWork}
                classicVM={classicVM}
              />
            ) : s.task ? (
              <>
                {s.task.responseKind === 'canvas_snapshot' && (
                  <TeachingCanvas
                    snapshot={s}
                    session={session}
                    textOnly={experience.textOnly}
                    reducedMotion={experience.reducedMotion}
                    onSources={() => void open('source')}
                    onInspectionChange={setInspectingWork}
                    classicVM={classicVM}
                  />
                )}
                <AssessmentPanel
                  snapshot={s}
                  busy={session.busy}
                  unconfirmed={session.hasUnconfirmedSubmission}
                  draft={session.draft}
                  onDraft={session.changeDraft}
                  onSave={session.save}
                  onSubmit={(response) => {
                    controller?.interrupt();
                    return session.submit(response);
                  }}
                />
                {s.actions.includes('teach') && (
                  <div className={styles.actions} style={{ padding: '12px 18px 18px' }}>
                    <button
                      className={styles.primary}
                      disabled={session.busy}
                      onClick={() => void session.command('teach')}
                    >
                      Work on this with Petros
                    </button>
                  </div>
                )}
              </>
            ) : controller && state ? (
              <LearningStage
                ui={learningUI}
                lesson={s.lesson!}
                controller={controller}
                state={state}
                textOnly={experience.textOnly}
                busy={session.busy}
                canParticipate={s.actions.includes('next')}
                next={() => {
                  controller.interrupt();
                  void session.command('next');
                }}
                ask={() => void open('ask')}
              />
            ) : s.lesson ? (
              <TextLearningStage
                ui={learningUI}
                lesson={s.lesson}
                next={() => void session.command('next')}
                busy={session.busy}
                canParticipate={s.actions.includes('next')}
              />
            ) : null}
            {s.canvas &&
              s.task &&
              s.canvas.elements.length > 0 &&
              s.status === 'active' &&
              !s.submission &&
              !s.teaching &&
              s.task?.responseKind !== 'canvas_snapshot' && (
                <details className={styles.canvas} aria-label="Saved learning workspace">
                  <summary>
                    Working notes <span>Optional · saved with this session</span>
                  </summary>
                  {s.canvas.elements
                    .filter((e) => e.kind === 'text' || e.kind === 'node')
                    .map((e) => (
                      <label className={styles.field} key={`${e.id}:${e.version}`}>
                        {e.label}
                        <input
                          defaultValue={'text' in e ? e.text : ''}
                          disabled={
                            !s.canvas!.invitation?.editableIds.includes(e.id) || session.busy
                          }
                          maxLength={120}
                          onBlur={(event) => {
                            if ('text' in e && event.target.value !== e.text)
                              void session.command('canvas_edit', {
                                edit: {
                                  mode: s.canvas!.mode,
                                  activityId: s.canvas!.activityId,
                                  branchId: s.canvas!.branchId,
                                  checkpointId: s.canvas!.invitation!.id,
                                  expectedRevision: s.canvas!.revision,
                                  expectedDraftRevision: s.canvas!.draftRevision,
                                  operations: [
                                    {
                                      type: 'replace_content',
                                      id: e.id,
                                      expectedVersion: e.version,
                                      text: event.target.value,
                                    },
                                  ],
                                },
                              });
                          }}
                        />
                      </label>
                    ))}
                  <div className={styles.actions}>
                    <button onClick={() => void session.command('undo')} disabled={session.busy}>
                      Undo saved edit
                    </button>
                    <button onClick={() => void session.command('redo')} disabled={session.busy}>
                      Redo saved edit
                    </button>
                  </div>
                </details>
              )}
            {session.error && (
              <LearningFeedback kind="network">
                <p>{session.error}</p>
                <button onClick={() => void session.refresh()}>Check saved lesson</button>
              </LearningFeedback>
            )}
            <footer className={`${styles.footer} ${classicStyles.footer}`}>
              <span role="status">
                <span className={styles.savedDot} />
                {session.busy
                  ? 'Saving…'
                  : session.dirty
                    ? 'Draft changes on this device · Save draft to keep them'
                    : s.submission
                      ? 'Submitted work saved'
                      : 'Saved session'}
              </span>
              <div>
                <button
                  onClick={() => void open('source')}
                  disabled={!s.lesson || s.status !== 'active' || session.busy}
                >
                  <BookOpen size={15} aria-hidden="true" />
                  Sources
                </button>
                <button
                  onClick={() => void open('ask')}
                  disabled={s.status !== 'active' || session.busy}
                >
                  <MessageCircle size={15} aria-hidden="true" />
                  Ask Petros
                </button>
                {s.actions.includes('close') && (
                  <button
                    onClick={() => {
                      controller?.interrupt();
                      void session.leave(true);
                    }}
                    disabled={session.busy || session.hasUnconfirmedSubmission}
                  >
                    End session <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </footer>
          </ClassicLessonLayout>
        </ClassicPresentationContext.Provider>
      </div>
      {panel && (
        <StudioDialog
          title={
            panel === 'ask'
              ? 'Ask Petros'
              : panel === 'source'
                ? 'Your sources'
                : panel === 'demo'
                  ? 'About this demo'
                  : 'Learning preferences'
          }
          close={() => setPanel(null)}
        >
          {panel === 'preferences' ? (
            <div className={styles.preferences}>
              <label>
                <input
                  type="checkbox"
                  checked={experience.compact}
                  onChange={(e) => experience.setCompact(e.target.checked)}
                />
                Compact character
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={experience.hidden}
                  onChange={(e) => experience.setHidden(e.target.checked)}
                />
                Hide character
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={experience.reducedMotion}
                  disabled={experience.systemReducedMotion}
                  onChange={(e) => experience.setReducedMotion(e.target.checked)}
                />
                Reduce motion · show complete steps
              </label>
              {experience.systemReducedMotion && (
                <p className={styles.hint}>
                  Reduced motion follows your device accessibility setting.
                </p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={experience.textOnly}
                  onChange={(e) => experience.setTextOnly(e.target.checked)}
                />
                Text-only presentation
              </label>
              <p className={styles.hint}>
                Text and controls work independently of the character. Voice is unavailable in this
                studio.
              </p>
            </div>
          ) : panel === 'demo' ? (
            <DemoInformation snapshot={s} />
          ) : panel === 'source' ? (
            <TeachingSources snapshot={s} />
          ) : (
            <div>
              {s.actions.includes('hint') ? (
                <>
                  <p>
                    This task permits the reviewed explanation. Using it records assisted practice
                    and changes eligibility for independent evidence.
                  </p>
                  <button
                    className={styles.primary}
                    disabled={session.busy}
                    onClick={() => void session.command('hint')}
                  >
                    Review the explanation · assisted practice
                  </button>
                  {s.assistance === 'assisted' && (
                    <div className={styles.reread}>
                      <p className={styles.eyebrow}>Assisted practice recorded</p>
                      <blockquote>{s.lesson?.explanation}</blockquote>
                    </div>
                  )}
                </>
              ) : !teaching || !s.actions.includes('ask') ? (
                <>
                  <p>
                    This question is your space to think. Answer-revealing help and lesson replay
                    are unavailable during the issued task.
                  </p>
                  <p className={styles.hint}>
                    Your answer stays where you left it. Close this window to return.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.hint}>
                    Reviewed-source reread · no live AI conversation is connected.
                  </p>
                  {state?.selectedId && (
                    <p className={styles.targetLabel}>
                      About: {state.canvas.elements.find((e) => e.id === state.selectedId)?.label} ·
                      current authorized excerpt
                    </p>
                  )}
                  <form onSubmit={(event) => void ask(event)}>
                    <label className={styles.field}>
                      <span id="studio-question-label">Your question</span>
                      <textarea
                        aria-labelledby="studio-question-label"
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        rows={3}
                        maxLength={2000}
                        required
                        placeholder="What would you like to look at again?"
                      />
                    </label>
                    <button className={styles.primary} disabled={session.busy}>
                      Bring back the source
                    </button>
                  </form>
                  {reply && (
                    <div className={styles.reread} role="status">
                      <p>{reply}</p>
                      <blockquote>
                        {selectedExcerpt && 'text' in selectedExcerpt
                          ? selectedExcerpt.text
                          : s.lesson?.explanation}
                      </blockquote>
                    </div>
                  )}
                  <p className={styles.hint}>
                    Close to return to the same excerpt. Continue the explanation when you’re ready.
                  </p>
                </>
              )}
            </div>
          )}
        </StudioDialog>
      )}
    </main>
  );
}
export function PetrosSessionShell({ sessionId }: { sessionId: string }) {
  const session = usePetrosSession(sessionId);
  if (!session.snapshot)
    return (
      <main className={styles.page}>
        <header className={styles.topbar}>
          <Link href="/petros/v2">← Your lessons</Link>
          <span className={styles.brand}>petros</span>
        </header>
        <div className={styles.pause}>
          <p role="status">{session.error || 'Opening your saved learning space…'}</p>
          {session.error && <button onClick={() => void session.refresh()}>Try again</button>}
        </div>
      </main>
    );
  return (
    <TeachingTargetRegistry
      scope={{
        sessionId: session.snapshot.id,
        activityId: session.snapshot.canvas?.activityId ?? null,
        revision: session.snapshot.canvas?.revision ?? 0,
      }}
    >
      <Studio session={session} snapshot={session.snapshot} />
    </TeachingTargetRegistry>
  );
}
