import type { LessonShapeV1, TopicShapeV1 } from '@edrion/schemas';

export type FixtureBlock =
  | {
      id: string;
      surface: 'explanation';
      heading?: string;
      bodyMd: string;
      deeperMd?: string;
      whyHere: string;
    }
  | {
      id: string;
      surface: 'worked_example';
      problemMd: string;
      steps: string[];
      predictAtStep?: number;
      whyHere: string;
    }
  | {
      id: string;
      surface: 'question_set';
      promptMd: string;
      options: Array<{
        id: string;
        label: string;
        correct?: boolean;
        mistake?: { name: string; explainsMd: string };
      }>;
      whyCorrectMd?: string;
      whyHere: string;
      /** Shipped to Learn client only — never for exams. */
      answerKey: { correctOptionId: string };
    }
  | {
      id: string;
      surface: 'probe';
      questionMd: string;
      whyHere: string;
    }
  | {
      id: string;
      surface: 'checkpoint';
      name: string;
    }
  | {
      id: string;
      surface: 'system_notice';
      message: string;
      actionLabel?: string;
    }
  | {
      id: string;
      surface: 'graph_plot';
      caption: string;
      expression: string;
      param: { name: string; min: number; max: number; value: number };
      whyHere: string;
    };

function id(): string {
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

/** Hand-written lesson sequence from shape — zero LLM. */
export function buildFixtureLesson(
  topicTitle: string,
  shape: TopicShapeV1,
  lesson: LessonShapeV1,
): FixtureBlock[] {
  const blocks: FixtureBlock[] = [];
  const framing = lesson.opening.framing_md ?? `Let's get a clear hold of ${topicTitle}.`;

  blocks.push({
    id: id(),
    surface: 'explanation',
    heading: lesson.checkpoints[0]?.label,
    bodyMd: framing,
    deeperMd:
      shape.spine[0]?.gist && normalizeMd(shape.spine[0].gist) !== normalizeMd(framing)
        ? `Why this matters first: ${shape.spine[0].gist}`
        : shape.canonical_examples[0]
          ? `Concrete hold: ${shape.canonical_examples[0].setup}${
              shape.canonical_examples[0].punchline
                ? ` → ${shape.canonical_examples[0].punchline}`
                : ''
            }`
          : undefined,
    whyHere: 'Opening is always teaching — never a cold test.',
  });

  if (shape.subject_family === 'mathematics' && isGraphShiftTopic(topicTitle, shape)) {
    blocks.push({
      id: id(),
      surface: 'graph_plot',
      caption: 'Drag k and watch the parabola move.',
      expression: 'x^2+k',
      param: { name: 'k', min: -3, max: 5, value: 0 },
      whyHere: 'For functions and graphs, an interactive plot is the highest-value surface.',
    });
  }

  if (shape.kind === 'procedure' || lesson.opening.surface === 'worked_example') {
    const ex = shape.canonical_examples[0];
    blocks.push({
      id: id(),
      surface: 'worked_example',
      problemMd: ex?.setup ?? `Work a central case for ${topicTitle}.`,
      steps: [
        'Name what you start with.',
        'Apply the key move once.',
        ex?.punchline ? `Arrive at ${ex.punchline}.` : 'Write the transformed result.',
      ],
      predictAtStep: 1,
      whyHere: 'Procedural topics get a worked example early.',
    });
  }

  if (shape.subject_family === 'history') {
    blocks.push({
      id: id(),
      surface: 'explanation',
      heading: 'A chain, not a date',
      bodyMd:
        shape.spine[1]?.gist ??
        'Treat this as a sequence of ruptures. Each one changes what the next can mean.',
      whyHere: 'History opens on causal structure, not memorization.',
    });
  }

  // One content question after teaching — never before.
  // Build from THIS topic's examples/misconceptions — never a global math template.
  const misconception = shape.misconceptions[0];
  const example = shape.canonical_examples[0];
  if (shape.subject_family === 'mathematics' && isGraphShiftTopic(topicTitle, shape)) {
    blocks.push({
      id: id(),
      surface: 'question_set',
      promptMd:
        'The graph of $f(x)=x^2$ is shifted so its vertex sits at $(0,3)$. What is the new equation?',
      options: [
        { id: 'a', label: '$f(x)=x^2+3$', correct: true },
        {
          id: 'b',
          label: '$f(x)=(x+3)^2$',
          mistake: {
            name: misconception?.name ?? 'Horizontal/vertical mix-up',
            explainsMd:
              misconception?.correction_hook ??
              'Adding inside moves left/right, not up/down.',
          },
        },
        {
          id: 'c',
          label: '$f(x)=x^2-3$',
          mistake: {
            name: 'Sign flip',
            explainsMd: 'Subtracting shifts down.',
          },
        },
        {
          id: 'd',
          label: '$f(x)=3x^2$',
          mistake: {
            name: 'Scaling vs shifting',
            explainsMd: 'Multiplying stretches; it does not place the vertex at (0,3).',
          },
        },
      ],
      whyCorrectMd: 'Vertical shift sits outside the square: $x^2+3$.',
      whyHere: 'Checks the shift you just saw — distractors name real mistakes.',
      answerKey: { correctOptionId: 'a' },
    });
  } else if (shape.subject_family === 'mathematics' && /matrix|determinant/.test(topicTitle.toLowerCase())) {
    blocks.push({
      id: id(),
      surface: 'question_set',
      promptMd: 'What is $\\det\\begin{pmatrix}2&1\\\\4&3\\end{pmatrix}$?',
      options: [
        { id: 'a', label: '$2$', correct: true },
        {
          id: 'b',
          label: '$6$',
          mistake: {
            name: misconception?.name ?? 'Det is just the product of the diagonal',
            explainsMd:
              misconception?.correction_hook ??
              'That is only $2\\cdot3$; you still subtract $1\\cdot4$.',
          },
        },
        {
          id: 'c',
          label: '$10$',
          mistake: {
            name: 'Added instead of $ad-bc$',
            explainsMd: 'Determinant for 2×2 is $ad-bc$, not $ad+bc$.',
          },
        },
        {
          id: 'd',
          label: '$0$',
          mistake: {
            name: 'Assumed singular',
            explainsMd: 'Columns $(2,4)$ and $(1,3)$ are independent — det is not zero.',
          },
        },
      ],
      whyCorrectMd: '$ad-bc = 2\\cdot3 - 1\\cdot4 = 2$.',
      whyHere: 'Checks the 2×2 determinant definition — not a graphing question.',
      answerKey: { correctOptionId: 'a' },
    });
  } else if (shape.subject_family === 'mathematics') {
    const correctLabel =
      example?.punchline ?? shape.spine[1]?.gist.slice(0, 100) ?? 'The move that matches the definition';
    blocks.push({
      id: id(),
      surface: 'question_set',
      promptMd: example
        ? `For: ${example.setup} Which result is correct?`
        : `Which statement best matches what we just covered about ${topicTitle}?`,
      options: [
        { id: 'a', label: correctLabel, correct: true },
        {
          id: 'b',
          label: misconception?.student_belief ?? 'A neighbouring rule applied blindly.',
          mistake: {
            name: misconception?.name ?? 'Neighbour-topic mix-up',
            explainsMd:
              misconception?.correction_hook ?? 'Re-state the definition before applying a rule.',
          },
        },
        {
          id: 'c',
          label: 'Skip the check and trust the first algebra that looks tidy.',
          mistake: {
            name: 'No verification',
            explainsMd: 'A one-line check (inverse operation / special case) catches most slips.',
          },
        },
      ],
      whyCorrectMd: example?.punchline
        ? `The worked case lands on ${example.punchline}.`
        : 'Matches the definition and the move we just practised.',
      whyHere: 'Content check tied to this topic’s example — not a stock parabola item.',
      answerKey: { correctOptionId: 'a' },
    });
  } else if (shape.subject_family === 'history') {
    blocks.push({
      id: id(),
      surface: 'question_set',
      promptMd:
        'Which best captures why a political rupture is treated as a turning point rather than a single cause?',
      options: [
        {
          id: 'a',
          label: 'It concentrated several long crises into a visible break in political legitimacy.',
          correct: true,
        },
        {
          id: 'b',
          label: 'It is simply the year a famous speech happened.',
          mistake: {
            name: 'Single-cause myth',
            explainsMd: 'Turning points are about coinciding pressures, not one speech.',
          },
        },
        {
          id: 'c',
          label: 'It proves every revolution follows the same calendar.',
          mistake: {
            name: 'Template history',
            explainsMd: 'Sequences differ; the point is structure, not a universal date.',
          },
        },
      ],
      whyCorrectMd: 'Turning points are historiographical judgments about legitimacy breaking.',
      whyHere: 'Interpretation check after the causal frame.',
      answerKey: { correctOptionId: 'a' },
    });
  } else {
    const gist = shape.spine[0]?.gist ?? `the core idea in ${topicTitle}`;
    blocks.push({
      id: id(),
      surface: 'question_set',
      promptMd: `Which statement best matches what we just covered?`,
      options: [
        { id: 'a', label: gist.slice(0, 120), correct: true },
        {
          id: 'b',
          label: 'The opposite claim, stated confidently.',
          mistake: {
            name: 'Polar flip',
            explainsMd: 'That reverses the mechanism we just built.',
          },
        },
        {
          id: 'c',
          label: 'An unrelated but familiar fact from the same subject.',
          mistake: {
            name: 'Familiar lure',
            explainsMd: 'Familiar ≠ relevant to this checkpoint.',
          },
        },
      ],
      whyHere: 'Content check after teaching — never a topic-name template.',
      answerKey: { correctOptionId: 'a' },
    });
  }

  for (let i = 0; i < lesson.checkpoints.length; i++) {
    const cp = lesson.checkpoints[i]!;
    if (i === 0) {
      blocks.push({ id: id(), surface: 'checkpoint', name: cp.label });
    }
  }

  if (lesson.checkpoints.length > 1) {
    const next = lesson.checkpoints[1]!;
    blocks.push({
      id: id(),
      surface: 'explanation',
      heading: next.label,
      bodyMd:
        shape.spine[1]?.gist ??
        `Next we tighten ${next.label.toLowerCase()} — still one idea at a time.`,
      whyHere: `Moving into checkpoint: ${next.label}`,
    });
  }

  blocks.push({
    id: id(),
    surface: 'probe',
    questionMd:
      shape.subject_family === 'history'
        ? 'Name one structural pressure and one event that turned it into a crisis of legitimacy.'
        : isGraphShiftTopic(topicTitle, shape)
          ? 'In one line: what does a vertical shift change, and what does it leave alone?'
          : /matrix|determinant/.test(topicTitle.toLowerCase())
            ? 'In one line: what does det(A)=0 tell you about the columns of A?'
            : shape.subject_family === 'computing'
              ? 'Before the next line runs, what is true about the state you are protecting?'
              : shape.subject_family === 'sciences'
                ? 'State the mechanism in one sentence, then one observation that would force a rewrite.'
                : shape.subject_family === 'mathematics'
                  ? `Without naming the title, what is the main move you just practised for this topic?`
                  : `Without repeating the title, what should someone be able to do after this checkpoint on ${topicTitle}?`,
    whyHere: 'Reflection consolidates — skippable without friction in the shell.',
  });

  const last = lesson.checkpoints[lesson.checkpoints.length - 1];
  if (last) {
    blocks.push({ id: id(), surface: 'checkpoint', name: last.label });
  }

  blocks.push({
    id: id(),
    surface: 'system_notice',
    message: 'When you are ready, we will curate a few flashcards from what you missed.',
    actionLabel: 'Review what you made',
  });

  return blocks;
}

function isGraphShiftTopic(topicTitle: string, shape: TopicShapeV1): boolean {
  const t = topicTitle.toLowerCase();
  if (/matrix|determinant|eigen/.test(t)) return false;
  if (/graph|parabola|shift|transform/.test(t)) return true;
  return shape.spine.some((s) => /graph sits|shifting/i.test(s.label));
}

function normalizeMd(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
