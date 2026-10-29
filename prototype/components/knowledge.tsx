'use client';
import { entail } from '../teaching/algorithms';
import type { ShowcaseState } from '../teaching/types';
import type { Patch } from './workspace';
import s from './showcase.module.css';
export function Knowledge({
  state,
  patch,
  onSelect,
}: {
  state: ShowcaseState;
  patch: Patch;
  onSelect: (s: string) => void;
}) {
  const visual = state.visualState;
  if (visual.kind !== 'kb') return null;
  const v = visual;
  function tell(entity: string) {
    patch({
      visualState: {
        ...v,
        facts: [...new Set([...v.facts, `Bird(${entity})`])],
      },
      highlightTargetId: `Bird(${entity})`,
    });
    if (entity === 'Tweety') onSelect('TELL Bird(Tweety)');
  }
  function apply(entity: string) {
    const fact = `Bird(${entity})`,
      result = `HasWings(${entity})`;
    if (!v.facts.includes(fact)) {
      patch({
        lastFeedback: `TELL ${fact} first. A rule needs its supporting premise.`,
      });
      return;
    }
    patch({
      visualState: { ...v, derived: [...new Set([...v.derived, result])] },
      highlightTargetId: result,
    });
    onSelect(result);
  }
  function ask(query: string) {
    const result = entail(v.facts, query);
    patch({
      visualState: { ...v, query },
      highlightTargetId: query,
      lastFeedback: `ASK ${query}? ${result.status}. ${result.path.join(' → ')}`,
    });
  }
  const answer = v.query ? entail(v.facts, v.query) : null;
  return (
    <div className={s.knowledgeBoard}>
      <div className={s.boardLabel}>
        <span>A SMALL KNOWLEDGE BASE</span>
        <span>ILLUSTRATIVE EXAMPLE</span>
      </div>
      <div className={s.kbColumns}>
        <section>
          <h3>Facts</h3>
          <span className={s.kbDescription}>What we have been told</span>
          {v.facts.map((f) => (
            <div
              className={s.fact}
              data-highlight={state.highlightTargetId === f}
              key={f}
            >
              {f}
            </div>
          ))}
          <button onClick={() => tell('Tweety')}>TELL Bird(Tweety)</button>
          <button onClick={() => tell('Rio')}>TELL Bird(Rio)</button>
        </section>
        <section>
          <h3>Rules</h3>
          <span className={s.kbDescription}>How knowledge connects</span>
          <div
            className={s.rule}
            data-highlight={
              state.questionId === 'AI4-Q03' || state.stepId === 2
            }
          >
            <span>∀x</span>
            <strong>Bird(x)</strong>
            <span className={s.ruleArrow}>↓</span>
            <strong>HasWings(x)</strong>
          </div>
          <p className={s.substitution}>
            x := {v.facts.includes('Bird(Rio)') ? 'Tweety or Rio' : 'Tweety'}
          </p>
          <button onClick={() => apply('Tweety')}>Apply rule · Tweety</button>
          {v.facts.includes('Bird(Rio)') && (
            <button onClick={() => apply('Rio')}>Apply rule · Rio</button>
          )}
        </section>
        <section>
          <h3>What follows</h3>
          <span className={s.kbDescription}>Supported conclusions</span>
          {v.derived.length ? (
            v.derived.map((f) => (
              <div
                className={s.derived}
                key={f}
                data-highlight={state.highlightTargetId === f}
              >
                <span>→</span>
                {f}
                <small>
                  from Bird({f.includes('Rio') ? 'Rio' : 'Tweety'}) + rule
                </small>
              </div>
            ))
          ) : (
            <p className={s.emptyDerived}>
              Apply a rule to reveal a conclusion.
            </p>
          )}
          <button
            className={s.unsupported}
            onClick={() => {
              patch({ highlightTargetId: 'unsupported' });
              onSelect('Bird(Tweety) → CanFly(Tweety)');
            }}
          >
            Bird(Tweety) ⇢ CanFly(Tweety)<small>Is this arrow supported?</small>
          </button>
        </section>
      </div>
      <div className={s.kbQuery}>
        <button onClick={() => ask('HasWings(Tweety)')}>
          ASK HasWings(Tweety)?
        </button>
        <button onClick={() => ask('CanFly(Tweety)')}>
          ASK CanFly(Tweety)?
        </button>
      </div>
      {answer && (
        <div className={s.queryAnswer} role="status">
          <strong>
            {v.query}: {answer.status}
          </strong>
          <p>{answer.path.join(' → ')}</p>
        </div>
      )}
      <div className={s.chaining}>
        <button
          aria-pressed={v.direction === 'forward'}
          onClick={() => patch({ visualState: { ...v, direction: 'forward' } })}
        >
          Forward chaining
        </button>
        <button
          aria-pressed={v.direction === 'backward'}
          onClick={() =>
            patch({ visualState: { ...v, direction: 'backward' } })
          }
        >
          Backward chaining
        </button>
        <p>
          {v.direction === 'forward'
            ? 'Bird(Tweety) → match Bird(x) → HasWings(Tweety)'
            : 'Goal HasWings(Tweety) → need Bird(Tweety) → fact found'}
        </p>
      </div>
      <p className={s.caption}>
        TELL adds knowledge. ASK checks support. A missing flight rule means
        “not entailed”, never automatically “false”.
      </p>
    </div>
  );
}
