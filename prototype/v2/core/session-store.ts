import {
  initial,
  restore,
  isTopic,
  namedAnchors,
  TOPICS,
  type Simulation,
  type Topic,
} from '../simulations/runtime';
import { emptyScene, type Scene } from './scene-ir';
import { restoreScene } from './scene-compiler';
import type { Evidence } from './teacher-policy';
import { freshGuide, hooks, lessonModel, type GuidedState } from './teaching';
export interface ToolEvent {
  at: number;
  kind: string;
  before: string;
  after: string;
  detail: string;
}
export interface LessonSession {
  skill: string;
  sim: Simulation;
  scene: Scene;
  evidence: Evidence[];
  caption: string;
  captionSource?: 'prepared' | 'ai';
  followup: string;
  activeQuestion: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  events: ToolEvent[];
  revision: number;
  guide: GuidedState;
}
export interface Session {
  version: 2;
  active: Topic;
  mode: 'classic' | 'world';
  topics: Partial<Record<Topic, LessonSession>>;
}
export function lesson(id: Topic): LessonSession {
  return {
    skill: '',
    sim: lessonModel(id),
    scene: emptyScene(),
    evidence: [],
    caption: hooks[id],
    followup: '',
    activeQuestion: '',
    history: [],
    events: [],
    revision: 0,
    guide: freshGuide(),
  };
}
export function freshSession(): Session {
  return {
    version: 2,
    active: 'neural',
    mode: 'classic',
    topics: { neural: lesson('neural') },
  };
}
export function hash(value: unknown): string {
  let h = 2166136261;
  for (const c of JSON.stringify(value)) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function logChange(
  old: LessonSession,
  next: LessonSession,
  kind: string,
  detail: string,
): LessonSession {
  return {
    ...next,
    revision: old.revision + 1,
    events: [
      ...old.events,
      {
        at: Date.now(),
        kind,
        before: hash({ sim: old.sim, scene: old.scene }),
        after: hash({ sim: next.sim, scene: next.scene }),
        detail: detail.slice(0, 400),
      },
    ].slice(-200),
  };
}
export function parseSession(raw: string): Session {
  if (raw.length > 500000) throw Error('Session is too large');
  const s = JSON.parse(raw) as Session;
  if (
    s.version !== 2 ||
    !isTopic(s.active) ||
    !['classic', 'world'].includes(s.mode) ||
    !s.topics ||
    typeof s.topics !== 'object'
  )
    throw Error('Unsupported session.');
  const topics: Session['topics'] = {};
  for (const id of TOPICS) {
    const t = s.topics[id];
    if (!t) continue;
    const sim = restore(t.sim);
    if (sim.id !== id) throw Error('Topic mismatch');
    if (
      typeof t.caption !== 'string' ||
      t.caption.length > 3000 ||
      typeof t.followup !== 'string' ||
      t.followup.length > 1000 ||
      !Array.isArray(t.history) ||
      t.history.length > 40 ||
      !Array.isArray(t.evidence) ||
      t.evidence.length > 100 ||
      !Array.isArray(t.events) ||
      t.events.length > 200
    )
      throw Error('Invalid teaching memory.');
    topics[id] = {
      ...lesson(id),
      ...t,
      sim,
      scene: restoreScene(t.scene, namedAnchors(sim)),
      revision: Number.isInteger(t.revision) ? t.revision : 0,
      guide:
        t.guide &&
        [
          'ORIENT',
          'EXPLAIN',
          'DEMONSTRATE',
          'PREDICT',
          'OBSERVE_RESPONSE',
          'RETEACH_OR_EXTEND',
          'TRANSFER_CHECK',
          'EXPLORE',
        ].includes(t.guide.phase)
          ? { ...freshGuide(), ...t.guide, started: t.guide.started === true }
          : freshGuide(),
    };
  }
  return { version: 2, active: s.active, mode: s.mode, topics };
}
export const STORAGE_KEY = 'petros.v2.session';
