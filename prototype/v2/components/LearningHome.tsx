'use client';

import { useEffect, useRef, useState } from 'react';
import {
  INVESTIGATION_STORAGE,
  freshInvestigationSession,
  parseInvestigationSession,
  type InvestigationSession,
} from '../core/investigation';
import {
  findQuestions,
  investigationHref,
  learningRecord,
  nextStep,
  questionFor,
} from '../core/learning-home';
import type { Topic } from '../simulations/runtime';
import s from './learning-home.module.css';

export function LearningHome({ canSignOut = false }: { canSignOut?: boolean }) {
  const [session, setSession] = useState<InvestigationSession>(
    freshInvestigationSession,
  );
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Topic | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const restore = () => {
      try {
        const raw = localStorage.getItem(INVESTIGATION_STORAGE);
        setSession(
          raw ? parseInvestigationSession(raw) : freshInvestigationSession(),
        );
        setNotice('');
      } catch {
        setNotice(
          'We couldn’t restore your place in this browser. You can still start a question.',
        );
      }
      setReady(true);
    };
    const changed = (event: StorageEvent) => {
      if (event.key === INVESTIGATION_STORAGE || event.key === null) restore();
    };
    restore();
    // A browser Back navigation can restore this page without remounting React.
    window.addEventListener('pageshow', restore);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('storage', changed);
    };
  }, []);

  const record = learningRecord(session);
  const returning = record.length > 0;
  const topic = selected ?? (returning ? session.active : 'traffic');
  const question = questionFor(topic);
  const progress = session.topics[topic];
  const resume = !!progress;
  const step = nextStep(progress);
  const results = findQuestions(query);
  const choose = (next: Topic) => {
    setSelected(next);
    setQuery('');
    setShowQuestions(false);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  };

  const discovery = (
    <section className={s.discovery} aria-labelledby="discovery-title">
      <div className={s.discoveryHeading}>
        <div>
          <p className={s.eyebrow}>FOLLOW YOUR OWN QUESTION</p>
          <h2 id="discovery-title">What are you trying to understand?</h2>
        </div>
        <span>Five starting points. Room to go deeper.</span>
      </div>
      <form
        className={s.searchForm}
        onSubmit={(event) => {
          event.preventDefault();
          setShowQuestions(true);
        }}
        role="search"
      >
        <label className={s.srOnly} htmlFor="question-search">
          Find a topic among the five available investigations
        </label>
        <span className={s.searchIcon} aria-hidden="true">
          ⌕
        </span>
        <input
          ref={search}
          id="question-search"
          type="search"
          value={query}
          maxLength={200}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowQuestions(true);
          }}
          placeholder="Try ‘AI’, ‘forces’, or ‘time’…"
          aria-controls="question-results"
          autoComplete="off"
        />
        <button type="submit">
          Find a question <span aria-hidden="true">→</span>
        </button>
      </form>
      <div className={s.discoveryFoot}>
        <span>Explore the available topics, in your own words.</span>
        <button
          type="button"
          aria-expanded={showQuestions}
          aria-controls="question-results"
          onClick={() => {
            setShowQuestions(!showQuestions);
            setQuery('');
          }}
        >
          {showQuestions ? 'Close questions' : 'Browse all 5 questions'}{' '}
          <span aria-hidden="true">{showQuestions ? '−' : '+'}</span>
        </button>
      </div>
      <div id="question-results" hidden={!showQuestions}>
        <p className={s.resultStatus} role="status">
          {showQuestions
            ? results.length
              ? `${results.length} ${results.length === 1 ? 'starting point' : 'starting points'}${query.trim() ? ` for “${query.trim()}”` : ''}. Choose one to see what you’ll learn.`
              : `We don’t have an investigation for “${query.trim()}” yet.`
            : ''}
        </p>
        {results.length ? (
          <div className={s.questionList}>
            {results.map((item) => (
              <button
                key={item.topic}
                className={s.questionOption}
                onClick={() => choose(item.topic)}
              >
                <span className={s.optionSymbol} aria-hidden="true">
                  {item.symbol}
                </span>
                <span>
                  <small>{item.subject}</small>
                  <strong>{item.title}</strong>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={s.emptyResult}>
            <p>
              Right now, you can explore machine learning, language AI, motion,
              traffic, and relativity.
            </p>
            <button
              onClick={() => {
                setQuery('');
                search.current?.focus();
              }}
            >
              See the five available questions →
            </button>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div
      className={s.home}
      data-testid="learning-home"
      data-ready={ready}
      data-returning={returning}
    >
      <a className={s.skip} href="#your-question">
        Skip to your question
      </a>
      <header className={s.header}>
        <a
          className={s.brand}
          href="/prototype"
          aria-label="Petros learning home"
        >
          <span className={s.brandMark}>p</span>petros
          <span className={s.byline}>by Edrion</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/prototype?view=3d">3D workshop</a>
          <a className={s.activeNav} href="/prototype" aria-current="page">
            Learn
          </a>
          {returning && (
            <a href="#notebook">
              Your notebook <span className={s.notebookDot} />
            </a>
          )}
        </nav>
        {canSignOut ? (
          <form action="/prototype/api/logout" method="post">
            <button className={s.signOut}>Sign out</button>
          </form>
        ) : (
          <span className={s.headerNote}>
            A little curiosity goes a long way.
          </span>
        )}
      </header>

      <main className={s.main}>
        <section className={s.welcome} aria-labelledby="welcome-title">
          <div>
            <p className={s.eyebrow}>
              <span className={s.sun} aria-hidden="true">
                ✳
              </span>{' '}
              A SPACE TO FIGURE THINGS OUT
            </p>
            <h1 id="welcome-title">
              {returning ? (
                <>
                  Your next little
                  <br />
                  <em>“I get it.”</em>
                </>
              ) : (
                <>
                  It starts with
                  <br />
                  <em>“I don’t get it.”</em>
                </>
              )}
            </h1>
            <p className={s.intro}>
              {returning
                ? 'Welcome back. Your questions, experiments, and next steps are right here.'
                : 'That’s a good place to begin. Pick a question. Try a small experiment. Make the idea your own.'}
            </p>
          </div>
          <aside className={s.companion} aria-label="A welcome from Petros">
            <div className={s.companionNote}>
              <span className={s.eyebrow}>A NOTE FROM PETROS</span>
              <p>
                {returning
                  ? 'There’s no catching up here. Let’s pick up where you are.'
                  : 'You don’t have to know the answer. We’ll work it out, one step at a time.'}
              </p>
              <span className={s.handwritten}>
                With you, through the tricky bits.
              </span>
            </div>
            <img
              src="/petros/petros-idle.png"
              alt="Petros, your learning companion"
              width="114"
              height="132"
            />
          </aside>
        </section>

        {!returning && discovery}

        <section
          className={s.startSection}
          id="your-question"
          aria-labelledby="question-title"
        >
          <div className={s.sectionLabel}>
            <span className={s.eyebrow}>
              {resume
                ? 'PICK UP YOUR THREAD'
                : selected
                  ? 'YOUR QUESTION, YOUR STARTING POINT'
                  : 'NOT SURE? START WITH AN EVERYDAY MYSTERY'}
            </span>
            <span>{question.subject}</span>
          </div>
          <div className={s.questionCard}>
            <div className={s.questionBody}>
              <div className={s.questionNumber}>
                <span aria-hidden="true">{question.symbol}</span>
                {resume
                  ? `CASE ${progress.caseIndex + 1} OF 3`
                  : 'ONE QUESTION. ONE SMALL EXPERIMENT.'}
              </div>
              <h2 id="question-title" ref={heading} tabIndex={-1}>
                {question.title}
              </h2>
              <p className={s.invitation}>
                {resume ? step.detail : question.invitation}
              </p>
              <div className={s.actionRow}>
                <a
                  className={s.primary}
                  href={investigationHref(topic)}
                  aria-disabled={!ready}
                  onClick={(event) => {
                    if (!ready) event.preventDefault();
                  }}
                >
                  {resume ? 'Continue learning' : 'Let’s figure it out'}
                  <span aria-hidden="true">↗</span>
                </a>
                <span className={s.pace}>
                  {resume ? (
                    step.label
                  ) : (
                    <>
                      At your pace.
                      <br />
                      You can pause at any step.
                    </>
                  )}
                </span>
              </div>
            </div>
            <aside className={s.outcome} aria-label="Your learning goal">
              <span className={s.pin} aria-hidden="true" />
              <span className={s.eyebrow}>
                {resume ? 'YOUR LEARNING GOAL' : 'YOUR FIRST SMALL WIN'}
              </span>
              <p className={s.outcomeLead}>“I can…”</p>
              <h3>{question.outcome}</h3>
              <div className={s.outcomeRule} />
              <p className={s.foothold}>
                <span aria-hidden="true">↳</span>
                {question.foothold}
              </p>
              <span className={s.noteIndex}>A little clearer than before.</span>
            </aside>
          </div>
          {!resume && (
            <ol className={s.path} aria-label="How you’ll learn">
              <li>
                <span>01</span>
                <div>
                  <strong>Make a guess</strong>
                  <p>A starting point, never a grade.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>See what happens</strong>
                  <p>Change one thing. Follow its effect.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Make it click</strong>
                  <p>Explain the cause. Try another case.</p>
                </div>
              </li>
            </ol>
          )}
        </section>

        {returning && discovery}

        {returning && (
          <section
            className={s.notebook}
            id="notebook"
            aria-labelledby="notebook-title"
          >
            <div className={s.discoveryHeading}>
              <div>
                <p className={s.eyebrow}>YOUR NOTEBOOK</p>
                <h2 id="notebook-title">Keep the thread.</h2>
              </div>
              <span>What you tried. What to explore next.</span>
            </div>
            <div className={s.recordList}>
              {record.map(
                ({
                  question: item,
                  explored,
                  explained,
                  assisted,
                  progress: itemProgress,
                }) => (
                  <article key={item.topic}>
                    <span className={s.recordSymbol} aria-hidden="true">
                      {item.symbol}
                    </span>
                    <div>
                      <small>{item.subject}</small>
                      <h3>{item.title}</h3>
                      <p>
                        {explored
                          ? `${explored} ${explored === 1 ? 'case' : 'cases'} explored · ${explained} explained${assisted ? ` (${assisted} with a hint)` : ''}`
                          : 'Your first experiment is underway.'}
                      </p>
                      <span>{nextStep(itemProgress).label}</span>
                    </div>
                    <a
                      href={investigationHref(item.topic)}
                      aria-label={`Return to ${item.subject}`}
                    >
                      Pick up <span aria-hidden="true">↗</span>
                    </a>
                  </article>
                ),
              )}
            </div>
            <p className={s.recordNote}>
              A record of your attempts, not a mastery score. Your feedback and
              reflections are inside each investigation.
            </p>
          </section>
        )}

        <footer className={s.footer}>
          <span className={s.footerBrand}>
            EDRION <span>/</span> LITTLE EXPERIMENTS. LASTING QUESTIONS.
          </span>
          <span role="status">
            {notice ||
              (ready
                ? 'Progress stays in this browser, on this device.'
                : 'Finding your place…')}
          </span>
        </footer>
      </main>
    </div>
  );
}
