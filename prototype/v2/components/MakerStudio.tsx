'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  changesBetween,
  cloneProject,
  compileScript,
  deletePart,
  duplicatePart,
  initialProject,
  materials,
  newPart,
  PROJECT_STORAGE,
  projectScript,
  reparent,
  shapes,
  starterScripts,
  uniqueId,
  validateProject,
  type Material,
  type Part,
  type Project,
  type Proposal,
  type Shape,
  type Vec3,
} from '../core/maker-project';
import { geometryFacts, projectOBJ } from '../core/maker-geometry';
import { localProposal } from '../core/maker-prompt';
import s from './maker-studio.module.css';
const Scene = dynamic(() => import('./MakerScene'), {
  ssr: false,
  loading: () => <div className={s.canvasNotice}>Opening your workbench…</div>,
});
const fmt = (n: number) =>
  (Number(n.toFixed(2)) || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
type Checkpoint = {
  id: string;
  name: string;
  project: Project;
  prediction: string;
  observation: string;
};
function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Numeric({
  label,
  value,
  onChange,
  min = -1000,
  max = 1000,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      step="any"
      min={min}
      max={max}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const n = Number(draft);
        if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) {
          if (n !== value) onChange(n);
        } else setDraft(String(value));
      }}
    />
  );
}
export function MakerStudio({ canSignOut = false }: { canSignOut?: boolean }) {
  const [history, setHistory] = useState<{
      past: Project[];
      current: Project;
      future: Project[];
    }>(() => ({ past: [], current: initialProject(), future: [] })),
    project = history.current;
  const latest = useRef(project),
    request = useRef<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>('rotor'),
    [ready, setReady] = useState(false),
    [saveState, setSaveState] = useState('Opening project'),
    [notice, setNotice] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null),
    [prompt, setPrompt] = useState(''),
    [busy, setBusy] = useState(false),
    [ai, setAi] = useState<boolean | null>(null),
    [tab, setTab] = useState<'prompt' | 'script' | 'experiments'>('prompt'),
    [script, setScript] = useState(() => projectScript(initialProject()));
  const [mode, setMode] = useState<
      'inspect' | 'translate' | 'rotate' | 'scale'
    >('inspect'),
    [wire, setWire] = useState(false),
    [isolate, setIsolate] = useState(false),
    [section, setSection] = useState(false),
    [snap, setSnap] = useState(true),
    [cameraView, setCameraView] = useState('perspective'),
    [reset, setReset] = useState(0),
    [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [reference, setReference] = useState<Project | null>(null),
    [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]),
    [prediction, setPrediction] = useState(''),
    [observation, setObservation] = useState('');
  const shown = proposal?.project ?? project,
    part = shown.parts.find((p) => p.id === selected) ?? null;
  const facts = useMemo(() => geometryFacts(shown), [shown]),
    baseline = useMemo(
      () => geometryFacts(reference ?? project),
      [reference, project],
    ),
    partFacts = facts.rows.find((p) => p.id === selected);
  latest.current = project;
  const commit = useCallback(
    (next: Project | (() => Project), message = 'Project updated') => {
      try {
        const valid = validateProject(
          typeof next === 'function' ? next() : next,
        );
        request.current?.abort();
        latest.current = valid;
        setHistory((h) => ({
          past: [...h.past, h.current].slice(-40),
          current: valid,
          future: [],
        }));
        setProposal(null);
        setPlaying(false);
        setTime(0);
        setNotice(message);
        setScript(projectScript(valid));
        setSelected((id) =>
          valid.parts.some((p) => p.id === id)
            ? id
            : (valid.parts[0]?.id ?? null),
        );
      } catch (e) {
        setNotice(
          e instanceof Error ? e.message : 'The change could not be applied.',
        );
      }
    },
    [],
  );
  const travel = useCallback((direction: 'undo' | 'redo') => {
    request.current?.abort();
    setProposal(null);
    setPlaying(false);
    setTime(0);
    setHistory((h) => {
      const target = direction === 'undo' ? h.past.at(-1) : h.future[0];
      if (!target) return h;
      latest.current = target;
      setScript(projectScript(target));
      setSelected((id) =>
        target.parts.some((p) => p.id === id)
          ? id
          : (target.parts[0]?.id ?? null),
      );
      return direction === 'undo'
        ? {
            past: h.past.slice(0, -1),
            current: target,
            future: [h.current, ...h.future],
          }
        : {
            past: [...h.past, h.current],
            current: target,
            future: h.future.slice(1),
          };
    });
    setNotice(
      direction === 'undo' ? 'Previous project restored.' : 'Change restored.',
    );
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE);
      if (raw) {
        const saved = JSON.parse(raw),
          restored = validateProject(saved.project);
        setHistory({ past: [], current: restored, future: [] });
        latest.current = restored;
        setScript(projectScript(restored));
        setSelected(restored.parts[0]?.id ?? null);
        if (saved.reference) setReference(validateProject(saved.reference));
        if (Array.isArray(saved.checkpoints))
          setCheckpoints(
            saved.checkpoints.slice(-12).flatMap((c: Checkpoint) => {
              try {
                return typeof c.id === 'string' &&
                  typeof c.name === 'string' &&
                  typeof c.prediction === 'string' &&
                  typeof c.observation === 'string'
                  ? [{ ...c, project: validateProject(c.project) }]
                  : [];
              } catch {
                return [];
              }
            }),
          );
      }
    } catch {
      setNotice(
        'The saved project could not be read. A fresh editable project is open.',
      );
    }
    setReady(true);
    const controller = new AbortController();
    fetch('/prototype/api/status', { signal: controller.signal })
      .then((r) => r.json())
      .then((status) => setAi(status.maker === true))
      .catch(() => setAi(false));
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaveState('Saving…');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          PROJECT_STORAGE,
          JSON.stringify({ project, reference, checkpoints }),
        );
        setSaveState('Saved on this device');
      } catch {
        setSaveState('Not saved · export to keep your work');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [project, reference, checkpoints, ready]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= 10) {
          setPlaying(false);
          return 10;
        }
        return next;
      });
    }, 33);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable]',
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        travel(e.shiftKey ? 'redo' : 'undo');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [travel]);
  const update = (patch: Partial<Part>) => {
    if (!part) return;
    commit(
      {
        ...project,
        parts: project.parts.map((p) =>
          p.id === part.id ? { ...p, ...patch } : p,
        ),
      },
      `${part.id} updated.`,
    );
  };
  const vector = (
    key: 'size' | 'position' | 'rotation',
    index: number,
    value: number,
  ) => {
    if (!part) return;
    const v = [...part[key]] as Vec3;
    v[index] = value;
    update({ [key]: v });
  };
  const add = (shape: Shape) => {
    const next = cloneProject(project),
      p = newPart(shape, uniqueId(project, shape));
    p.position = [90, 20, 0];
    next.parts.push(p);
    commit(next, `${p.id} added. Move, shape or attach it to another part.`);
    setSelected(p.id);
    setMode('translate');
  };
  const preview = (p: Proposal) => {
    setProposal({ ...p, project: validateProject(p.project) });
    setPlaying(false);
    setTime(0);
    setMode('inspect');
    setNotice('Previewing proposed changes. Apply to keep them, or discard.');
    setReset((n) => n + 1);
  };
  const ask = async () => {
    if (!prompt.trim() || busy) return;
    request.current?.abort();
    setNotice('');
    try {
      const local = localProposal(project, selected, prompt);
      if (local) {
        preview(local);
        return;
      }
      if (!ai) {
        setNotice(
          'Generative prompts are unavailable here. Try a precise command such as “set rotor rpm to 45”, use the inspector, or write a build script.',
        );
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      const submitted = JSON.stringify(project);
      setBusy(true);
      const response = await fetch('/prototype/api/maker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, prompt, selected }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error ?? 'The prompt could not be completed.');
      if (JSON.stringify(latest.current) !== submitted)
        throw Error(
          'The project changed while the prompt was running. Please submit again.',
        );
      preview(result);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError')
        setNotice('Prompt cancelled. Your project is unchanged.');
      else
        setNotice(
          e instanceof Error ? e.message : 'The prompt could not be completed.',
        );
    } finally {
      setBusy(false);
    }
  };
  const loadStarter = (name: keyof typeof starterScripts) => {
    commit(
      compileScript(
        starterScripts[name],
        name === 'fan'
          ? 'Kinetic desk fan'
          : name === 'arm'
            ? 'Articulated arm'
            : 'Untitled invention',
      ),
      'Editable project opened. Undo returns to your previous project.',
    );
    setReference(null);
    setReset((n) => n + 1);
  };
  const fail = useCallback(() => setFailed(true), []);
  const saveExperiment = () => {
    if (!prediction.trim() || !observation.trim()) return;
    setCheckpoints((c) =>
      [
        ...c,
        {
          id: crypto.randomUUID(),
          name: `${project.title} · revision ${c.length + 1}`,
          project: cloneProject(project),
          prediction: prediction.trim(),
          observation: observation.trim(),
        },
      ].slice(-12),
    );
    setNotice('Experiment saved with its complete editable assembly.');
    setPrediction('');
    setObservation('');
  };
  const select = (id: string) => {
    setSelected(id);
    setPlaying(false);
    setTime(0);
  };
  return (
    <main className={s.studio} data-testid="maker-studio" data-ready={ready}>
      <header className={s.header}>
        <a href="/prototype" className={s.brand}>
          <span>p.</span>petros <small>/ workshop</small>
        </a>
        <div className={s.title}>
          <input
            aria-label="Project title"
            value={project.title}
            maxLength={100}
            onChange={(e) =>
              commit({ ...project, title: e.target.value }, 'Project renamed.')
            }
          />
          <span>{saveState}</span>
        </div>
        <nav>
          <a href="/prototype?view=2d">2D investigations ↗</a>
          <button
            onClick={() =>
              download(
                `${project.title.replace(/[^a-z0-9]+/gi, '-')}.json`,
                JSON.stringify(project, null, 2),
                'application/json',
              )
            }
          >
            Save project ↓
          </button>
          <button
            onClick={() => download('petros-assembly.obj', projectOBJ(project))}
          >
            Export OBJ ↓
          </button>
          {canSignOut && (
            <form action="/prototype/api/logout" method="post">
              <button>Sign out</button>
            </form>
          )}
        </nav>
      </header>
      <div className={s.commandBar}>
        <div>
          <strong>Build something you can question.</strong>
          <span>Make · inspect · change · test</span>
        </div>
        <div>
          <button
            disabled={!history.past.length || !!proposal}
            onClick={() => travel('undo')}
          >
            ↶ Undo
          </button>
          <button
            disabled={!history.future.length || !!proposal}
            onClick={() => travel('redo')}
          >
            ↷ Redo
          </button>
          <button onClick={() => file.current?.click()}>Open project</button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                if (f.size > 250000)
                  throw Error('Project files must be under 250 KB.');
                commit(
                  validateProject(JSON.parse(await f.text())),
                  'Project imported.',
                );
                setReset((n) => n + 1);
              } catch (error) {
                setNotice(
                  error instanceof Error ? error.message : 'Invalid project.',
                );
              }
              e.target.value = '';
            }}
          />
          <button className={s.newButton} onClick={() => loadStarter('blank')}>
            ＋ New project
          </button>
        </div>
      </div>
      <div className={s.layout}>
        <aside className={s.partsPanel}>
          <div className={s.panelHeading}>
            <span>ASSEMBLY</span>
            <small>{shown.parts.length} / 64 parts</small>
          </div>
          <p className={s.quiet}>Every part is yours to change.</p>
          <div className={s.parts} role="group" aria-label="Assembly parts">
            {shown.parts.map((p) => (
              <button
                key={p.id}
                aria-pressed={selected === p.id}
                onClick={() => select(p.id)}
                style={{ paddingLeft: p.parent ? 25 : 12 }}
              >
                <span className={s.partIcon}>
                  {p.shape === 'sphere'
                    ? '○'
                    : p.shape === 'gear'
                      ? '⚙'
                      : p.shape === 'cylinder'
                        ? '⊙'
                        : '◇'}
                </span>
                <span>
                  <strong>{p.id}</strong>
                  <small>
                    {p.parent ? `attached to ${p.parent}` : p.shape}
                  </small>
                </span>
                {p.motion !== 'none' && <i title="Driven motion">↻</i>}
              </button>
            ))}
            {!shown.parts.length && (
              <p className={s.empty}>
                An open canvas. Add your first part below.
              </p>
            )}
          </div>
          <fieldset
            disabled={!!proposal || shown.parts.length >= 64}
            className={s.addParts}
          >
            <legend>ADD A PART</legend>
            {shapes.map((shape) => (
              <button key={shape} onClick={() => add(shape)}>
                ＋ {shape}
              </button>
            ))}
          </fieldset>
          <details className={s.starters}>
            <summary>Start from an editable assembly</summary>
            <p>
              Starting points, not locked lessons. Every part, dimension and
              joint can change.
            </p>
            <button onClick={() => loadStarter('fan')}>Kinetic fan ↗</button>
            <button onClick={() => loadStarter('arm')}>
              Articulated arm ↗
            </button>
          </details>
          <div className={s.assemblyNote}>
            <span>RELATIONSHIPS MATTER</span>
            <p>
              Attach a part to a pivot. Move the pivot and its children follow.
              Build mechanisms from your own assemblies.
            </p>
          </div>
        </aside>
        <section className={s.center} aria-label="Creation workspace">
          <div className={s.viewport}>
            <div className={s.viewportTop}>
              <div role="group" aria-label="Editing tools">
                {(['inspect', 'translate', 'rotate', 'scale'] as const).map(
                  (v) => (
                    <button
                      key={v}
                      aria-pressed={mode === v}
                      disabled={!!proposal}
                      onClick={() => {
                        setMode(v);
                        setPlaying(false);
                        setTime(0);
                      }}
                    >
                      {v === 'translate'
                        ? 'Move'
                        : v === 'scale'
                          ? 'Resize'
                          : v === 'rotate'
                            ? 'Rotate'
                            : 'Select'}
                    </button>
                  ),
                )}
              </div>
              <button aria-pressed={snap} onClick={() => setSnap(!snap)}>
                Snap {snap ? 'on' : 'off'}
              </button>
            </div>
            <div className={s.canvas}>
              {failed ? (
                <div className={s.canvasNotice}>
                  <h2>The 3D renderer is unavailable.</h2>
                  <p>
                    Your assembly, numeric controls, script and exports still
                    work.
                  </p>
                  <button onClick={() => setFailed(false)}>Retry 3D</button>
                </div>
              ) : (
                <Scene
                  project={shown}
                  selected={selected}
                  time={time}
                  mode={mode}
                  playing={playing}
                  wire={wire}
                  isolate={isolate}
                  section={section}
                  reset={reset}
                  view={cameraView}
                  snap={snap}
                  onSelect={select}
                  onTransform={(p) => commit(p, 'Transform applied.')}
                  onFailure={fail}
                />
              )}
            </div>
            {proposal && (
              <div className={s.previewBanner}>
                <strong>PROPOSAL PREVIEW</strong>
                <span>
                  {changesBetween(project, proposal.project).length} part
                  changes · not applied
                </span>
                <button
                  onClick={() => commit(proposal.project, proposal.summary)}
                >
                  Apply changes
                </button>
                <button
                  onClick={() => {
                    setProposal(null);
                    setNotice('Proposal discarded.');
                  }}
                >
                  Discard
                </button>
              </div>
            )}
            <div className={s.viewportBottom}>
              <div role="group" aria-label="Camera views">
                {['perspective', 'front', 'top', 'side'].map((v) => (
                  <button
                    key={v}
                    aria-pressed={cameraView === v}
                    onClick={() => {
                      setCameraView(v);
                      setReset((n) => n + 1);
                    }}
                  >
                    {v === 'perspective' ? '3D' : v}
                  </button>
                ))}
                <button onClick={() => setReset((n) => n + 1)}>Fit</button>
              </div>
              <div>
                <button aria-pressed={wire} onClick={() => setWire(!wire)}>
                  Mesh
                </button>
                <button
                  aria-pressed={isolate}
                  onClick={() => setIsolate(!isolate)}
                >
                  Isolate
                </button>
                <button
                  aria-pressed={section}
                  onClick={() => setSection(!section)}
                >
                  Section
                </button>
              </div>
            </div>
            <p className={s.viewportHint}>
              {section
                ? 'Section cuts the display only; measurements and exports use complete parts.'
                : 'Click a part to inspect · drag to orbit · scroll to zoom · right-drag to pan'}
            </p>
          </div>
          <div className={s.motionBar}>
            <button
              aria-label={playing ? 'Pause mechanism' : 'Run mechanism'}
              onClick={() => {
                setMode('inspect');
                if (time >= 10) setTime(0);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Ⅱ' : '▶'} {playing ? 'Pause' : 'Test motion'}
            </button>
            <input
              type="range"
              aria-label="Mechanism time"
              min="0"
              max="10"
              step="0.01"
              value={time}
              onChange={(e) => {
                setPlaying(false);
                setTime(+e.target.value);
                setMode('inspect');
              }}
            />
            <output>{time.toFixed(2)} s</output>
            <button
              onClick={() => {
                setPlaying(false);
                setTime(0);
              }}
            >
              Reset
            </button>
          </div>
          <div className={s.motionNotice}>
            Driven joint preview · no collision, airflow or force simulation
          </div>
          <section className={s.creationPanel}>
            <div className={s.tabs} role="group" aria-label="Creation methods">
              {(['prompt', 'script', 'experiments'] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t === 'prompt'
                    ? 'Describe a change'
                    : t === 'script'
                      ? 'Build with code'
                      : 'Experiment record'}
                </button>
              ))}
              <span>
                {ai === null
                  ? 'Checking AI…'
                  : ai
                    ? 'AI connected'
                    : 'Local commands · AI unavailable'}
              </span>
            </div>
            {tab === 'prompt' ? (
              <>
                <div className={s.promptContext}>
                  <span>
                    {selected
                      ? `WORKING WITH / ${selected}`
                      : 'WORKING WITH / whole assembly'}
                  </span>
                  <span>Dimensions in mm</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                  className={s.promptForm}
                >
                  <textarea
                    aria-label="Describe a change"
                    value={prompt}
                    maxLength={1800}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      ai
                        ? 'Build a desk lamp with a hinged arm, then help me understand its range of motion…'
                        : 'Try “make base wider by 20 mm” or “add a cylinder named axle 12 x 80 x 12 mm”'
                    }
                  />
                  <button disabled={busy || !ready || !prompt.trim()}>
                    {busy ? 'Thinking…' : 'Preview change ↗'}
                  </button>
                  {busy && (
                    <button
                      type="button"
                      onClick={() => request.current?.abort()}
                    >
                      Cancel
                    </button>
                  )}
                </form>
                <div className={s.suggestions}>
                  {[
                    'Make base wider by 20 mm',
                    'Spin rotor around z at 45 rpm',
                    'Add a sphere named sensor 20 x 20 x 20 mm',
                  ].map((t) => (
                    <button key={t} onClick={() => setPrompt(t)}>
                      {t} ↗
                    </button>
                  ))}
                </div>
                <p className={s.quiet}>
                  Precise commands run locally. Open-ended requests use AI when
                  connected. Every proposed edit can be inspected before
                  applying.
                </p>
              </>
            ) : tab === 'script' ? (
              <>
                <div className={s.scriptHeading}>
                  <p>Build script · geometry, variables, arrays and joints</p>
                  <button
                    onClick={() => {
                      try {
                        const p = compileScript(script, project.title);
                        p.note = project.note;
                        preview({
                          project: p,
                          summary: 'Build script changes',
                          explanation:
                            'This script defines geometry and parent-relative joints. Variables and radial arrays let you construct new assemblies.',
                          question:
                            'Which parameter controls the feature you want to explore?',
                          source: 'script',
                        });
                      } catch (e) {
                        setNotice(
                          e instanceof Error ? e.message : 'Invalid script.',
                        );
                      }
                    }}
                  >
                    Preview script ↗
                  </button>
                </div>
                <textarea
                  className={s.code}
                  aria-label="Build script"
                  spellCheck={false}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  maxLength={30000}
                />
                <details className={s.syntax}>
                  <summary>Language reference & a parametric example</summary>
                  <p>
                    A bounded construction language, not JavaScript. Preview is
                    atomic: an invalid line changes nothing.
                  </p>
                  <pre>{`let radius = 45\ncylinder hub size 20 15 20 at 0 60 0\nbox spoke size 60 6 8 at 0 0 0\nradial spoke 6 around hub y $radius\nspin hub y 20`}</pre>
                  <p>
                    Shapes: box, sphere, cylinder, cone, tube, gear. Properties:
                    size W H D; at X Y Z; rotate RX RY RZ; color #hex; material
                    polymer/aluminium/steel/wood; teeth N (gear). Attach: attach
                    child to parent. Motion: spin id axis rpm; swing id axis rpm
                    amplitude. Attachments in scripts use parent-relative
                    coordinates. Manual edits regenerate the script from the
                    resulting parts.
                  </p>
                </details>
              </>
            ) : (
              <>
                <div className={s.experimentTop}>
                  <h3>Change a condition. Keep the evidence.</h3>
                  <button
                    onClick={() => {
                      setReference(cloneProject(project));
                      setNotice(
                        'Reference pinned. Measurements now show changes against this assembly.',
                      );
                    }}
                  >
                    Pin current as reference
                  </button>
                  {reference && (
                    <button onClick={() => setReference(null)}>
                      Clear reference
                    </button>
                  )}
                </div>
                <div className={s.writings}>
                  <label>
                    Prediction
                    <textarea
                      aria-label="Experiment prediction"
                      value={prediction}
                      maxLength={2000}
                      onChange={(e) => setPrediction(e.target.value)}
                      placeholder="If I make the blades longer, I expect…"
                    />
                  </label>
                  <label>
                    Observation & explanation
                    <textarea
                      aria-label="Experiment observation"
                      value={observation}
                      maxLength={4000}
                      onChange={(e) => setObservation(e.target.value)}
                      placeholder="I changed… The measurement or motion shows…"
                    />
                  </label>
                </div>
                <button
                  className={s.primary}
                  disabled={!prediction.trim() || !observation.trim()}
                  onClick={saveExperiment}
                >
                  Save editable experiment
                </button>
                <p className={s.quiet}>
                  Up to 12 local snapshots. No automatic grading or mastery
                  claim.
                </p>
                {checkpoints.map((c) => (
                  <details key={c.id} className={s.checkpoint}>
                    <summary>{c.name}</summary>
                    <p>{c.prediction}</p>
                    <p>{c.observation}</p>
                    <button
                      onClick={() => {
                        commit(c.project, 'Experiment reopened.');
                        setReset((n) => n + 1);
                      }}
                    >
                      Reopen assembly
                    </button>
                    <button
                      onClick={() =>
                        download(
                          'petros-experiment.json',
                          JSON.stringify(c, null, 2),
                          'application/json',
                        )
                      }
                    >
                      Export record
                    </button>
                  </details>
                ))}
              </>
            )}
            {proposal && (
              <div className={s.proposal}>
                <div>
                  <span>
                    {proposal.source === 'ai'
                      ? 'AI PROPOSAL'
                      : proposal.source === 'script'
                        ? 'SCRIPT PREVIEW'
                        : 'LOCAL COMMAND'}
                  </span>
                  <h3>{proposal.summary}</h3>
                  <p>{proposal.explanation}</p>
                  <strong>{proposal.question}</strong>
                </div>
                <ul>
                  {changesBetween(project, proposal.project).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                  {!changesBetween(project, proposal.project).length && (
                    <li>No geometry changes proposed.</li>
                  )}
                </ul>
              </div>
            )}
          </section>
          <p className={s.notice} role="status">
            {notice}
          </p>
        </section>
        <aside className={s.inspector} aria-label="Part inspector">
          <div className={s.panelHeading}>
            <span>INSPECT & SHAPE</span>
            <small>{part?.shape ?? 'project'}</small>
          </div>
          {part ? (
            <>
              <div className={s.selectedHeading}>
                <h2>{part.id}</h2>
                <span>
                  {part.parent
                    ? `Moves with ${part.parent}`
                    : 'World coordinates'}
                </span>
              </div>
              <fieldset disabled={!!proposal}>
                <legend className={s.srOnly}>Edit selected part</legend>
                <label className={s.selectLabel}>
                  Geometry
                  <select
                    aria-label="Part shape"
                    value={part.shape}
                    onChange={(e) => update({ shape: e.target.value as Shape })}
                  >
                    {shapes.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {(['size', 'position', 'rotation'] as const).map((key) => (
                  <div className={s.vector} key={key}>
                    <label>
                      {key === 'size'
                        ? 'Dimensions / mm'
                        : key === 'position'
                          ? 'Position / mm'
                          : 'Rotation / degrees'}
                    </label>
                    <div>
                      {['x', 'y', 'z'].map((axis, i) => (
                        <label key={axis}>
                          <span>
                            {key === 'size'
                              ? ['W', 'H', 'D'][i]
                              : axis.toUpperCase()}
                          </span>
                          <Numeric
                            label={`${part.id} ${key} ${axis}`}
                            value={part[key][i]}
                            min={
                              key === 'size'
                                ? 1
                                : key === 'position'
                                  ? -1000
                                  : -360
                            }
                            max={
                              key === 'size'
                                ? 500
                                : key === 'position'
                                  ? 1000
                                  : 360
                            }
                            onChange={(n) => vector(key, i, n)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <label className={s.selectLabel}>
                  Material
                  <select
                    aria-label="Part material"
                    value={part.material}
                    onChange={(e) =>
                      update({ material: e.target.value as Material })
                    }
                  >
                    {Object.keys(materials).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className={s.color}>
                  Colour
                  <input
                    type="color"
                    aria-label="Part colour"
                    value={part.color}
                    onChange={(e) => update({ color: e.target.value })}
                  />
                </label>
                {part.shape === 'gear' && (
                  <label className={s.selectLabel}>
                    Teeth
                    <Numeric
                      label="Gear teeth"
                      value={part.teeth}
                      min={6}
                      max={40}
                      onChange={(n) => update({ teeth: n })}
                    />
                  </label>
                )}
                <label className={s.selectLabel}>
                  Attach to
                  <select
                    aria-label="Attach selected part"
                    value={part.parent ?? 'world'}
                    onChange={(e) => {
                      try {
                        commit(
                          reparent(
                            project,
                            part.id,
                            e.target.value === 'world' ? null : e.target.value,
                          ),
                          'Attachment updated; world position preserved.',
                        );
                      } catch (error) {
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : 'Invalid attachment.',
                        );
                      }
                    }}
                  >
                    <option value="world">World (independent)</option>
                    {project.parts
                      .filter((p) => p.id !== part.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id}
                        </option>
                      ))}
                  </select>
                </label>
                <div className={s.joint}>
                  <span>DRIVEN JOINT</span>
                  <select
                    aria-label="Joint motion"
                    value={part.motion}
                    onChange={(e) =>
                      update({ motion: e.target.value as Part['motion'] })
                    }
                  >
                    <option value="none">Stationary</option>
                    <option value="spin">Continuous rotation</option>
                    <option value="swing">Oscillating hinge</option>
                  </select>
                  {part.motion !== 'none' && (
                    <>
                      <div className={s.jointFields}>
                        <label>
                          Axis
                          <select
                            aria-label="Joint axis"
                            value={part.axis}
                            onChange={(e) =>
                              update({ axis: e.target.value as Part['axis'] })
                            }
                          >
                            {['x', 'y', 'z'].map((a) => (
                              <option key={a}>{a}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          RPM
                          <Numeric
                            label="Joint RPM"
                            value={part.rpm}
                            min={-180}
                            max={180}
                            onChange={(n) => update({ rpm: n })}
                          />
                        </label>
                      </div>
                      {part.motion === 'swing' && (
                        <label>
                          Amplitude / degrees
                          <Numeric
                            label="Swing amplitude"
                            value={part.amplitude}
                            min={0}
                            max={180}
                            onChange={(n) => update({ amplitude: n })}
                          />
                        </label>
                      )}
                      <p>
                        Pivot: this part’s origin. Attached descendants inherit
                        its motion.
                      </p>
                    </>
                  )}
                </div>
                <div className={s.partActions}>
                  <button
                    onClick={() =>
                      commit(
                        () => duplicatePart(project, part.id),
                        'Part duplicated.',
                      )
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() =>
                      commit(
                        () => deletePart(project, part.id),
                        'Part removed; children kept in place. Undo restores it.',
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </fieldset>
              <div className={s.partFacts}>
                <span>SELECTED PART</span>
                <p>
                  Volume{' '}
                  <strong>{fmt((partFacts?.volume ?? 0) / 1000)} cm³</strong>
                </p>
                <p>
                  Estimated mass <strong>{fmt(partFacts?.mass ?? 0)} g</strong>
                </p>
                <p>
                  Material density{' '}
                  <strong>{materials[part.material].density} g/cm³</strong>
                </p>
              </div>
            </>
          ) : (
            <div className={s.empty}>
              Select a part in the scene or assembly list to change its
              geometry, relationships and motion.
            </div>
          )}
          <section className={s.projectFacts}>
            <span>ASSEMBLY / REST POSE</span>
            <div>
              <small>Total material mass</small>
              <strong>
                {fmt(facts.mass)} <small>g</small>
              </strong>
              {(reference || proposal) && (
                <em>
                  Δ {fmt(facts.mass - baseline.mass)} g against{' '}
                  {reference ? 'reference' : 'current project'}
                </em>
              )}
            </div>
            <p>
              Bounds <strong>{facts.size.map(fmt).join(' × ')} mm</strong>
            </p>
            <p>
              Mass centre (x, y, z){' '}
              <strong>{facts.center.map(fmt).join(' · ')} mm</strong>
            </p>
            <small>
              Uniform materials; mesh-based volumes. Overlapping parts are
              counted separately. These measurements do not predict strength or
              motor load.
            </small>
          </section>
          <details className={s.learning}>
            <summary>What can I learn from this?</summary>
            <p>
              <b>Geometry:</b> change one dimension and compare volume and mass.
              Why does scaling all three dimensions have a different effect?
            </p>
            <p>
              <b>Mechanisms:</b> move a pivot, attach another part, then scrub
              time. Which coordinates stay fixed relative to the parent?
            </p>
            <p>
              <b>Design:</b> set a target, such as a lighter assembly with the
              same span. Pin a reference and justify your changes.
            </p>
            <p>
              Gears here are editable geometry. Meshing, collisions and force
              transmission are not solved.
            </p>
          </details>
        </aside>
      </div>
      <footer className={s.footer}>
        <span>AN EDITABLE PROJECT, NOT A FINISHED ANSWER.</span>
        <span>mm · Y up · local autosave · 40-step undo</span>
      </footer>
    </main>
  );
}
