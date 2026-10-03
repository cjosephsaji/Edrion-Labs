import type { PetrosSessionBlock } from '@edrion/schemas';

export type PetrosLessonNarrationSegment = {
  id: string;
  blockId: string;
  targetKey: string;
  label: string;
  text: string;
};

export type PetrosLessonPausePoint = {
  blockId: string;
  segmentId: string;
  targetKey: string;
  label: string;
  spokenText: string;
  wordIndex: number;
};

export function petrosLessonTarget(blockId: string, part: string) {
  return `lesson:block:${blockId}:${part}`;
}

function recovered(block: PetrosSessionBlock) {
  if (block.questions.length === 0) return true;
  const equivalenceKeys = [...new Set(block.questions.map((question) => question.equivalenceKey))];
  return equivalenceKeys.every((key) =>
    block.questions.some(
      (question) =>
        question.equivalenceKey === key &&
        question.attempts.some((attempt) => attempt.correctness === 'correct'),
    ),
  );
}

/**
 * Turns the visible state of a teaching block into a sequence Petros can actually teach.
 * Hidden reveals and locked history are deliberately omitted: narration must match the screen.
 */
export function buildPetrosLessonNarration(block: PetrosSessionBlock) {
  const segments: PetrosLessonNarrationSegment[] = [];
  const add = (part: string, label: string, text: string | null | undefined) => {
    const cleanText = text?.trim();
    if (!cleanText) return;
    segments.push({
      id: `${block.id}:${part}`,
      blockId: block.id,
      targetKey: petrosLessonTarget(block.id, part),
      label,
      text: cleanText,
    });
  };

  add('title', 'lesson heading', `Let’s focus on ${block.content.title}.`);

  const activeQuestions = block.questions.filter((question) => question.active && !question.locked);
  for (const question of activeQuestions) {
    add(`question:${question.id}`, 'current question', question.prompt);
  }
  if (block.questions.length && !recovered(block)) return segments;

  const content = block.content;
  switch (content.type) {
    case 'hook':
      add('prompt', 'opening question', content.prompt);
      if (block.interactionState.revealed === true) {
        add('reveal', 'key reveal', content.reveal);
        add('anchor', 'memory anchor', content.anchor);
      }
      break;
    case 'prerequisite_check':
      add('instructions', 'prerequisite check', content.instructions);
      break;
    case 'goal_frame':
      add('goal', 'learning goal', content.goal);
      content.checkpoints.forEach((checkpoint, index) =>
        add(`checkpoint:${index}`, `checkpoint ${index + 1}`, checkpoint),
      );
      break;
    case 'layered_explanation': {
      add('first-layer', 'first explanation', content.firstLayer);
      const expandedIds = Array.isArray(block.interactionState.expandedLayerIds)
        ? block.interactionState.expandedLayerIds
        : [];
      content.deeperLayers
        .filter((layer) => expandedIds.includes(layer.id))
        .forEach((layer) => add(`layer:${layer.id}`, layer.label, layer.content));
      add('key-idea', 'key idea', content.keyIdea);
      break;
    }
    case 'worked_example': {
      add('problem', 'worked problem', content.problemStatement);
      const revealed = Math.max(1, Number(block.interactionState.revealedStepCount ?? 1));
      content.steps.slice(0, revealed).forEach((step, index) =>
        add(
          `step:${step.id}`,
          `worked step ${index + 1}`,
          `${step.title}. ${step.explanation}`,
        ),
      );
      if (revealed >= content.steps.length) add('final-check', 'final check', content.finalCheck);
      break;
    }
    case 'analogy':
      add('analogy', 'analogy', `${content.familiarDomain}. Here is what it helps us understand: ${content.targetIdea}`);
      content.mappings.forEach((mapping, index) =>
        add(`mapping:${index}`, `analogy mapping ${index + 1}`, `${mapping.familiar} maps to ${mapping.target}.`),
      );
      add('limit', 'where the analogy stops', content.limit);
      break;
    case 'story': {
      add('setup', 'story setup', content.setup);
      const revealed = Math.max(1, Number(block.interactionState.revealedEventCount ?? 1));
      content.events.slice(0, revealed).forEach((event, index) =>
        add(`event:${event.id}`, `story event ${index + 1}`, `${event.label}. ${event.detail}`),
      );
      if (revealed >= content.events.length) add('takeaway', 'story takeaway', content.takeaway);
      break;
    }
    case 'derivation': {
      add('assumptions', 'starting assumptions', content.startingAssumptions.join('. '));
      const revealed = Math.max(1, Number(block.interactionState.revealedStepCount ?? 1));
      content.steps.slice(0, revealed).forEach((step, index) =>
        add(`step:${step.id}`, `derivation step ${index + 1}`, `${step.expression}. ${step.explanation}`),
      );
      if (revealed >= content.steps.length) add('conclusion', 'derivation conclusion', content.conclusion);
      break;
    }
    case 'diagram':
      add('diagram', 'interactive diagram', 'This diagram is interactive. Choose “Explain diagram” and I’ll point through each part in order.');
      break;
    case 'predict_then_reveal':
      add('prompt', 'prediction', content.prompt);
      if (block.interactionState.revealed === true) {
        add('reveal', 'result', content.reveal);
        add('explanation', 'why it happens', content.explanation);
      }
      break;
    case 'contrast_case':
      add('left', content.left.label, `${content.left.prompt}. ${content.left.method}`);
      add('right', content.right.label, `${content.right.prompt}. ${content.right.method}`);
      add('key-distinction', 'key distinction', content.keyDistinction);
      break;
    case 'misconception_demolition':
      add('misconception', 'common misconception', content.misconception);
      add('correction', 'correction', content.correction);
      add('evidence', 'evidence', content.evidence.join('. '));
      break;
    case 'socratic_probe':
      add('probe', `probe ${content.probeNumber}`, content.prompt);
      if (content.probeNumber === 2) add('explanation', 'direct explanation', content.explanationAfterCap);
      break;
    case 'recall_check':
      add('instructions', 'recall check', content.instructions);
      break;
    case 'apply_to_your_world':
      add('prompt', 'application prompt', content.prompt);
      add('examples', 'examples', content.examples.join('. '));
      add('exam-shape', 'exam-shaped response', content.examShape);
      break;
    case 'synthesis':
      add('prompt', 'synthesis prompt', content.prompt);
      add('tightening', 'tightening guidance', content.tighteningGuidance);
      add('forward-link', 'next connection', content.forwardLink);
      break;
    case 'artifact_commit':
      add('prompt', 'artifact choice', content.prompt);
      break;
    case 'forward_link':
      add('connection', 'next connection', `${content.nextConcept}. ${content.connection}`);
      add('open-question', 'unfinished question', content.openQuestion);
      break;
  }

  return segments;
}
