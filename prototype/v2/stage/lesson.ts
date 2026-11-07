import type { ComponentType } from 'react';
import type { Simulation, SimTool } from '../simulations/runtime';
import type { Quality } from '../world-v3/store';
export type V3 = [number, number, number];
/** Neural adapter state. The shell and lesson contracts are generic over state. */
export interface StageState {
  input: number;
  weight: number;
  prediction: number;
  target: number;
  loss: number;
  learningRate: number;
  steps: number;
  history: number[];
}
export interface StagePart<S = StageState> {
  id: string;
  name: string;
  chip: string;
  anchor: (s: S) => V3;
  radius: number;
  boundsPoints?: (s: S) => V3[];
}
export interface StageShot<S = StageState> {
  part: string;
  target: (s: S) => V3;
  distance: number;
  azimuth: number;
  polar: number;
  phoneTarget?: (s: S) => V3;
  phoneDistance?: number;
  fitBounds?: boolean;
  framePoints?: (s: S) => V3[];
}
export interface StageChip<S = StageState> {
  id: string;
  text: string;
  part: string;
  also?: string[];
  answer: (s: S) => string;
  analogy: string;
  demo: string;
  tryLabel: string;
}
export interface StageLabel<S> {
  id: string;
  title: string;
  value: (s: S) => number;
  text?: (s: S) => string;
  placement: 'above' | 'upper' | 'lower' | 'left' | 'right' | 'radial';
  radialFrom?: (s: S) => V3;
  radialEdge?: (s: S) => V3;
  opposite?: string;
  offset?: number;
  sideOnFocus?: boolean | 'right';
  anchorOffset?: V3;
  screenOffset?: [number, number];
  digits?: number;
  unit?: string;
  visible?: (s: S) => boolean;
}
export interface StageAction {
  tool: SimTool;
  args?: Record<string, unknown>;
}
export interface StageDemo<S> {
  delay: number;
  action?: (s: S) => StageAction;
  message?: (s: S, story: boolean) => string;
  highlight?: string;
  control?: boolean;
  focus?: string | null;
  closeCard?: boolean;
}
export interface StageLesson<S = StageState> {
  id: string;
  title: string;
  shortTitle: string;
  nextLessons: string[];
  subtitle: string;
  abstractSubtitle: string;
  eyebrow: string;
  canvasDescription: string;
  story: {
    description: string;
    units: Record<string, string>;
    enabled: (s: S) => boolean;
    fallback: string;
  };
  parts: StagePart<S>[];
  chips: StageChip<S>[];
  shots: StageShot<S>[];
  glossary: Record<string, string>;
  bounds: { min: V3; max: V3 };
  framePoints?: V3[];
  relativeFog?: boolean;
  bloomHeight?: number;
  canvasRegion?: 'hero';
  labelAvoidPoints?: V3[];
  labels: StageLabel<S>[];
  ruler?: {
    align?: 'start' | 'end';
    ticks: (s: S) => number[];
    anchor: (v: number, s: S) => V3;
    visibleFor: string[];
  };
  metric: {
    id: string;
    name: string;
    displayName?: (s: S) => string;
    value: (s: S) => number;
    formula: (s: S) => string;
    history: (s: S) => number[];
    status: (s: S) => string;
    digits?: number;
    unit?: string;
    good?: (s: S) => boolean;
    spark?: boolean;
  };
  parameter: {
    id: string;
    label: string;
    key: string;
    step: number;
    range: [number, number] | ((s: S) => [number, number]);
    value: (s: S) => number;
    display?: (s: S) => string;
    keepRunning?: boolean;
    choices?: (s: S) => { value: number; label: string }[];
    resetFocus?: boolean;
  };
  toggles?: { key: string; label: string; value: (s: S) => boolean }[];
  textControls?: {
    key: string;
    label: string;
    help: string;
    value: (s: S) => string;
    maxLength: number;
  }[];
  extraParameters?: {
    key: string;
    label: string;
    range: [number, number];
    step: number;
    value: (s: S) => number;
    unit: string;
  }[];
  selectControls?: {
    key: string;
    label: string;
    value: (s: S) => string;
    choices: { value: string; label: string }[];
    help: string;
  }[];
  readouts?: { label: string; value: (s: S) => string; part?: string }[];
  train: {
    id: string;
    label: string;
    autoLabel: string;
    stopLabel: string;
    action: StageAction | ((s: S) => StageAction);
    autoAction?: StageAction | ((s: S) => StageAction);
    intervalMs?: number;
    enabled?: (s: S) => boolean;
    resetFocus?: boolean;
    runAfterAction?: boolean;
    rateLabel?: string | ((s: S) => string);
  };
  solved: (s: S) => boolean;
  equation: string[];
  demos: Record<string, StageDemo<S>[] | ((s: S) => StageDemo<S>[])>;
}
export function defineStageLesson<S>(lesson: StageLesson<S>): StageLesson<S> {
  return lesson;
}
export function resolveStageAction<S>(
  action: StageAction | ((s: S) => StageAction),
  state: S,
): StageAction {
  return typeof action === 'function' ? action(state) : action;
}
export interface SpecimenProps<S = StageState> {
  state: S;
  lesson: StageLesson<S>;
  quality: Quality;
  reduced: boolean;
  story: boolean;
  selected: string | null;
  hovered: string | null;
  demo: { id: string; at: number } | null;
  intro: { current: number };
  onPart: (id: string) => void;
  onHover: (id: string | null) => void;
  onAction: (tool: SimTool, args?: Record<string, unknown>) => Promise<void>;
  onDial: (active: boolean) => void;
}
export interface StageAdapter<S = StageState> {
  sim: Simulation;
  state: S;
  lesson: StageLesson<S>;
  Specimen: ComponentType<SpecimenProps<S>>;
}
