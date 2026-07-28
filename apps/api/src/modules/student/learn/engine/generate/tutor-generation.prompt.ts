import type { LessonGoal, LessonShapeV1, TopicShapeV1 } from '@edrion/schemas';
import { composeCharterSystem, TUTOR_CHARTER } from '../tutor/tutor-charter';
import type { CapabilitySet } from '../capabilities/capability-resolver';
import { TUTOR_GENERATION_PROMPT_VERSION } from './lesson-blocks.schema';

const EQUAL_DIGNITY = `Every subject is first-class. History, languages, literature, geography, and business get the same care as STEM: specific facts, named mechanisms, and concrete examples — never vague filler. Do not short-change a humanities topic with generic "pressures" talk.`;

const STEM_EDGE = `STEM EDGE (mathematics, sciences, computing) — extra sharpness on top of equal dignity:
- Prefer concrete worked moves early: one clear example before abstraction.
- Name the exact misconception in wrong options (not "common mistake").
- Use proper notation (LaTeX $...$ for math/science). For matrices always write $\begin{pmatrix}a&b\\c&d\end{pmatrix}$ — never ASCII [[a,b],[c,d]].
- When graph_plot is allowed and the topic is about functions/graphs/parameters, include one interactive graph_plot with a simple expression like x^2+k.
- When code_trace is allowed (computing), include a short code snippet and a predict-the-output question nearby.
- Sciences: name the process step, what goes in/out, and one falsifying intuition.`;

function familyBrief(family: TopicShapeV1['subject_family']): string {
  switch (family) {
    case 'mathematics':
      return 'Mathematics: teach a move the student can redo. Symbol + meaning together.';
    case 'sciences':
      return 'Sciences: mechanism over vocabulary. Cause → effect → what would disprove it.';
    case 'computing':
      return 'Computing: trace state. Predict output before writing new code.';
    case 'history':
      return 'History: causal chains and contested readings. Dates serve the story; they are not the story. Name actors, pressures, and at least one historiographical disagreement.';
    case 'languages':
      return 'Languages: form in context. One clear pattern, then a try-it check. Avoid abstract grammar lectures.';
    case 'literature':
      return 'Literature: stay close to the text. Quote or paraphrase a concrete passage; interpretation follows evidence.';
    case 'geography':
      return 'Geography: place + process. Spatial relationships and human/physical interaction.';
    case 'business':
      return 'Business: statement logic and scenarios. Numbers mean decisions.';
    case 'social_sciences':
      return 'Social sciences: claims, evidence, and counter-claims.';
    default:
      return 'General: one clear idea, one concrete example, one check.';
  }
}

export function buildTutorGenerationSystem(opts: {
  topicTitle: string;
  goal: LessonGoal;
  shape: TopicShapeV1;
  capabilities: CapabilitySet;
}): string {
  const charter = composeCharterSystem({ topicTitle: opts.topicTitle, goal: opts.goal });
  const allowed = [...opts.capabilities.surfaces].sort().join(', ');
  const forbidden = [...opts.capabilities.forbidden].sort().join(', ') || '(none)';
  const stem =
    opts.shape.subject_family === 'mathematics' ||
    opts.shape.subject_family === 'sciences' ||
    opts.shape.subject_family === 'computing'
      ? `\n\n${STEM_EDGE}`
      : '';

  return `${charter}

${EQUAL_DIGNITY}
Subject family: ${opts.shape.subject_family}. ${familyBrief(opts.shape.subject_family)}
${stem}

Allowed surfaces for this lesson: ${allowed}
Forbidden surfaces (never emit): ${forbidden}

Hard generation rules:
- First block MUST be teaching (explanation or worked_example). Never open with question_set or probe.
- Teach the topic itself with specific content. Never templates like "Why does **Topic** work the way it does?" or "What is Topic?"
- bodyMd must be real teaching (concrete). deeperMd must ADD new detail — never repeat bodyMd.
- question_set: exactly one correct option; wrong options MUST include mistake {name, explainsMd}.
- answerKey.correctOptionId must match the option marked correct.
- Probes must be topic-specific, not "what is the core idea in your own words?"
- Follow the checkpoint order in the user payload; use checkpoint surfaces with those names.
- Teach ONLY the topic in the payload. If spine is about matrices, never invent graphs/exponents/function shifts. If spine is about history, never invent calculus.
- End with system_notice inviting curation of flashcards.
- Max ~${TUTOR_CHARTER.numeric.maxBlockWords} words per explanation bodyMd.
- Prompt version ${TUTOR_GENERATION_PROMPT_VERSION}`;
}

export function buildTutorGenerationUser(opts: {
  topicTitle: string;
  goal: LessonGoal;
  shape: TopicShapeV1;
  lesson: LessonShapeV1;
  timeBudgetMinutes: number;
}): string {
  return JSON.stringify(
    {
      topicTitle: opts.topicTitle,
      goal: opts.goal,
      timeBudgetMinutes: opts.timeBudgetMinutes,
      subject_family: opts.shape.subject_family,
      kind: opts.shape.kind,
      spine: opts.shape.spine,
      misconceptions: opts.shape.misconceptions,
      canonical_examples: opts.shape.canonical_examples,
      lesson: {
        arc_id: opts.lesson.arc_id,
        opening: opts.lesson.opening,
        checkpoints: opts.lesson.checkpoints.map((c) => ({
          id: c.id,
          role: c.role,
          label: c.label,
        })),
      },
      instruction:
        'Expand the spine gists into a real lesson ABOUT THIS TOPIC ONLY. The spine defines the subject — if the spine is matrices/determinants, teach matrices, never graphs or function shifts. Return JSON matching the schema. Use the checkpoint labels provided.',
    },
    null,
    2,
  );
}
