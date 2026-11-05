import {
  initial,
  setParams,
  step,
  brake,
  observe,
  attentionOf,
  isTopic,
  type Topic,
  type Simulation,
} from '../simulations/runtime';

export const INVESTIGATION_VERSION = 1;
export const INVESTIGATION_STORAGE = 'petros.investigations.v1';
export type Choice = { id: string; text: string; feedback: string };
export type Pair = { reference: Simulation; changed: Simulation };
export type Measurement = {
  id: string;
  label: string;
  unit: string;
  reference: number;
  changed: number;
};
export type Investigation = {
  id: string;
  topic: Topic;
  caseIndex: number;
  title: string;
  subtitle: string;
  objective: string;
  question: string;
  change: string;
  held: string;
  focus: string;
  hint: string;
  takeaway: string;
  mechanism: string[];
  limitation: string;
  prediction: Choice[];
  correctPrediction: string;
  reasons: Choice[];
  correctReason: string;
  frames: Pair[];
  measures: Measurement[];
  duration: number;
  playbackLabel: string;
};
const f = (n: number, places = 2) => Number(n.toFixed(places)).toString();
const direction = (a: number, b: number) =>
  Math.abs(b - a) < 1e-7 ? 'same' : b < a ? 'less' : 'more';
const choices = (labels: string[]): Choice[] =>
  ['less', 'more', 'same'].map((id, i) => ({
    id,
    text: labels[i],
    feedback:
      'Compare the reference and changed measurements. Follow the marked quantity, rather than the size of the drawing.',
  }));
const reason = (id: string, text: string, feedback: string): Choice => ({
  id,
  text,
  feedback,
});
const measure = (
  id: string,
  label: string,
  unit: string,
  reference: number,
  changed: number,
): Measurement => ({ id, label, unit, reference, changed });

/** The lesson and its diagrams share computed experiments, never a model's guessed answer. */
export function buildInvestigation(topic: Topic, caseIndex = 0): Investigation {
  if (
    !isTopic(topic) ||
    !Number.isInteger(caseIndex) ||
    caseIndex < 0 ||
    caseIndex > 2
  )
    throw Error('Unknown investigation.');
  let frames: Pair[] = [],
    measures: Measurement[] = [];
  const common = { id: `${topic}:${caseIndex}:v1`, topic, caseIndex };
  if (topic === 'neural') {
    const x = [2, -2, 3][caseIndex],
      weight = [0.5, 0.5, 1.2][caseIndex],
      target = [4, 4, 3][caseIndex];
    const reference = initial('neural', {
      model: 'linear',
      x1: x,
      weight,
      target,
      learningRate: 0.1,
    });
    frames = Array.from({ length: 25 }, (_, i) => ({
      reference,
      changed: setParams(reference, { weight: weight + (0.6 * i) / 24 }),
    }));
    const final = frames.at(-1)!,
      a = observe(reference),
      b = observe(final.changed);
    const da = Math.abs(+a.prediction - target),
      db = Math.abs(+b.prediction - target);
    measures = [
      measure('prediction', 'Prediction', '', +a.prediction, +b.prediction),
      measure('error', 'Distance to target', '', da, db),
      measure('loss', 'Squared-error loss', '', +a.loss, +b.loss),
    ];
    const why = x < 0 ? 'negative' : caseIndex === 2 ? 'overshoot' : 'positive';
    return {
      ...common,
      frames,
      measures,
      duration: 0,
      playbackLabel: 'Weight sweep · not training time',
      title: 'Can a mistake teach a machine?',
      subtitle: 'Follow the error, not just the moving numbers.',
      objective: 'Use the input and target to choose a helpful weight change.',
      question: `If the weight increases from ${f(weight)} to ${f(weight + 0.6)}, will the prediction move closer to ${target}?`,
      change: `Weight ${f(weight)} → ${f(weight + 0.6)}`,
      held: `Input ${x} · target ${target}`,
      focus: 'Distance to target',
      hint: `Prediction = input × weight. First work out whether a larger weight moves the prediction up or down when the input is ${x}. Then compare with ${target}.`,
      prediction: choices([
        'Closer to the target',
        'Farther from the target',
        'The same distance',
      ]),
      correctPrediction: direction(da, db),
      reasons: [
        reason(
          'positive',
          'A positive input moves the prediction upward, toward this target.',
          'A positive input moves the prediction upward. But check whether the target is still ahead of it.',
        ),
        reason(
          'negative',
          'A negative input makes the larger weight push the prediction downward.',
          'The sign of the input decides the direction of the prediction change.',
        ),
        reason(
          'overshoot',
          'The prediction is already above the target; increasing it adds error.',
          'Locate both prediction markers relative to the target. Passing the target changes which direction helps.',
        ),
      ],
      correctReason: why,
      takeaway:
        'A helpful weight change depends on the input and the error. “Increase the weight” is not a universal learning rule.',
      mechanism: [
        `Input × weight: ${x} × ${f(weight)} = ${f(+a.prediction)}.`,
        `With the new weight: ${x} × ${f(weight + 0.6)} = ${f(+b.prediction)}.`,
        `Distance to target changes from ${f(da)} to ${f(db)}; loss changes from ${f(+a.loss)} to ${f(+b.loss)}.`,
      ],
      limitation:
        'A single linear connection, manually adjusted. This experiment does not demonstrate training or generalisation.',
    };
  }
  if (topic === 'rocket') {
    const duration = [1, 2.5, 1][caseIndex],
      dryMass = caseIndex === 2 ? 2400 : 1000;
    let reference = initial('rocket', { throttle: 0.6, dryMass }),
      changed = setParams(reference, { throttle: 1 });
    frames = [{ reference, changed }];
    for (let i = 0; i < 24; i++) {
      reference = step(reference, duration / 24);
      changed = step(changed, duration / 24);
      frames.push({ reference, changed });
    }
    const a = observe(reference),
      b = observe(changed);
    measures = [
      measure('velocity', 'Vertical velocity', 'm/s', +a.velocity, +b.velocity),
      measure('altitude', 'Height above pad', 'm', +a.altitude, +b.altitude),
      measure(
        'acceleration',
        'Acceleration',
        'm/s²',
        +a.acceleration,
        +b.acceleration,
      ),
    ];
    const why =
      +b.acceleration < 0 ? 'heavy' : +b.velocity < 0 ? 'gradual' : 'reversed';
    return {
      ...common,
      frames,
      measures,
      duration,
      playbackLabel: `${duration} seconds of computed flight`,
      title: 'Does firing upward mean moving upward?',
      subtitle: 'Separate where it is going from how its motion changes.',
      objective:
        'Distinguish acceleration from velocity using a controlled flight comparison.',
      question: `We increase thrust from 60% to 100%. After ${duration} ${duration === 1 ? 'second' : 'seconds'}, which way will the rocket be moving?`,
      change: 'Thrust 60% → 100%',
      held: `Mass starts at ${dryMass + 450} kg · falling at 12 m/s`,
      focus: 'Vertical velocity',
      prediction: choices([
        'Still falling',
        'Moving upward',
        'Instantly stationary',
      ]),
      correctPrediction: direction(0, +b.velocity),
      hint: 'An upward acceleration changes a downward velocity gradually. Compare the starting velocity with how much the engine can change it during this interval.',
      reasons: [
        reason(
          'gradual',
          'Upward acceleration has slowed the fall, but has not yet reversed it.',
          'Check the velocity sign: negative means the rocket is still falling, even with upward acceleration.',
        ),
        reason(
          'reversed',
          'The upward acceleration has acted long enough to reverse the fall.',
          'This requires the velocity to cross zero. An upward flame alone is not evidence.',
        ),
        reason(
          'heavy',
          'At this mass, even full thrust is smaller than the gravitational force.',
          'Compare thrust / mass with gravity; full throttle is a setting, not a guarantee of upward acceleration.',
        ),
      ],
      correctReason: why,
      takeaway:
        'Thrust changes acceleration; velocity changes over time. Full power does not instantly reverse a fall.',
      mechanism: [
        `Both rockets start at 120 m with velocity −12 m/s. Only throttle changes.`,
        `At ${duration} s, the reference velocity is ${f(+a.velocity)} m/s; full thrust gives ${f(+b.velocity)} m/s.`,
        `The changed rocket has acceleration ${f(+b.acceleration)} m/s² and altitude ${f(+b.altitude)} m. The signs answer different questions.`,
      ],
      limitation:
        'Vertical motion with fuel consumption. No drag, rotation or landing guidance; this is not a safe-landing demonstration.',
    };
  }
  if (topic === 'attention') {
    const query = [1, 1, 4][caseIndex],
      causal = caseIndex === 1;
    const reference = initial('attention', { query, causal }),
      changed = setParams(reference, { causal: !causal });
    frames = [
      { reference, changed: reference },
      { reference, changed },
    ];
    const a = attentionOf(reference).weights[query],
      b = attentionOf(changed).weights[query];
    const futureA = a.slice(query + 1).reduce((s, n) => s + n, 0),
      futureB = b.slice(query + 1).reduce((s, n) => s + n, 0);
    measures = [
      measure(
        'future',
        'Share to later words',
        '%',
        futureA * 100,
        futureB * 100,
      ),
      measure(
        'self',
        'Share to query itself',
        '%',
        a[query] * 100,
        b[query] * 100,
      ),
      measure(
        'total',
        'Total attention',
        '%',
        100 * a.reduce((s, n) => s + n, 0),
        100 * b.reduce((s, n) => s + n, 0),
      ),
    ];
    return {
      ...common,
      frames,
      measures,
      duration: 0,
      playbackLabel: 'Discrete mask change · no physical time',
      title: 'What is a word allowed to see?',
      subtitle: 'A connection can be strong. Or it can be impossible.',
      objective:
        'Distinguish masking from learned or computed attention strength.',
      question: `For “${attentionOf(reference).tokens[query]}”, what happens to the total share sent to later words when we turn the causal mask ${causal ? 'off' : 'on'}?`,
      change: `Causal mask ${causal ? 'on → off' : 'off → on'}`,
      held: `Same five words · query position ${query + 1} · same vectors`,
      focus: 'Share to later words',
      prediction: choices([
        'It decreases',
        'It increases',
        'It stays the same',
      ]),
      correctPrediction: direction(futureA, futureB),
      hint: 'Mark the words after the query. A causal mask blocks those positions before softmax. Are there any later positions in this case?',
      reasons: [
        reason(
          'blocked',
          'Later positions become ineligible; the remaining weights are renormalised.',
          'Masking is applied before softmax. It removes eligibility, not just a little attention.',
        ),
        reason(
          'opened',
          'Later positions become eligible and receive a positive softmax share.',
          'Turning a mask off allows connections; it does not remove them.',
        ),
        reason(
          'last',
          'The query is already the last word, so there are no later positions to block.',
          'Check the query position. An unchanged result can reveal a boundary case, rather than a broken model.',
        ),
      ],
      correctReason: caseIndex === 2 ? 'last' : causal ? 'opened' : 'blocked',
      takeaway:
        'The mask decides which positions are eligible. Scores divide attention among those eligible positions.',
      mechanism: [
        `The query is position ${query + 1}: “${attentionOf(reference).tokens[query]}”.`,
        `The total share to later positions changes from ${f(futureA * 100, 1)}% to ${f(futureB * 100, 1)}%.`,
        'Softmax redistributes the eligible weights. Each complete row still totals 100%.',
      ],
      limitation:
        'Deterministic toy vectors with Q = K = V. These weights do not establish word meaning or expose a real language model.',
    };
  }
  if (topic === 'traffic') {
    const count = caseIndex === 1 ? 12 : 20,
      duration = caseIndex === 1 ? 3 : 1.5;
    let reference = step(initial('traffic', { count }), 15),
      changed = brake(reference);
    frames = [{ reference, changed }];
    for (let i = 0; i < 24; i++) {
      reference = step(reference, duration / 24);
      changed = step(changed, duration / 24);
      frames.push({ reference, changed });
    }
    const target = caseIndex === 2 ? 'car_1' : `car_${count - 1}`;
    const car = (s: Simulation) =>
      s.data.traffic!.cars.find((c) => c.id === target)!;
    const a = observe(reference),
      b = observe(changed);
    measures = [
      measure(
        'follower',
        `${caseIndex === 2 ? 'Car ahead' : 'Following car'} speed`,
        'm/s',
        car(reference).speed,
        car(changed).speed,
      ),
      measure('mean', 'Mean traffic speed', 'm/s', +a.meanSpeed, +b.meanSpeed),
      measure('minimum', 'Slowest car', 'm/s', +a.minSpeed, +b.minSpeed),
    ];
    return {
      ...common,
      frames,
      measures,
      duration,
      playbackLabel: `${duration} seconds after the brake tap`,
      title: 'Can one brake travel through traffic?',
      subtitle: 'Follow the disturbance, not just the car.',
      objective:
        'Trace a local braking disturbance through the following relationship.',
      question: `Car 1 taps its brakes. After ${duration} seconds, how does the ${caseIndex === 2 ? 'car immediately ahead' : 'car immediately behind'} compare with the untouched road?`,
      change: 'Car 1 briefly slows to 1 m/s',
      held: `${count} cars · identical road and starting snapshot`,
      focus: caseIndex === 2 ? 'Car ahead speed' : 'Following car speed',
      prediction: choices([
        'It is slower',
        'It is faster',
        'Its speed is unchanged',
      ]),
      correctPrediction: direction(car(reference).speed, car(changed).speed),
      hint: 'Each driver reacts to the car ahead. Trace that relationship from the braking car to the car we are measuring.',
      reasons: [
        reason(
          'follower',
          'The following driver reacts to the changed gap and speed ahead.',
          'Trace who follows whom. Drivers in this model react to the car ahead.',
        ),
        reason(
          'ahead',
          'The car ahead does not directly react to a car braking behind it.',
          'A disturbance is directional. The driver ahead still sees the same leader during this short interval.',
        ),
        reason(
          'all',
          'Every driver senses the brake tap and changes speed immediately.',
          'The model has local following rules, not a broadcast to every car.',
        ),
      ],
      correctReason: caseIndex === 2 ? 'ahead' : 'follower',
      takeaway:
        'A disturbance spreads through local reactions. The cars and the slowdown need not travel in the same direction.',
      mechanism: [
        'Both roads start from the same settled snapshot. Only car 1 receives the brake tap.',
        `After ${duration} s, the marked car is at ${f(car(changed).speed)} m/s, compared with ${f(car(reference).speed)} m/s on the reference road.`,
        'The plotted cars keep their identity across the two runs; follow the marked driver and its leader.',
      ],
      limitation:
        'A one-lane ring using IDM with numerical safety clamps. This short experiment checks local propagation, not a full traffic-wave speed.',
    };
  }
  const from = [0.6, 0.8, 0][caseIndex],
    to = [0.8, 0.6, 0.8][caseIndex],
    duration = caseIndex === 2 ? 20 : 10;
  let reference = initial('relativity', { beta: from, duration }),
    changed = setParams(reference, { beta: to });
  frames = [{ reference, changed }];
  for (let i = 0; i < 24; i++) {
    reference = step(reference, duration / 24);
    changed = step(changed, duration / 24);
    frames.push({ reference, changed });
  }
  const a = observe(reference),
    b = observe(changed);
  measures = [
    measure('proper', 'Ship elapsed time', 's', +a.shipClock, +b.shipClock),
    measure('earth', 'Earth elapsed time', 's', +a.earthClock, +b.earthClock),
    measure('gamma', 'Lorentz factor γ', '', +a.gamma, +b.gamma),
  ];
  return {
    ...common,
    frames,
    measures,
    duration,
    playbackLabel: `${duration} seconds in Earth's frame`,
    title: 'Same interval. Different time?',
    subtitle: 'Choose a frame, then let the clocks tell the story.',
    objective: 'Compare proper times over a fixed Earth-frame interval.',
    question: `Over ${duration} Earth seconds, does a ship at ${to}c record less or more time than one at ${from}c?`,
    change: `Ship speed ${from}c → ${to}c`,
    held: `${duration} Earth seconds · constant velocity in each run`,
    focus: 'Ship elapsed time',
    prediction: choices([
      'Less time on the ship',
      'More time on the ship',
      'The same ship time',
    ]),
    correctPrediction: direction(+a.shipClock, +b.shipClock),
    hint: 'Ship proper time = Earth time / γ. As speed increases, γ increases. The Earth interval stays fixed in both runs.',
    reasons: [
      reason(
        'faster',
        'The higher speed gives a larger γ, so the fixed Earth interval divides into less ship time.',
        'Keep the comparison frame fixed. Higher speed increases γ, not the Earth interval.',
      ),
      reason(
        'slower',
        'The lower speed gives a smaller γ, so more ship time fits into the same Earth interval.',
        'A smaller divisor produces more proper time for this fixed interval.',
      ),
      reason(
        'broken',
        'The moving clock is mechanically running too slowly.',
        'Each clock behaves normally locally. This comparison is about proper time, not a clock malfunction.',
      ),
    ],
    correctReason: to > from ? 'faster' : 'slower',
    takeaway:
      'With the Earth interval fixed, higher constant speed means less ship proper time. The clock is not broken.',
    mechanism: [
      `Reference speed ${from}c gives γ = ${f(+a.gamma, 3)}.`,
      `Changed speed ${to}c gives γ = ${f(+b.gamma, 3)}.`,
      `After ${duration} Earth seconds, ship readings are ${f(+a.shipClock)} s and ${f(+b.shipClock)} s.`,
    ],
    limitation:
      'Inertial special relativity in a named Earth frame. No gravity, acceleration, turnaround or reunion is modelled.',
  };
}

export type Attempt = {
  caseId: string;
  prediction: string;
  reason: string;
  hint: boolean;
  predictionCorrect: boolean;
  reasonCorrect: boolean;
  revisited?: true;
  reflection?: string;
};
export type Progress = {
  caseIndex: number;
  stage: 'predict' | 'observe' | 'explain' | 'reflect';
  prediction: string | null;
  reason: string | null;
  hint: boolean;
  attempts: Attempt[];
};
export type InvestigationSession = {
  version: 1;
  active: Topic;
  topics: Partial<Record<Topic, Progress>>;
};
export const freshProgress = (
  caseIndex = 0,
  attempts: Attempt[] = [],
): Progress => ({
  caseIndex,
  stage: 'predict',
  prediction: null,
  reason: null,
  hint: false,
  attempts,
});
export const freshInvestigationSession = (): InvestigationSession => ({
  version: 1,
  active: 'neural',
  topics: {},
});
export type LearningAction =
  | { type: 'predict'; id: string }
  | { type: 'hint' }
  | { type: 'inspect' }
  | { type: 'explain'; id: string }
  | { type: 'revisit'; caseIndex: number }
  | { type: 'reflect'; text: string }
  | { type: 'next' };
/** State transitions enforce commitment before reveal and record assistance before grading. */
export function advanceInvestigation(
  p: Progress,
  task: Investigation,
  action: LearningAction,
): Progress {
  if (p.caseIndex !== task.caseIndex) return p;
  if (
    action.type === 'revisit' &&
    Number.isInteger(action.caseIndex) &&
    action.caseIndex >= 0 &&
    action.caseIndex < 3 &&
    p.attempts.some((a) => a.caseId === `${task.topic}:${action.caseIndex}:v1`)
  )
    return freshProgress(action.caseIndex, p.attempts);
  if (
    action.type === 'reflect' &&
    p.stage === 'reflect' &&
    p.attempts.at(-1)?.caseId === task.id
  ) {
    return {
      ...p,
      attempts: p.attempts.map((a, i) =>
        i === p.attempts.length - 1
          ? { ...a, reflection: action.text.slice(0, 1000) }
          : a,
      ),
    };
  }
  if (action.type === 'hint' && p.stage !== 'reflect')
    return { ...p, hint: true };
  if (
    action.type === 'predict' &&
    p.stage === 'predict' &&
    task.prediction.some((c) => c.id === action.id)
  )
    return { ...p, prediction: action.id, stage: 'observe' };
  if (action.type === 'inspect' && p.stage === 'observe')
    return { ...p, stage: 'explain' };
  if (
    action.type === 'explain' &&
    p.stage === 'explain' &&
    p.prediction &&
    task.reasons.some((c) => c.id === action.id)
  ) {
    const attempt: Attempt = {
      caseId: task.id,
      prediction: p.prediction,
      reason: action.id,
      hint: p.hint,
      predictionCorrect: p.prediction === task.correctPrediction,
      reasonCorrect: action.id === task.correctReason,
      ...(p.attempts.some((a) => a.caseId === task.id)
        ? { revisited: true as const }
        : {}),
    };
    return {
      ...p,
      reason: action.id,
      stage: 'reflect',
      attempts: retainAttempts([...p.attempts, attempt]),
    };
  }
  if (action.type === 'next' && p.stage === 'reflect' && p.caseIndex < 2)
    return freshProgress(p.caseIndex + 1, p.attempts);
  return p;
}
export function evidenceLabel(a: Attempt) {
  if (!a.reasonCorrect) return 'Revisit the explanation';
  if (a.revisited) return 'Practised after feedback';
  if (!a.predictionCorrect) return 'Revised after observing';
  if (a.hint) return 'Explained with a hint';
  return 'Predicted and explained';
}
/** Keep each case's first evidence and the most recent practice within a bounded record. */
function retainAttempts(attempts: Attempt[]): Attempt[] {
  if (attempts.length <= 30) return attempts;
  const first = new Set<number>();
  const cases = new Set<string>();
  attempts.forEach((attempt, index) => {
    if (!cases.has(attempt.caseId)) first.add(index);
    cases.add(attempt.caseId);
  });
  for (let index = attempts.length - 1; first.size < 30; index--) first.add(index);
  return attempts.filter((_, index) => first.has(index));
}
/** Restore only valid transitions; recompute results rather than trusting saved scores. */
export function parseInvestigationSession(raw: string): InvestigationSession {
  // 5 topics × 30 attempts × 1000 characters, including JSON escaping.
  if (raw.length > 1000000) throw Error('Saved investigation is too large.');
  const s = JSON.parse(raw);
  if (
    s?.version !== 1 ||
    !isTopic(s.active) ||
    !s.topics ||
    typeof s.topics !== 'object'
  )
    throw Error('Invalid investigation.');
  const topics: InvestigationSession['topics'] = {};
  const cases = new Map<string, Investigation>();
  const getCase = (topic: Topic, index: number) => {
    if (!Number.isInteger(index) || index < 0 || index > 2)
      throw Error('Invalid case.');
    const key = `${topic}:${index}`;
    if (!cases.has(key)) cases.set(key, buildInvestigation(topic, index));
    return cases.get(key)!;
  };
  for (const [topic, value] of Object.entries(s.topics)) {
    if (!isTopic(topic) || !value || typeof value !== 'object')
      throw Error('Invalid topic.');
    const p = value as Progress,
      task = getCase(topic, p.caseIndex);
    if (
      !['predict', 'observe', 'explain', 'reflect'].includes(p.stage) ||
      typeof p.hint !== 'boolean' ||
      !Array.isArray(p.attempts) ||
      p.attempts.length > 30
    )
      throw Error('Invalid progress.');
    if (
      p.stage === 'predict'
        ? p.prediction !== null
        : !task.prediction.some((c) => c.id === p.prediction)
    )
      throw Error('Missing prediction.');
    if (
      p.stage === 'reflect'
        ? !task.reasons.some((c) => c.id === p.reason)
        : p.reason !== null
    )
      throw Error('Invalid explanation.');
    const seen = new Set<string>();
    const attempts = p.attempts.map((a) => {
      if (!a || typeof a.caseId !== 'string' || typeof a.hint !== 'boolean')
        throw Error('Invalid evidence.');
      const match = a.caseId.match(
        /^(neural|rocket|attention|traffic|relativity):([0-2]):v1$/,
      );
      if (!match || match[1] !== topic) throw Error('Mismatched evidence.');
      const t = getCase(topic, +match[2]);
      if (
        !t.prediction.some((c) => c.id === a.prediction) ||
        !t.reasons.some((c) => c.id === a.reason)
      )
        throw Error('Invalid answer.');
      if (
        a.reflection !== undefined &&
        (typeof a.reflection !== 'string' || a.reflection.length > 1000)
      )
        throw Error('Invalid reflection.');
      const restored = {
        caseId: t.id,
        prediction: a.prediction,
        reason: a.reason,
        hint: a.hint,
        predictionCorrect: a.prediction === t.correctPrediction,
        reasonCorrect: a.reason === t.correctReason,
        ...(seen.has(t.id) || a.revisited === true
          ? { revisited: true as const }
          : {}),
        ...(a.reflection !== undefined ? { reflection: a.reflection } : {}),
      };
      seen.add(t.id);
      return restored;
    });
    if (
      p.stage === 'reflect' &&
      !(
        attempts.at(-1)?.caseId === task.id &&
        attempts.at(-1)?.prediction === p.prediction &&
        attempts.at(-1)?.reason === p.reason
      )
    )
      throw Error('Missing evidence.');
    topics[topic] = {
      caseIndex: p.caseIndex,
      stage: p.stage,
      prediction: p.prediction,
      reason: p.reason,
      hint: p.hint,
      attempts,
    };
  }
  return { version: 1, active: s.active, topics };
}
