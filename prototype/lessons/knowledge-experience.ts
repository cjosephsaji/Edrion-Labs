import type { Lesson, Question } from '../teaching/types';
import type { Intervention } from '../teaching/learning-evidence';
const wings = { premise: 'Bird(x)', conclusion: 'HasWings(x)' };
function task(
  id: string,
  concept: string,
  prompt: string,
  choices: string[],
  answer: string,
  explanation: string,
  facts: string[],
  rules = [wings],
  errors: Record<string, Intervention> = {},
): Question {
  // Rotate authored options, keeping the same declared answer and validator.
  const shift = id.charCodeAt(id.length - 1) % choices.length;
  const options = [...choices.slice(shift), ...choices.slice(0, shift)];
  return {
    id,
    concept,
    task: prompt,
    type: 'choice',
    options,
    correct: [answer],
    explanation,
    board: { facts, rules },
    errorCategories: errors,
    optionFeedback: options.map((v) =>
      v === answer
        ? explanation
        : errors[v] === 'wrong-rule'
          ? 'The rule works in its stated direction. Its conclusion cannot be used as a premise for the reverse direction.'
          : errors[v] === 'unsupported-conclusion'
            ? 'That claim needs a fact or a rule that has not been supplied. It is not established by this knowledge base.'
            : 'Match the named entity and the required premise. Keep the stored facts, general rules and query operations separate.',
    ),
    pages: [1, 2, 27, 28],
    phase: 'interact',
    hints: [
      'Trace only supplied facts through rules whose premises match. Using this help makes this check assisted.',
      explanation,
    ],
    misconception:
      'An unsupported response does not establish a permanent misconception.',
    retry: 'retry-worked-skip',
    next: 'recap',
  };
}
function variant(
  index: number,
  suffix: string,
  name: string,
  other: string,
  concept: string,
): Question {
  const bird = 'Bird(' + name + ')',
    wing = 'HasWings(' + name + ')',
    fly = 'CanFly(' + name + ')';
  const rule = 'Bird(x) → HasWings(x)';
  const id = 'AI4-Q' + String(index + 1).padStart(2, '0') + '-test-' + suffix;
  const make = (
    prompt: string,
    correct: string,
    distractors: string[],
    explanation: string,
    errors: Record<string, Intervention> = {},
    facts = [bird],
  ) =>
    task(
      id,
      concept,
      prompt,
      [correct, ...distractors],
      correct,
      explanation,
      facts,
      [wings],
      errors,
    );
  switch (index) {
    case 0:
      return make(
        'A system must justify ' +
          wing +
          '. Which stored information supplies a complete reasoning path?',
        bird + ' and ' + rule,
        [bird + ' alone', wing + ' is a guess'],
        'The named bird fact supplies the premise, and the one-way rule supplies the connection.',
        {
          [bird + ' alone']: 'prerequisite',
          [wing + ' is a guess']: 'unsupported-conclusion',
        },
      );
    case 1:
      return make(
        'The rule is stored, but no bird premise is known. Which operation supplies the missing premise for ' +
          wing +
          '?',
        'TELL ' + bird,
        ['ASK ' + bird, 'TELL CanFly(' + name + ')'],
        'TELL stores the matching bird premise. ASK checks knowledge rather than adding the missing fact.',
        {
          ['ASK ' + bird]: 'prerequisite',
          ['TELL CanFly(' + name + ')']: 'unsupported-conclusion',
        },
        [],
      );
    case 2:
      return make(
        'Which item would let the same reasoning apply to both ' +
          name +
          ' and ' +
          other +
          '?',
        rule,
        [bird, wing],
        'The variable rule describes the general connection; the named statements describe individual entities.',
        { [bird]: 'wrong-rule', [wing]: 'wrong-rule' },
      );
    case 3:
      return make(
        'To use the displayed rule with ' +
          bird +
          ', which substitution preserves the same entity on both sides?',
        'x = ' + name,
        ['x = HasWings', 'x = ' + other],
        'Replace x by ' + name + ' in both the premise and conclusion.',
        { ['x = HasWings']: 'wrong-rule', ['x = ' + other]: 'wrong-rule' },
      );
    case 4:
      return make(
        'Select the conclusion supported by the supplied fact and rule.',
        wing,
        [fly, 'Bird(' + other + ')'],
        bird +
          ' matches Bird(x), so the rule supports ' +
          wing +
          '. No flight or other-entity premise was supplied.',
        {
          [fly]: 'unsupported-conclusion',
          ['Bird(' + other + ')']: 'unsupported-conclusion',
        },
      );
    case 5:
      return make(
        'An agent asks whether ' +
          wing +
          ' follows. Which response has a complete proof?',
        'Supported by the matching bird fact and rule',
        [
          'Disproved because it was not directly stored',
          'Supported by outside knowledge alone',
        ],
        'A derived statement can be supported even when it was not directly stored. The displayed premise and rule provide the proof.',
        {
          'Disproved because it was not directly stored': 'wrong-rule',
          'Supported by outside knowledge alone': 'unsupported-conclusion',
        },
      );
    case 6:
      return make(
        'The agent asks ' +
          fly +
          '. The supplied rules mention wings only. What is justified?',
        'Not established by this knowledge base',
        ['Definitely false', 'Definitely true'],
        'A missing flight rule establishes neither the claim nor its negation.',
        {
          'Definitely false': 'unsupported-conclusion',
          'Definitely true': 'unsupported-conclusion',
        },
      );
    case 7:
      return make(
        'Which trace starts from known information and uses forward chaining?',
        bird + ' → match rule → ' + wing,
        [wing + ' → require premise → ' + bird, fly + ' → guess a rule'],
        'Forward chaining starts from a supplied fact and applies a matching rule.',
        {
          [wing + ' → require premise → ' + bird]: 'wrong-rule',
          [fly + ' → guess a rule']: 'unsupported-conclusion',
        },
      );
    case 8:
      return make(
        'Your goal is to prove ' +
          wing +
          '. Which trace uses backward chaining?',
        wing + ' → require ' + bird + ' → find fact',
        [bird + ' → apply rule → ' + wing, fly + ' → assume true'],
        'Backward chaining begins with the goal and checks the premises required by a suitable rule.',
        {
          [bird + ' → apply rule → ' + wing]: 'wrong-rule',
          [fly + ' → assume true']: 'unsupported-conclusion',
        },
      );
    case 9:
      return make(
        'Only the displayed facts are given. Which new conclusion follows without reversing the rule?',
        wing,
        ['Bird(' + other + ')', fly],
        'The bird premise supports wings for ' +
          name +
          '. Wings for ' +
          other +
          ' do not prove that ' +
          other +
          ' is a bird.',
        {
          ['Bird(' + other + ')']: 'wrong-rule',
          [fly]: 'unsupported-conclusion',
        },
        [bird, 'HasWings(' + other + ')'],
      );
    case 10:
      return make(
        'Which proposed conclusion lacks a supplied reasoning path?',
        fly,
        [wing, bird],
        'The stored bird fact and derived wings statement are supported. No rule concludes flight.',
        { [wing]: 'wrong-rule', [bird]: 'prerequisite' },
      );
    default:
      return make(
        'A student needs to add a bird fact, then check its wings consequence. Which sequence does that?',
        'TELL ' + bird + ', then ASK ' + wing,
        [
          'ASK ' + bird + ', then TELL ' + wing,
          'ASK ' + wing + ' adds both facts',
        ],
        'TELL adds the premise. ASK queries the consequence; it does not add an unstated premise.',
        {
          ['ASK ' + bird + ', then TELL ' + wing]: 'wrong-rule',
          ['ASK ' + wing + ' adds both facts']: 'prerequisite',
        },
        [],
      );
  }
}
export function knowledgeExperience(
  questions: Question[],
): NonNullable<Lesson['experience']> {
  function freshContext(
    q: Question,
    context: 'sensor' | 'plant' | 'member',
  ): Question {
    const terms =
      context === 'sensor'
        ? [
            'Sensor',
            'Online',
            'Calibrated',
            'sensor',
            'online status',
            'calibration',
          ]
        : context === 'plant'
          ? [
              'Plant',
              'NeedsWater',
              'Flowers',
              'plant',
              'water need',
              'flowering',
            ]
          : [
              'Member',
              'CanEnter',
              'CanVote',
              'member',
              'entry permission',
              'voting permission',
            ];
    return JSON.parse(
      JSON.stringify(q)
        .replaceAll('HasWings', terms[1]!)
        .replaceAll('CanFly', terms[2]!)
        .replaceAll('Bird', terms[0]!)
        .replaceAll('bird', terms[3]!)
        .replaceAll('wings', terms[4]!)
        .replaceAll('flight', terms[5]!),
    );
  }
  const goals = [
    'Identify the facts and rules needed to justify a conclusion.',
    'Add a relevant premise with TELL without inventing other facts.',
    'Distinguish a general implication from a named fact.',
    'Substitute the same entity consistently into a rule.',
    'Derive only a conclusion supported by a matching fact and rule.',
    'Explain why a supplied reasoning path supports a query.',
    'Distinguish an unknown claim from a disproved claim.',
    'Trace forward from facts through applicable rules.',
    'Trace backward from a goal to its required premise.',
    'Apply a rule to a new entity without inferring its converse.',
    'Identify a conclusion that lacks a supplied reasoning path.',
    'Use TELL and ASK for their different knowledge operations.',
  ];
  const objectives = Object.fromEntries(
    questions.map((q, i) => [q.id, goals[i]!]),
  );
  const tests = Object.fromEntries(
    questions.map((q, i) => [
      q.id,
      [
        freshContext(
          variant(i, 'a', 'Sora' + (i + 1), 'Kit' + (i + 1), q.concept),
          'sensor',
        ),
        freshContext(
          variant(i, 'b', 'Milo' + (i + 1), 'Ash' + (i + 1), q.concept),
          'plant',
        ),
      ],
    ]),
  );
  const diagnostic = [
    task(
      'AI4-diagnostic-1',
      'Starting knowledge',
      'Which statement describes a general connection rather than one named fact?',
      ['Bird(Lark)', 'Bird(x) → HasWings(x)', 'HasWings(Lark)'],
      'Bird(x) → HasWings(x)',
      'A rule uses a variable to connect a premise with a conclusion. Named statements describe an entity.',
      ['Bird(Lark)'],
      [wings],
      { 'Bird(Lark)': 'prerequisite', 'HasWings(Lark)': 'prerequisite' },
    ),
    task(
      'AI4-diagnostic-2',
      'Starting knowledge',
      'Given HasWings(Pip) and Bird(x) → HasWings(x), is Bird(Pip) established?',
      [
        'Yes, reverse the rule',
        'Not established by these statements',
        'Definitely false',
      ],
      'Not established by these statements',
      'A one-way implication does not establish its converse. Wings alone neither prove nor disprove being a bird.',
      ['HasWings(Pip)'],
      [wings],
      {
        'Yes, reverse the rule': 'wrong-rule',
        'Definitely false': 'unsupported-conclusion',
      },
    ),
  ];
  const final: NonNullable<Lesson['experience']>['final'] = [
    {
      conceptId: questions[2]!.id,
      question: freshContext(
        variant(2, 'final', 'Orin', 'Tala', questions[2]!.concept),
        'member',
      ),
    },
    {
      conceptId: questions[4]!.id,
      question: task(
        'AI4-final-chain',
        questions[4]!.concept,
        'Combine both supplied rules. Which new result follows for Elm?',
        ['NeedsWater(Elm)', 'CanFly(Elm)', 'Tree(Bay)'],
        'NeedsWater(Elm)',
        'Tree(Elm) supports Plant(Elm), and Plant(Elm) supports NeedsWater(Elm). Both links are supplied.',
        ['Tree(Elm)'],
        [
          { premise: 'Tree(x)', conclusion: 'Plant(x)' },
          { premise: 'Plant(x)', conclusion: 'NeedsWater(x)' },
        ],
        {
          'CanFly(Elm)': 'unsupported-conclusion',
          'Tree(Bay)': 'unsupported-conclusion',
        },
      ),
    },
    {
      conceptId: questions[6]!.id,
      question: freshContext(
        variant(6, 'final', 'Vale', 'Cove', questions[6]!.concept),
        'member',
      ),
    },
    {
      conceptId: questions[8]!.id,
      question: freshContext(
        variant(8, 'final', 'Wren', 'Fern', questions[8]!.concept),
        'member',
      ),
    },
    {
      conceptId: questions[9]!.id,
      question: freshContext(
        variant(9, 'final', 'Indigo', 'Jade', questions[9]!.concept),
        'member',
      ),
    },
  ];
  // Explicit error mappings are authored only where an answer supports that interpretation.
  questions[2]!.errorCategories = {
    Facts: 'wrong-rule',
    'What follows': 'wrong-rule',
  };
  questions[4]!.errorCategories = {
    'CanFly(Tweety)': 'unsupported-conclusion',
    'Bird(HasWings)': 'wrong-rule',
  };
  questions[4]!.optionFeedback = questions[4]!.options.map((v) =>
    v === 'CanFly(Tweety)'
      ? 'No supplied rule has CanFly as its conclusion. Bird(Tweety) supports wings, not flight.'
      : v === 'Bird(HasWings)'
        ? 'HasWings names a predicate, not the individual. Keep x = Tweety on both sides.'
        : questions[4]!.explanation,
  );
  questions[4]!.board = { facts: ['Bird(Tweety)'], rules: [wings] };
  questions[6]!.errorCategories = {
    'Definitely false': 'unsupported-conclusion',
    'Definitely true': 'unsupported-conclusion',
  };
  questions[9]!.board = { facts: ['Bird(Rio)'], rules: [wings] };
  questions[9]!.errorCategories = {
    'CanFly(Rio)': 'unsupported-conclusion',
    'Rio is Tweety': 'wrong-rule',
  };
  return { objectives, diagnostic, tests, final };
}
