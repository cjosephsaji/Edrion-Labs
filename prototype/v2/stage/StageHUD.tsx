import type { StageLesson, StageChip } from './lesson';
import type { StageExperienceProps } from './StageExperience';
import { useWorld, type Quality } from '../world-v3/store';
import { palette } from './palette';
import { format } from './logic';
import c from './stage.module.css';
import { GlossaryCaption } from './GlossaryCaption';
function Spark({ values, label }: { values: number[]; label: string }) {
  const data = values.length ? values : [0],
    max = Math.max(1, ...data),
    min = Math.min(0, ...data),
    n = Math.max(8, data.length),
    points = data.map(
      (v, i) =>
        `${4 + (i / (n - 1)) * 200},${42 - ((v - min) / (max - min)) * 35}`,
    ),
    end = points.at(-1)!.split(',');
  return (
    <svg
      className={c.spark}
      viewBox="0 0 210 48"
      aria-label={`${label} history`}
    >
      <defs>
        <linearGradient id="loss-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--stage-amber)" stopOpacity=".23" />
          <stop offset="1" stopColor="var(--stage-amber)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 44H210" stroke="var(--stage-hairline)" />
      <path
        d={`M${points.join(' L')} L${end[0]} 48 L4 48Z`}
        fill="url(#loss-fill)"
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--stage-amber)"
        strokeWidth="1.7"
      />
      <circle cx={end[0]} cy={end[1]} r="2.8" fill="var(--stage-amber)" />
    </svg>
  );
}

export function StageSummary<S>({
  lesson,
  state,
  story,
  storyEnabled,
  onStory,
  flash,
  onPart,
  open,
}: {
  lesson: StageLesson<S>;
  state: S;
  story: boolean;
  storyEnabled: boolean;
  onStory: () => void;
  flash: string;
  onPart: (id: string) => void;
  open: (id: string) => void;
}) {
  const lossState = lesson.metric.status(state),
    metric = lesson.metric.value(state),
    metricName = lesson.metric.displayName?.(state) ?? lesson.metric.name;
  return (
    <section className={c.summary} aria-label="Lesson summary">
      <div className={c.eyebrow}>{lesson.eyebrow}</div>
      <h1>{lesson.title}</h1>
      <p className={c.sub}>
        {story ? lesson.subtitle : lesson.abstractSubtitle}
      </p>
      <button
        className={c.loss}
        data-petros-id={lesson.metric.id}
        onClick={() => onPart(lesson.metric.id)}
        aria-label={`Inspect ${metricName.toLowerCase()}`}
      >
        <span className={c.lossHeading}>
          {metricName} <span>{lossState}</span>
        </span>
        <strong
          data-testid="stage-loss"
          style={{
            color:
              (lesson.metric.good?.(state) ?? lossState === 'on target')
                ? palette.mint
                : undefined,
          }}
        >
          {format(metric, lesson.metric.digits ?? 3)}
          {lesson.metric.unit && (
            <small className={c.metricUnit}>{lesson.metric.unit}</small>
          )}
        </strong>
        <span className={c.formula}>{lesson.metric.formula(state)}</span>
        {lesson.metric.spark !== false && (
          <Spark
            label={lesson.metric.name}
            values={[...lesson.metric.history(state).slice(-79), metric]}
          />
        )}
      </button>
      <div className={c.story}>
        <button aria-pressed={storyEnabled} onClick={onStory}>
          Story <span>{storyEnabled ? 'on' : 'off'}</span>
        </button>
        <span>{story ? lesson.story.description : lesson.story.fallback}</span>
      </div>
      <div className={c.equation} aria-label={lesson.equation.join(' ')}>
        {lesson.equation.map((word, i) =>
          lesson.glossary[word] ? (
            <button
              key={i}
              data-lit={flash === word}
              onClick={() => open(lesson.glossary[word])}
            >
              {word}
            </button>
          ) : (
            <span key={i}>{word}</span>
          ),
        )}
      </div>
      {lesson.readouts && (
        <div
          className={c.readouts}
          aria-label={`${lesson.shortTitle} measurements`}
        >
          {lesson.readouts.map((r) => (
            <button
              key={r.label}
              onClick={() => r.part && onPart(r.part)}
              disabled={!r.part}
            >
              <span>{r.label}</span>
              <b>{r.value(state)}</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
export function ExplainerCard<S>({
  chip,
  part,
  lesson,
  state,
  runDemo,
  restore,
  onRead,
}: {
  chip: StageChip<S>;
  part: string;
  lesson: StageLesson<S>;
  state: S;
  runDemo: () => void;
  restore: () => void;
  onRead: (text: string) => void;
}) {
  return (
    <aside
      className={c.explainer}
      role="region"
      aria-labelledby="stage-explainer-title"
      data-testid="stage-explainer"
      data-chip={chip.id}
    >
      <button
        className={c.close}
        onClick={restore}
        aria-label="Close explanation"
      >
        ×
      </button>
      <span className={c.eyebrow}>A closer look</span>
      <h2 id="stage-explainer-title">
        {lesson.parts.find((p) => p.id === part)!.name}
      </h2>
      <p>{chip.answer(state)}</p>
      <p className={c.analogy}>{chip.analogy}</p>
      <div className={c.cardActions}>
        <button onClick={runDemo} className={c.try}>
          Try it <span>↗</span>
        </button>
        <button onClick={() => onRead(chip.answer(state))}>Read aloud</button>
      </div>
      <span className={c.tryLabel}>{chip.tryLabel}</span>
      <button className={c.back} onClick={restore}>
        ← Back to the whole thing
      </button>
    </aside>
  );
}
export function StageControls<S>(
  props: StageExperienceProps<S> & {
    auto: boolean;
    pauseTraining: () => void;
    restore: () => void;
    onAuto: () => void;
    onStep: () => void;
    parameterChanged: () => void;
  },
) {
  const {
      lesson,
      state,
      auto,
      pauseTraining,
      restore,
      onAuto,
      onStep,
      parameterChanged,
    } = props,
    parameter = lesson.parameter.value(state),
    range =
      typeof lesson.parameter.range === 'function'
        ? lesson.parameter.range(state)
        : lesson.parameter.range;
  return (
    <div className={c.bar}>
      <label htmlFor={`stage-${lesson.parameter.id}`}>
        {lesson.parameter.label}
      </label>
      {lesson.parameter.choices ? (
        <select
          id={`stage-${lesson.parameter.id}`}
          value={parameter}
          disabled={!props.hydrated}
          onChange={(e) => {
            parameterChanged();
            void props.onAction('sim_set_params', {
              patch: { [lesson.parameter.key]: +e.target.value },
            });
          }}
        >
          {lesson.parameter.choices(state).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`stage-${lesson.parameter.id}`}
          type="range"
          min={range[0]}
          max={range[1]}
          step={lesson.parameter.step}
          value={parameter}
          aria-valuetext={lesson.parameter.display?.(state)}
          disabled={!props.hydrated}
          onChange={(e) => {
            parameterChanged();
            void props.onAction('sim_set_params', {
              patch: { [lesson.parameter.key]: +e.target.value },
            });
          }}
        />
      )}
      {!lesson.parameter.choices && (
        <output htmlFor={`stage-${lesson.parameter.id}`}>
          {lesson.parameter.display?.(state) ?? format(parameter)}
        </output>
      )}
      {lesson.toggles?.map((toggle) => (
        <button
          key={toggle.key}
          aria-pressed={toggle.value(state)}
          data-stage-toggle={toggle.key}
          onClick={() => {
            pauseTraining();
            restore();
            void props.onAction('sim_set_params', {
              patch: { [toggle.key]: !toggle.value(state) },
            });
          }}
        >
          {toggle.label} <span>{toggle.value(state) ? 'on' : 'off'}</span>
        </button>
      ))}
      <span className={c.sep} />
      <button
        className={c.primary}
        data-petros-id={lesson.train.id}
        disabled={!props.hydrated || lesson.train.enabled?.(state) === false}
        onClick={onStep}
      >
        {lesson.train.label}
      </button>
      <button
        aria-pressed={auto}
        aria-label={auto ? lesson.train.stopLabel : lesson.train.autoLabel}
        disabled={!props.hydrated || lesson.train.enabled?.(state) === false}
        onClick={onAuto}
      >
        {auto ? lesson.train.stopLabel : lesson.train.autoLabel}
        {lesson.train.rateLabel && (
          <small className={c.rateLabel} aria-hidden="true">
            {typeof lesson.train.rateLabel === 'function'
              ? lesson.train.rateLabel(state)
              : lesson.train.rateLabel}
          </small>
        )}
      </button>
      <button
        onClick={() => {
          pauseTraining();
          restore();
          props.onReset();
        }}
      >
        Reset
      </button>
    </div>
  );
}
export function StageLessonPanel<S>(
  props: StageExperienceProps<S> & {
    phone: boolean;
    effectiveQuality: Quality;
    onClose: () => void;
    pauseTraining: () => void;
    open: (id: string) => void;
  },
) {
  const { phone, effectiveQuality, onClose, pauseTraining } = props;
  return (
    <aside className={c.lessonPanel} aria-label="Prepared lesson and settings">
      <button
        className={c.close}
        onClick={onClose}
        aria-label="Close lesson and settings"
      >
        ×
      </button>
      <h2>Learn with Petros</h2>
      <p>Prepared lesson · no live AI needed</p>
      {props.lesson.extraParameters?.map((control) => (
        <label key={control.key} className={c.extraParameter}>
          {control.label}
          <input
            aria-label={control.label}
            id={`stage-${control.key}`}
            type="range"
            min={control.range[0]}
            max={control.range[1]}
            step={control.step}
            value={control.value(props.state)}
            onChange={(e) => {
              pauseTraining();
              props.onPause();
              void props.onAction('sim_set_params', {
                patch: { [control.key]: +e.target.value },
              });
            }}
          />
          <output>
            {control.value(props.state)} {control.unit}
          </output>
        </label>
      ))}
      {props.lesson.textControls?.map((control) => (
        <form
          key={control.key}
          className={c.sentenceForm}
          onSubmit={(e) => {
            e.preventDefault();
            pauseTraining();
            const input = new FormData(e.currentTarget).get(control.key);
            void props.onAction('sim_set_params', {
              patch: {
                [control.key]: String(input ?? '')
                  .trim()
                  .replace(/\s+/g, ' '),
              },
            });
          }}
        >
          <label htmlFor={`stage-text-${control.key}`}>{control.label}</label>
          <div>
            <input
              key={control.value(props.state)}
              id={`stage-text-${control.key}`}
              name={control.key}
              defaultValue={control.value(props.state)}
              maxLength={control.maxLength}
              required
            />
            <button type="submit">Apply sentence</button>
          </div>
          <p>{control.help}</p>
        </form>
      ))}
      {props.lesson.selectControls?.map((control) => (
        <label key={control.key} className={c.choiceControl}>
          {control.label}
          <select
            id={`stage-${control.key}`}
            aria-label={control.label}
            aria-describedby={`stage-${control.key}-help`}
            value={control.value(props.state)}
            onChange={(e) => {
              pauseTraining();
              props.onPause();
              void props.onAction('sim_set_params', {
                patch: { [control.key]: e.target.value },
              });
            }}
          >
            {control.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          <small id={`stage-${control.key}-help`}>{control.help}</small>
        </label>
      ))}
      <div className={c.transcript} data-testid="stage-transcript">
        <span className={c.eyebrow}>Full caption</span>
        <p>
          <GlossaryCaption
            text={props.caption}
            glossary={props.lesson.glossary}
            onOpen={props.open}
          />
        </p>
      </div>
      <div className={c.panelButtons}>
        <button disabled={!props.hydrated} onClick={props.onBegin}>
          Start learning with captions
        </button>
        {props.guide.started &&
          props.guide.openingIndex < 3 &&
          ['ORIENT', 'EXPLAIN', 'DEMONSTRATE'].includes(props.guide.phase) && (
            <button onClick={props.onContinue}>Continue with Petros →</button>
          )}
        {['PREDICT', 'TRANSFER_CHECK'].includes(props.guide.phase) && (
          <>
            <p>{props.questions.question}</p>
            {props.questions.options.map((q, i) => (
              <button key={q} onClick={() => props.onChoose(i)}>
                {q}
              </button>
            ))}
          </>
        )}
        {props.guide.phase === 'RETEACH_OR_EXTEND' && (
          <button onClick={props.onTransfer}>Try a fresh example →</button>
        )}
        {props.preparedQuestions.map((q) => (
          <button key={q.id} onClick={() => props.onAsk(q.question)}>
            {q.question}
          </button>
        ))}
        <button
          onClick={() => {
            pauseTraining();
            props.onPause();
          }}
        >
          Pause Petros
        </button>
      </div>
      <label>
        Rendering quality
        <select
          aria-label="Stage quality"
          value={effectiveQuality}
          disabled={phone}
          onChange={(e) =>
            useWorld.getState().setQuality(e.target.value as Quality)
          }
        >
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </label>
      <p>
        {phone
          ? 'Phone · Low effects, clear glass'
          : 'Studio lighting · local assets'}
      </p>
      <a href="?view=world">Open the original World ↗</a>
      <a href="?view=2d">Open the 2D tutor ↗</a>
    </aside>
  );
}
