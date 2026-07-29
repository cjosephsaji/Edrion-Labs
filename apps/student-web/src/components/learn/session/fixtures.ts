import type {
  ExplanationBlockProps,
  ProbeBlockProps,
  QuestionBlockProps,
  WorkedExampleProps,
} from './blocks';

export const FIXTURE_FUNCTIONS = {
  explanation: {
    heading: 'Where the graph sits',
    bodyMd:
      'A function graph is a set of points $(x, f(x))$. When we **shift** $f(x)=x^2$ up by 3, every y-value increases by 3. The shape stays the same — only the position changes.',
    deeperMd:
      'In vector terms, you are adding the constant function $g(x)=3$. Vertical shifts never change the derivative: $(f+3)\'=f\'$.',
    whyHere:
      "You've been solid on plotting straight lines, so we start from graphs you already know and move them.",
    state: 'active' as const,
  } satisfies ExplanationBlockProps,

  worked: {
    problemMd: 'Write the equation after shifting $f(x)=x^2$ so the vertex sits at $(0, 3)$.',
    steps: [
      'Start from $f(x)=x^2$, vertex at $(0,0)$.',
      'A vertical shift of $+3$ adds 3 to every output.',
      'The new equation is $f(x)=x^2+3$.',
    ],
    predictAtStep: 1,
    whyHere: 'Procedural topics learn best from a worked example early — then you try.',
    state: 'active' as const,
  } satisfies WorkedExampleProps,

  question: {
    promptMd: 'The graph of $f(x)=x^2$ is shifted so its vertex sits at $(0,3)$. What is the new equation?',
    options: [
      {
        id: 'a',
        label: '$f(x)=x^2+3$',
        correct: true,
      },
      {
        id: 'b',
        label: '$f(x)=(x+3)^2$',
        mistake: {
          name: 'Horizontal/vertical mix-up',
          explainsMd: 'Adding inside the function moves left/right, not up/down.',
        },
      },
      {
        id: 'c',
        label: '$f(x)=x^2-3$',
        mistake: {
          name: 'Sign flip',
          explainsMd: 'Subtracting 3 shifts down. Up needs $+3$.',
        },
      },
      {
        id: 'd',
        label: '$f(x)=3x^2$',
        mistake: {
          name: 'Scaling vs shifting',
          explainsMd: 'Multiplying stretches the parabola; it does not move the vertex to $(0,3)$.',
        },
      },
    ],
    whyCorrectMd:
      'Vertex form $a(x-h)^2+k$ with $h=0$, $k=3$ gives $x^2+3$. The vertical shift is outside the square.',
    whyHere: 'You just saw the shift in the worked example — this checks whether it landed.',
    state: 'active' as const,
  } satisfies QuestionBlockProps,

  probe: {
    questionMd: 'In your own words: what stays the same when a graph shifts up?',
    whyHere: 'Surfacing the idea that shape is invariant — only position changes.',
    state: 'active' as const,
  } satisfies ProbeBlockProps,

  checkpointName: 'Where the graph sits',
  systemMessage: "You've been at this a while — want a short break, or keep going?",
};

export const FIXTURE_FRENCH_REV = {
  explanation: {
    heading: 'A crisis that was also an argument',
    bodyMd:
      'The French Revolution was not one event. It was a **sequence of ruptures** — fiscal collapse, elite fracture, then popular politics — each one changing what the next could mean.',
    deeperMd:
      'Historians still disagree whether ideology drove events or events forced ideology into the open. That disagreement is part of the subject.',
    whyHere: 'Conceptual + contested topics open by naming the frame, not by quizzing dates.',
    state: 'active' as const,
  } satisfies ExplanationBlockProps,

  question: {
    promptMd: 'Which best captures why 1789 is often treated as a *turning point* rather than a single cause?',
    options: [
      {
        id: 'a',
        label: 'It concentrated several long crises into a visible break in political legitimacy.',
        correct: true,
      },
      {
        id: 'b',
        label: 'It is the year Napoleon crowned himself emperor.',
        mistake: {
          name: 'Timeline slip',
          explainsMd: 'Napoleon’s coronation is 1804 — much later in the revolutionary sequence.',
        },
      },
      {
        id: 'c',
        label: 'It proves revolutions always start with a single speech.',
        mistake: {
          name: 'Single-cause myth',
          explainsMd: '1789 matters because multiple pressures coincided — not one speech.',
        },
      },
    ],
    whyCorrectMd:
      'Turning points are historiographical judgments about when legitimacy visibly broke — not magic years.',
    whyHere: 'Checks whether the “sequence vs single cause” framing landed.',
    state: 'active' as const,
  } satisfies QuestionBlockProps,

  checkpointName: 'Why 1789 feels like a break',
};
