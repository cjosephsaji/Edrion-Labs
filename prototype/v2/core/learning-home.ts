import type { Topic } from '../simulations/runtime';
import type { InvestigationSession, Progress } from './investigation';

export type LearningQuestion = {
  topic: Topic;
  subject: string;
  title: string;
  outcome: string;
  invitation: string;
  foothold: string;
  keywords: string;
  symbol: string;
};

/** An honest catalogue of the five authored investigations, not generated courses. */
export const learningQuestions: LearningQuestion[] = [
  {
    topic: 'traffic',
    subject: 'Everyday physics',
    symbol: '↝',
    title: 'Why does traffic slow down when the road is clear?',
    outcome: 'Explain how one driver braking can slow the car behind.',
    invitation:
      'One driver taps the brakes. Follow what happens to the next car, and find the cause of a familiar mystery.',
    foothold:
      'Start with something familiar: a driver reacting to the car ahead.',
    keywords: 'traffic jam cars driving waves systems brakes slowdown',
  },
  {
    topic: 'neural',
    subject: 'How AI learns',
    symbol: '✳',
    title: 'How can a mistake help a machine learn?',
    outcome:
      'Choose a change that moves a simple model’s prediction closer to its target.',
    invitation:
      'Give a tiny model a target. Change one connection and see whether its prediction gets closer.',
    foothold:
      'We start with multiplication. No coding or AI background needed.',
    keywords:
      'ai artificial intelligence neural networks machine learning weights error loss training prediction',
  },
  {
    topic: 'rocket',
    subject: 'Motion & forces',
    symbol: '↗',
    title: 'Can a rocket fire upward and still fall?',
    outcome:
      'Tell the difference between a rocket’s motion and the force changing it.',
    invitation:
      'Turn up a falling rocket’s engine. Find out why changing its motion takes time.',
    foothold:
      'We’ll separate two ideas: where it’s moving, and how that motion changes.',
    keywords:
      'rocket space gravity physics acceleration velocity speed thrust force newton motion falling',
  },
  {
    topic: 'attention',
    subject: 'Inside language AI',
    symbol: 'Aa',
    title: 'Which words can an AI pay attention to?',
    outcome:
      'Explain how a mask changes the words a simple attention model can use.',
    invitation:
      'Hide the words ahead of one word. Watch its attention redistribute across the words it can still see.',
    foothold:
      'You’ll follow a short sentence. We’ll introduce the model as you go.',
    keywords:
      'ai language chatgpt llm transformer attention words sentence token mask causal',
  },
  {
    topic: 'relativity',
    subject: 'Space & time',
    symbol: '◷',
    title: 'Can two clocks disagree about time?',
    outcome:
      'Compare a moving clock with Earth’s clock over the same Earth-time interval.',
    invitation:
      'Compare two journeys at different speeds. See how much time the travelling clock records.',
    foothold:
      'Start by comparing two clocks. The experiment introduces the unfamiliar part.',
    keywords:
      'relativity time dilation clocks einstein space speed light spaceship physics',
  },
];

export const questionFor = (topic: Topic) =>
  learningQuestions.find((question) => question.topic === topic)!;

const ignoredWords = new Set(
  'a an the how what why can do does is are i me my want to understand learn about help with of in it and'.split(
    ' ',
  ),
);
export function findQuestions(query: string): LearningQuestion[] {
  const words =
    query
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => !ignoredWords.has(word)) ?? [];
  if (!query.trim()) return learningQuestions;
  if (!words.length) return [];
  return learningQuestions
    .map((question, index) => {
      const terms =
        `${question.title} ${question.subject} ${question.keywords}`
          .toLowerCase()
          .match(/[a-z0-9]+/g) ?? [];
      const score = words.filter((word) =>
        terms.some(
          (term) => term === word || (word.length > 3 && term.startsWith(word)),
        ),
      ).length;
      return { question, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ question }) => question);
}

export function nextStep(progress?: Progress): {
  label: string;
  detail: string;
} {
  if (!progress)
    return {
      label: 'Start with a prediction',
      detail:
        'Make a guess, try a change, then explain what happened. We’ll guide each step.',
    };
  if (progress.stage === 'observe')
    return {
      label: 'Your experiment is ready',
      detail:
        'You’ve made a prediction. Next, compare it with what actually happened.',
    };
  if (progress.stage === 'explain')
    return {
      label: 'Connect the cause and effect',
      detail: 'You’ve seen the result. Pick up by explaining why it happened.',
    };
  if (progress.stage === 'predict')
    return {
      label: progress.attempts.length
        ? 'Try your idea again'
        : 'Your question is waiting',
      detail: `Pick up at case ${progress.caseIndex + 1}. Start with a prediction; you don’t need to be sure.`,
    };
  const last = progress.attempts.at(-1);
  if (!last?.reasonCorrect)
    return {
      label: 'Let’s untangle the explanation',
      detail:
        'Your last explanation needs another look. We’ll return to the feedback and the steps behind the result.',
    };
  if (last.hint)
    return {
      label: 'A little less help this time',
      detail:
        'You explained the result with a hint. Revisit your feedback, then try the case on your own.',
    };
  if (progress.caseIndex < 2)
    return {
      label: 'See if your idea holds up',
      detail:
        'You explained this result. Pick up at your field note, then test your idea in a different case.',
    };
  return {
    label: 'Bring your three cases together',
    detail:
      'Revisit what you explained, practise a case, or choose a new question when you’re ready.',
  };
}

export function learningRecord(session: InvestigationSession) {
  return learningQuestions.flatMap((question) => {
    const progress = session.topics[question.topic];
    if (!progress) return [];
    // Latest evidence per case matters; replaying a case never inflates the count.
    const latest = new Map(
      progress.attempts.map((attempt) => [attempt.caseId, attempt]),
    );
    return [
      {
        question,
        progress,
        explored: latest.size,
        explained: [...latest.values()].filter(
          (attempt) => attempt.reasonCorrect,
        ).length,
        assisted: [...latest.values()].filter(
          (attempt) => attempt.reasonCorrect && attempt.hint,
        ).length,
      },
    ];
  });
}

export const investigationHref = (topic: Topic) =>
  `/prototype?view=2d&lesson=${topic}`;
