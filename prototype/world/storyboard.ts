import type { Lesson, ShowcaseState } from '../teaching/types';
export type WorldPhase =
  | 'arrival'
  | 'library'
  | 'retrieving'
  | 'book'
  | 'teaching'
  | 'practice'
  | 'recap';
export type Preset = 'wide' | 'teaching' | 'interaction';
export interface ScenePresentation {
  phase: WorldPhase;
  preset: Preset;
  reveal: number;
  replay: number;
  skipCamera: number;
  modelAngle: number;
  feedbackEpoch: number;
}
export function greeting(lesson: Lesson | undefined, state: ShowcaseState) {
  if (!lesson) return 'Welcome to my study. What are we curious about today?';
  const topic = lesson.id === 'ai3' ? 'minimax' : lesson.title.toLowerCase();
  return Object.keys(state.completion).length
    ? `Welcome back. We’re learning about ${topic}. Your place is saved right here.`
    : `Welcome! Looks like we’re learning about ${topic} today.`;
}
export function narration(
  lesson: Lesson | undefined,
  state: ShowcaseState,
  scene: ScenePresentation,
) {
  if (scene.phase === 'arrival') return greeting(lesson, state);
  if (scene.phase === 'library')
    return lesson?.module
      ? `Let’s grab your ${lesson.id.startsWith('ai') ? 'AI' : 'EHS'} module first. The highlighted book is your actual source.`
      : 'There are four course modules on the shelf, plus two curiosity notebooks.';
  if (scene.phase === 'retrieving')
    return 'Here’s our source. I’ll bring the book to the reading stand.';
  if (scene.phase === 'book')
    return lesson?.introduction ?? 'Choose a book to open a new idea.';
  if (!lesson) return 'Pick a book from the library and we’ll begin.';
  if (state.lastFeedback)
    return state.lastFeedback.replace(
      /^(Practice feedback|Worked step) · /,
      '',
    );
  const index = lesson.questions.findIndex((q) => q.id === state.questionId);
  const lines: Record<string, string[]> = {
    ai3: [
      'How does AI choose a move when someone else chooses what happens next?',
      'MAX wants the highest score. MIN tries to make that score as small as possible.',
      'Look at MIN A. Which of these two scores will our opponent allow?',
      'Now focus on MIN B. A large leaf is tempting, but who chooses here?',
      'Apply the same idea to MIN C. Compare its actual two leaves.',
      'These are the guarantees of the three branches. Predict what MAX returns.',
      'Which first move would you choose? Select a branch in the actual tree.',
      'What if we didn’t have to inspect every branch? Make a prediction first.',
      'A has set alpha. Watch B’s bound; can its remaining leaf matter?',
      'C’s first value also establishes a bound. Which leaf can we leave untouched?',
      'Let’s step the actual traversal and count only leaves we evaluated.',
      'Tell me why pruning keeps the same decision. Your explanation is recorded, not automatically graded.',
    ],
    ai4: [
      'A knowledge base stores facts and rules. What counts as knowledge here?',
      'TELL adds a fact. Add Bird(Tweety) to our visible knowledge base.',
      'A rule is a connection we can apply when its premise is known.',
      'Match the rule’s x to the actual bird in our fact.',
      'Apply the permitted rule. Watch the conclusion appear only when it has support.',
      'ASK checks what follows. Trace the supporting fact and rule.',
      'Does having wings establish flight? Look carefully at the rules we actually have.',
      'Forward chaining starts with facts and follows the rule.',
      'Backward chaining starts with a goal and looks for its supporting fact.',
      'Try a new bird. The same rule can support a new conclusion.',
      'One arrow has no rule behind it. Can you identify which one?',
      'Explain TELL and ASK in your own words.',
    ],
    ehs3: [
      'Let’s inspect this construction site. Can you spot anything unsafe?',
      'Look closely at the platform edge. Select the missing protection.',
      'What could happen to the unsecured tools beside that edge?',
      'Now look above the platform. Select the electrical hazard.',
      'The platform also depends on sound support. What does instability change?',
      'This ladder is balanced on the tower. Think about the notes on tower misuse.',
      'Compare the base and castors before and after the safer change.',
      'Would you move this tower while someone is on it?',
      'Show the safer setup and identify the change at the exposed edge.',
      'Some hazards arise during assembly; others arise during use.',
      'A different miniature: inspect the unsupported excavation wall.',
      'Describe two visible risks and the changes that address them.',
    ],
    ehs5: [
      'Follow this miniature river through the community. Why inspect the sources?',
      'Select the town’s untreated outfall and trace its path.',
      'Try the treatment control. Notice that it acts before discharge.',
      'Farm runoff enters through a different pathway. Select it.',
      'What can reduce excessive chemicals entering that runoff?',
      'Look at the solid waste near the river. Where should it go instead?',
      'The oil drain is another independent pathway.',
      'Treatment is not a promise of drinking-water safety. What else matters?',
      'Which individual action would help conserve resources?',
      'An inspection needs to connect a hazard with a corrective action.',
      'Try all four controls. Each addresses its own source.',
      'Describe a prevention plan using the pathways you can see.',
    ],
    'open-ai': [
      'Let’s explore a tiny model, one connection at a time.',
      'Examples connect inputs with useful targets.',
      'The input is the number we feed into our connection.',
      'Predict the output before changing the weight.',
      'Compare the prediction with the target.',
      'Adjust the weight. You control this actual multiplication.',
      'Repeat the prediction with the changed connection.',
      'What can this tiny model show, and what can’t it tell us?',
    ],
    time: [
      'Could two clocks record different elapsed times?',
      'Our clocks represent two specified observers.',
      'Compare the traveler with the Earth-frame interval.',
      'Try both hypothetical speeds and watch the clock values change.',
      'Use the displayed formula and its actual units.',
      'What assumptions did we leave out of this model?',
      'Does a forward clock comparison establish travel into the past?',
      'Separate an evidenced result from a speculative claim.',
    ],
  };
  return lines[lesson.id]?.[Math.max(0, index)] ?? lesson.introduction;
}
export function teachingStepForQuestion(lessonId: string, index: number) {
  const maps: Record<string, number[]> = {
    ai3: [0, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5],
    ai4: [0, 1, 2, 2, 3, 4, 4, 5, 5, 5, 5, 5],
    ehs3: [0, 1, 1, 3, 2, 2, 2, 2, 4, 5, 5, 5],
    ehs5: [0, 1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 5],
    'open-ai': [0, 1, 2, 3, 4, 5, 5, 5],
    time: [0, 1, 2, 3, 4, 5, 5, 5],
  };
  return maps[lessonId]?.[index] ?? 0;
}
