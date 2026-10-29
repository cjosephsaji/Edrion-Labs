'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  CanvasElement,
  CanvasOperation,
  EquationStep,
  M4Snapshot,
  LearningUIFamily,
} from '@edrion/schemas';
import { learningUIFor } from '@edrion/schemas';
import { useTeachingTarget } from '@/features/learning-studio/target-registry';
import type { usePetrosSession } from '../use-petros-session';
import { EquationBoard } from './session-equation-board';
import { DiagramEditor } from './session-diagram-editor';
import styles from '../petros-v2.module.css';
import workStyles from './session-teaching.module.css';
import { PredictionExplanation } from '../experiences/prediction-explanation';
import { GraphTable } from './graph-table';
import { TextAlternative } from '../text-alternative';
import { CriterionFeedback } from '../feedback';
import { criteriaFor, criterionState, currentEvaluation } from '../feedback-state';
import feedbackStyles from '../feedback.module.css';
import { CodeTrace } from './code-trace';
import { StudioDialog } from '../studio-dialog';
import { MathExpression } from '@/components/petros/petros-math';
import { TeachingContext } from '../teaching-support';
import { teachingPresentation } from '../teaching-presentation';
import { LearningCard } from '../learning-format';
import formatStyles from '../learning-format.module.css';
import { ResourceAllocationLab, allocationChallenge } from './resource-allocation-lab';
import classicStyles from '../classic-studio.module.css';
type Session = ReturnType<typeof usePetrosSession>;
function Element({
  element: e,
  editable,
  highlighted,
  busy,
  edit,
  snapshot,
  textOnly,
  equationStep,
  compactExample,
  resourceDraft,
  onDraftDirty,
  classic = false,
  moreOptions,
}: {
  snapshot: M4Snapshot;
  textOnly: boolean;
  element: CanvasElement;
  editable: boolean;
  highlighted: boolean;
  busy: boolean;
  edit: (op: CanvasOperation) => Promise<unknown>;
  equationStep?: EquationStep;
  compactExample?: boolean;
  resourceDraft?: Parameters<typeof ResourceAllocationLab>[0]['draft'];
  onDraftDirty?: (dirty: boolean) => void;
  classic?: boolean;
  moreOptions?: ReactNode;
}) {
  const ref = useTeachingTarget(e.id);
  const [annotation, setAnnotation] = useState(e.annotation ?? '');
  if (classic && e.kind === 'allocation')
    return (
      <ResourceAllocationLab
        element={e}
        editable={editable}
        busy={busy}
        edit={edit}
        textOnly={textOnly}
        draft={resourceDraft}
        onDraftDirty={onDraftDirty}
        memoryTargetRef={ref}
        explanationEditable={!!snapshot.teaching}
        activityMode={
          !snapshot.teaching && snapshot.task?.helpPolicy === 'assisted_practice'
            ? 'practice'
            : 'explore'
        }
        classic
        moreOptions={moreOptions}
      />
    );
  return (
    <LearningCard
      ref={e.kind === 'allocation' ? undefined : ref}
      elementId={e.id}
      className={workStyles.element}
      family={
        (e.kind === 'allocation'
          ? 'experiment'
          : e.kind === 'text'
            ? 'reading'
            : e.kind === 'table'
              ? 'comparison'
              : e.kind === 'trace'
                ? 'process'
                : e.kind === 'node' || e.kind === 'edge'
                  ? 'relationships'
                  : e.kind) as LearningUIFamily
      }
      title={e.label}
      badge={highlighted && e.kind !== 'allocation' ? 'You’re working on' : undefined}
      highlighted={highlighted}
      feedback={
        criteriaFor(snapshot, { elementId: e.id }).length
          ? criterionState(snapshot, criteriaFor(snapshot, { elementId: e.id })[0]!)
          : 'saved'
      }
    >
      {e.kind === 'allocation' ? (
        <ResourceAllocationLab
          element={e}
          editable={editable}
          busy={busy}
          edit={edit}
          textOnly={textOnly}
          draft={resourceDraft}
          onDraftDirty={onDraftDirty}
          memoryTargetRef={ref}
          explanationEditable={!!snapshot.teaching}
          activityMode={
            !snapshot.teaching && snapshot.task?.helpPolicy === 'assisted_practice'
              ? 'practice'
              : 'explore'
          }
        />
      ) : e.kind === 'graph' || e.kind === 'table' ? (
        <GraphTable
          element={e}
          textOnly={textOnly}
          editable={
            editable && !!snapshot.canvas?.invitation?.allowedOperations.includes('replace_cell')
          }
          busy={busy}
          edit={edit}
        />
      ) : e.kind === 'trace' ? (
        <CodeTrace elements={[e]} textOnly={textOnly} />
      ) : e.kind === 'equation' ? (
        <EquationBoard
          element={e}
          editable={editable}
          busy={busy}
          edit={edit}
          step={equationStep}
          textOnly={textOnly}
          compactExample={compactExample}
        />
      ) : e.kind === 'text' ? (
        <p style={{ whiteSpace: 'pre-wrap' }}>{e.text}</p>
      ) : e.kind === 'node' ? (
        <p>{e.text}</p>
      ) : (
        <p>
          {e.from} → {e.relation} → {e.to}
        </p>
      )}
      {criteriaFor(snapshot, { elementId: e.id }).map((c) => (
        <CriterionFeedback key={c.criterionId} snapshot={snapshot} criterion={c} />
      ))}
      {e.kind !== 'allocation' && e.annotation && <p>Annotation: {e.annotation}</p>}
      {editable && e.kind !== 'allocation' && (
        <details>
          <summary>Explain this step</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void edit({
                type: 'annotate',
                id: e.id,
                expectedVersion: e.version,
                text: annotation,
              });
            }}
          >
            <label>
              Explain or annotate {e.label}
              <textarea
                rows={2}
                value={annotation}
                maxLength={500}
                disabled={busy}
                onChange={(event) => setAnnotation(event.target.value)}
              />
            </label>
            <button disabled={busy || !annotation.trim() || annotation === e.annotation}>
              Save annotation
            </button>
          </form>
        </details>
      )}
    </LearningCard>
  );
}
/** Only acknowledged server state is rendered. The single scheduler requests the next accepted semantic beat. */
export function TeachingCanvas({
  snapshot: s,
  session,
  textOnly,
  reducedMotion,
  onSources,
  onInspectionChange,
  classicVM = false,
}: {
  snapshot: M4Snapshot;
  session: Session;
  textOnly: boolean;
  reducedMotion: boolean;
  onSources?: () => void;
  onInspectionChange?: (open: boolean) => void;
  classicVM?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [labDirty, setLabDirty] = useState(false);
  useEffect(() => {
    onInspectionChange?.(!!referenceId);
  }, [referenceId, onInspectionChange]);
  const [workView, setWorkView] = useState<'model' | 'calculation'>('model');
  useEffect(() => setWorkView('model'), [s.canvas?.branchId]);
  const live = useRef({ s, session });
  live.current = { s, session };
  const t = s.teaching,
    c = s.canvas;
  useEffect(() => {
    if (
      !playing ||
      !t ||
      t.status !== 'presenting' ||
      s.status !== 'active' ||
      session.busy ||
      document.hidden
    )
      return;
    const pin = { epoch: s.epoch, action: t.actionId, beat: t.nextBeat };
    const timer = setTimeout(
      () => {
        const current = live.current;
        if (
          document.hidden ||
          current.s.epoch !== pin.epoch ||
          current.s.teaching?.actionId !== pin.action ||
          current.s.teaching.nextBeat !== pin.beat
        )
          return;
        void current.session.command('teaching_step', {
          actionId: pin.action,
          nextBeat: pin.beat,
        });
      },
      reducedMotion ? 150 : 900,
    );
    return () => clearTimeout(timer);
  }, [playing, t, s.epoch, s.status, session.busy, reducedMotion]);
  useEffect(() => {
    setPlaying(false);
  }, [s.epoch, s.status]);
  useEffect(() => {
    const stop = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', stop);
    return () => document.removeEventListener('visibilitychange', stop);
  }, []);
  if (!c) return null;
  const ui = learningUIFor(s);
  const currentLab = c.elements.find((e) => e.kind === 'allocation');
  const hasLab = !!currentLab;
  const reference = c.elements.find((e) => e.id === referenceId && e.kind === 'equation');
  const previous = currentEvaluation({ ...s, teaching: null });
  // Collapse only a step explicitly located by the matching authorized evaluation.
  // A changed value stays open even if its original submitted value was correct.
  const completed = (e: CanvasElement) =>
    e.kind === 'equation' &&
    (t
      ? t.progressResponseId === s.submission?.id && t.completedStepIds?.includes(e.id)
      : previous?.criteria.some(
          (result) =>
            result.origin === 'trusted_kernel' &&
            result.status === 'satisfied' &&
            result.target?.elementIds?.includes(e.id),
        ));
  const orderedBlocks = hasLab
    ? [...ui.blocks].sort((a, b) => {
        const priority = (block: typeof a) => {
          const e = c.elements.find((v) => v.id === block.elementIds[0]);
          return e && completed(e) ? 0 : e?.kind === 'allocation' ? 1 : 2;
        };
        return priority(a) - priority(b);
      })
    : ui.blocks;
  const editable = (s.status === 'active' && !s.submission) || t?.status === 'participating';
  const edit = (operation: CanvasOperation | CanvasOperation[]) => {
    setPlaying(false);
    return session.command('canvas_edit', {
      edit: {
        mode: c.mode,
        activityId: c.activityId,
        branchId: c.branchId,
        checkpointId: c.invitation!.id,
        expectedRevision: c.revision,
        expectedDraftRevision: c.draftRevision,
        operations: Array.isArray(operation) ? operation : [operation],
      },
    });
  };
  if (classicVM && currentLab && (!t || t.status === 'participating'))
    return (
      <section
        className={classicStyles.activityWorkspace}
        aria-label="Interactive teaching workspace"
        data-resource-workspace
      >
        <Element
          element={currentLab}
          snapshot={s}
          classic
          textOnly={textOnly}
          editable={
            !!editable &&
            !!c.invitation?.editableIds.includes(currentLab.id) &&
            !c.invitation.submitted
          }
          highlighted={c.highlightedIds.includes(currentLab.id)}
          busy={session.busy}
          edit={edit}
          resourceDraft={
            t
              ? {
                  key: `${c.activityId}:${c.branchId}:${currentLab.id}`,
                  value: session.draft,
                  change: session.changeDraft,
                  save: session.save,
                }
              : undefined
          }
          onDraftDirty={setLabDirty}
          moreOptions={
            <div>
              <button onClick={onSources}>Source references</button>
              <button
                disabled={session.busy || labDirty}
                onClick={() => void session.command('undo')}
              >
                Undo saved edit
              </button>
              <button
                disabled={session.busy || labDirty}
                onClick={() => void session.command('redo')}
              >
                Redo saved edit
              </button>
            </div>
          }
        />
        {(!t ||
          (currentLab.kind === 'allocation' &&
            currentLab.resource.attempts?.find((a) => a.id === currentLab.resource.activeAttemptId)
              ?.explanation)) && (
          <section className={`${classicStyles.correction} ${workStyles.formScope}`}>
            <h3>Revisit your prediction</h3>
            <p>
              Your original answer stays saved. Revise the steps below, then open the separate
              correction task.
            </p>
            {s.submission?.response.kind === 'structured' && (
              <p>
                Earlier answer:{' '}
                {Object.entries(s.submission.response.values)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' · ')}
              </p>
            )}
            <details
              open={
                (currentLab.kind === 'allocation' &&
                  !!currentLab.resource.attempts?.find(
                    (a) => a.id === currentLab.resource.activeAttemptId,
                  )?.explanation) ||
                undefined
              }
            >
              <summary>New answer · revise your calculation</summary>
              <div className={classicStyles.correctionGrid}>
                {c.elements
                  .filter((e) => e.id !== currentLab.id)
                  .map((e) => (
                    <Element
                      key={`${c.branchId}:${e.id}`}
                      element={e}
                      snapshot={s}
                      textOnly={textOnly}
                      compactExample
                      editable={
                        !!editable &&
                        !!c.invitation?.editableIds.includes(e.id) &&
                        !c.invitation.submitted
                      }
                      highlighted={c.highlightedIds.includes(e.id)}
                      busy={session.busy}
                      edit={edit}
                      equationStep={t?.equationSteps?.find((step) => step.elementId === e.id)}
                    />
                  ))}
              </div>
            </details>
            {t && (
              <button
                className={styles.primary}
                disabled={session.busy || labDirty}
                onClick={() =>
                  void session.command(
                    t.capability === 'simulation' ? 'complete_exploration' : 'practice',
                  )
                }
              >
                {t.capability === 'simulation' ? 'Finish exploring' : 'Review your correction'}
              </button>
            )}
          </section>
        )}
      </section>
    );
  return (
    <section
      aria-label="Interactive teaching workspace"
      className={`${workStyles.stage} ${feedbackStyles.scope}`}
      data-teaching-action={t?.actionId}
      data-next-beat={t?.nextBeat}
      data-presentation-status={t?.status}
      data-learning-ui={ui.version}
      data-learning-family={ui.family}
      data-learning-layout={ui.layout}
      data-resource-workspace={hasLab}
    >
      {s.message?.startsWith('No reviewed') && <p role="status">{s.message}</p>}
      {t && (
        <>
          {!hasLab && <p className={styles.eyebrow}>Explore · try · revise</p>}
          <h2>
            {currentLab?.kind === 'allocation'
              ? allocationChallenge(currentLab.resource)
              : teachingPresentation(s).title}
          </h2>
          <TeachingContext snapshot={s} onSources={onSources} compact={hasLab} classic />
          {t.status === 'presenting' && (
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={session.busy}
                onClick={() =>
                  void session.command('teaching_step', {
                    actionId: t.actionId,
                    nextBeat: t.nextBeat,
                  })
                }
              >
                Show next teaching step
              </button>
              <button disabled={session.busy} onClick={() => setPlaying(!playing)}>
                {playing ? 'Stop demonstration' : 'Play demonstration'}
              </button>
              <span>
                Step {t.nextBeat} of {t.beatCount}
              </span>
            </div>
          )}
        </>
      )}
      <div
        aria-label="Structured canvas elements"
        data-active-view={workView}
        className={`${formatStyles.blockGrid} ${hasLab ? workStyles.resourceGrid : ''}`}
      >
        {hasLab && c.elements.some((e) => e.kind === 'equation' && !completed(e)) && (
          <nav className={workStyles.workspaceTabs} aria-label="Workspace view">
            <button
              aria-pressed={workView === 'model'}
              onClick={() => {
                setPlaying(false);
                setWorkView('model');
              }}
            >
              Explore model
            </button>
            <button
              aria-pressed={workView === 'calculation'}
              onClick={() => {
                setPlaying(false);
                setWorkView('calculation');
              }}
            >
              Revise calculation
            </button>
          </nav>
        )}
        {hasLab && (
          <nav className={workStyles.stepNav} aria-label="Activity steps">
            {orderedBlocks
              .filter((block) => block.elementIds.length === 1)
              .map((block) => {
                const e = c.elements.find((v) => v.id === block.elementIds[0])!;
                return (
                  <a
                    key={e.id}
                    href={`#learning-element-${e.id}`}
                    onClick={(event) => {
                      if (completed(e)) {
                        event.preventDefault();
                        setPlaying(false);
                        setReferenceId(e.id);
                      }
                    }}
                  >
                    {e.label} ·{' '}
                    {completed(e)
                      ? 'Previously checked'
                      : e.kind === 'allocation'
                        ? 'Explore'
                        : 'Revise, then submit'}
                  </a>
                );
              })}
            <span>
              Explanation ·{' '}
              {c.elements.some((e) => e.kind === 'allocation' && e.annotation?.trim())
                ? 'Saved · hasn’t been checked'
                : 'Next'}
            </span>
          </nav>
        )}
        {orderedBlocks.map((block) => {
          if (block.kind === 'experiment' && !block.elementIds.length) return null;
          if (block.kind === 'relationships')
            return (
              <LearningCard
                key={block.id}
                family="relationships"
                title="Build and explain the connections"
              >
                <DiagramEditor
                  snapshot={s}
                  canvas={c}
                  busy={session.busy}
                  edit={edit}
                  textOnly={textOnly}
                  undo={() => void session.command('undo')}
                  redo={() => void session.command('redo')}
                />
              </LearningCard>
            );
          const e = c.elements.find((element) => element.id === block.elementIds[0]);
          if (!e) return null;
          const element = (
            <Element
              key={`${c.branchId}:${e.id}:${e.kind === 'allocation' ? 'allocation' : e.version}`}
              snapshot={s}
              textOnly={textOnly}
              element={e}
              equationStep={t?.equationSteps?.find((step) => step.elementId === e.id)}
              compactExample={hasLab}
              onDraftDirty={e.kind === 'allocation' ? setLabDirty : undefined}
              resourceDraft={
                e.kind === 'allocation' && !!t
                  ? {
                      key: `${c.activityId}:${c.branchId}:${e.id}`,
                      value: session.draft,
                      change: session.changeDraft,
                      save: session.save,
                    }
                  : undefined
              }
              editable={
                !!editable && !!c.invitation?.editableIds.includes(e.id) && !c.invitation.submitted
              }
              highlighted={c.highlightedIds.includes(e.id)}
              busy={session.busy}
              edit={edit}
            />
          );
          return completed(e) ? (
            <div className={workStyles.completed} key={`${c.branchId}:${block.id}`}>
              <button
                id={`learning-element-${e.id}`}
                aria-haspopup="dialog"
                onClick={() => {
                  setPlaying(false);
                  setReferenceId(e.id);
                }}
              >
                {e.label} — {e.kind === 'equation' ? e.value : ''}{' '}
                {t?.equationSteps?.find((step) => step.elementId === e.id)?.result.unit}
                <span>Previously checked · View calculation</span>
              </button>
              {criteriaFor(s, { elementId: e.id }).map((criterion) => (
                <CriterionFeedback key={criterion.criterionId} snapshot={s} criterion={criterion} />
              ))}
            </div>
          ) : block.emphasis === 'supporting' && !e.editable ? (
            <details className={formatStyles.supporting} key={block.id}>
              <summary>{e.label} · supporting material</summary>
              {element}
            </details>
          ) : (
            element
          );
        })}
      </div>
      {t?.status === 'participating' && (
        <>
          <h3>Your turn</h3>
          <p>{c.invitation?.prompt}</p>
          <div className={styles.actions}>
            {hasLab &&
              c.elements.some((e) => e.kind === 'equation' && !completed(e)) &&
              workView === 'model' && (
                <button
                  className={workStyles.mobileNext}
                  onClick={() => setWorkView('calculation')}
                >
                  Next: revise your calculation
                </button>
              )}
            <button
              className={styles.primary}
              disabled={session.busy || labDirty}
              onClick={() =>
                void session.command(
                  t.capability === 'simulation' ? 'complete_exploration' : 'practice',
                )
              }
            >
              {t.capability === 'simulation' ? 'Finish exploring' : 'Review your correction'}
            </button>
            <button
              disabled={session.busy || labDirty}
              onClick={() => void session.command('undo')}
            >
              Undo edit
            </button>
            <button
              disabled={session.busy || labDirty}
              onClick={() => void session.command('redo')}
            >
              Redo edit
            </button>
          </div>
        </>
      )}
      {t?.status === 'complete' && t.simulation && !hasLab && (
        <PredictionExplanation
          initial={t.simulation}
          busy={session.busy}
          result={t.experiment}
          run={(input) => session.command('experiment', { input })}
        />
      )}
      {t?.status === 'complete' && (
        <button
          className={styles.primary}
          disabled={session.busy}
          onClick={() => void session.command('verify')}
        >
          Request a fresh reviewed check
        </button>
      )}
      {t?.status === 'complete' && (
        <div className={styles.actions}>
          <button
            disabled={session.busy}
            onClick={() => void session.command('teach', { preference: 'experiment' })}
          >
            Explore a bounded experiment
          </button>
          <button
            disabled={session.busy}
            onClick={() => void session.command('teach', { preference: 'process' })}
          >
            Inspect a process trace
          </button>
          <button
            disabled={session.busy}
            onClick={() => void session.command('teach', { preference: 'graph' })}
          >
            Compare a graph and table
          </button>
        </div>
      )}
      {reference?.kind === 'equation' && (
        <StudioDialog
          title={`${reference.label} — ${reference.value} ${t?.equationSteps?.find((step) => step.elementId === reference.id)?.result.unit ?? ''}`}
          close={() => setReferenceId(null)}
        >
          <div className={workStyles.referenceContent}>
            <p>Previously checked in your submitted work.</p>
            <MathExpression value={reference.tex} display />
            <p>{reference.explanation}</p>
            <p>
              Your answer: <strong>{reference.value}</strong>
            </p>
            {onSources && (
              <button
                onClick={() => {
                  setReferenceId(null);
                  onSources();
                }}
              >
                Inspect source
              </button>
            )}
          </div>
        </StudioDialog>
      )}
      <TextAlternative
        title="Read this explanation"
        primary={textOnly}
        onOpen={() => setPlaying(false)}
      >
        <p>
          {process.env.NEXT_PUBLIC_PETROS_M4_DEMO === '1'
            ? 'Sample teaching material · simulated review records'
            : s.lesson?.citation}
        </p>
        {t && <p>{t.accessibleAlternative}</p>}
        {c.elements.map((e) => (
          <section key={e.id}>
            <h3>{e.label}</h3>
            <p>
              {e.kind === 'allocation'
                ? `Memory-only resource model: total ${e.resource.model.totalGB} GB; reserved ${e.resource.model.reservedGB} GB; ${e.resource.model.perVMGB} GB per whole VM; no overcommit. ${e.resource.allocatedCount} VMs allocated. ${e.resource.observations.at(-1)?.remainingGB ?? 'Not yet observed'} GB remaining. Predictions and observations are formative, not grades.`
                : e.kind === 'equation'
                  ? `${e.tex}\n${e.explanation}\nYour saved step: ${e.value}`
                  : e.kind === 'graph'
                    ? e.points.map((p) => `${p.x} ${e.xUnit}: ${p.y} ${e.yUnit}`).join('\n')
                    : e.kind === 'table'
                      ? [e.columns.join(' | '), ...e.rows.map((row) => row.join(' | '))].join('\n')
                      : e.kind === 'trace'
                        ? e.lines
                            .map(
                              (line) =>
                                `${line.text} · ${Object.entries(line.state)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join('; ')}`,
                            )
                            .join('\n')
                        : e.kind === 'edge'
                          ? `${e.from} → ${e.relation} → ${e.to}`
                          : e.text}
            </p>
            {e.annotation && <p>{e.annotation}</p>}
          </section>
        ))}
      </TextAlternative>
    </section>
  );
}
