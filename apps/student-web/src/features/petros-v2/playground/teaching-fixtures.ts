import { validatePresentationTimeline, type CanvasElement, type CanvasOperation, type PresentationTimeline, type TeachingActionEnvelope } from '@edrion/schemas';

export type PublicTeachingFixture = {
  id: string; title: string; category: string; summary: string; source: { id: string; title: string; paragraphs: string[]; review: string };
  timeline: PresentationTimeline;
  dialogue: Array<{ keywords: string[]; answer: string }>;
};
const sourceReview = 'Original public fixture · CC0 · locally checked examples. No qualified production review or assessment.';
function element(id: string, sourceId: string, kind: CanvasElement['kind'], payload: Record<string, unknown>, editable = false): CanvasElement {
  return { id, sourceId, kind, version: 1, label: id.replaceAll('-', ' '), editable, ...payload } as CanvasElement;
}
const add = (e: CanvasElement): CanvasOperation => ({ type: 'add', element: e });
const highlight = (...ids: string[]): CanvasOperation => ({ type: 'highlight', ids });
type BeatInput = { type: TeachingActionEnvelope['type']; caption: string; target?: string; operations: CanvasOperation[];
  checkpoint?: TeachingActionEnvelope['checkpoint']; equationCheck?: TeachingActionEnvelope['equationCheck']; reveal?: 'instant' | 'progressive' };
function timeline(activityId: string, sourceId: string, inputs: BeatInput[]): PresentationTimeline {
  return validatePresentationTimeline({ schemaVersion: 'petros.v2.timeline.v1', mode: 'public_fixture', id: `${activityId}-timeline`, activityId, branchId: 'fixture-practice',
    beats: inputs.map((input, i) => ({ id: `${activityId}-beat-${i + 1}`, reveal: input.reveal ?? 'progressive',
      accessibleAlternative: input.caption, completion: input.checkpoint ? 'student-response' : 'text-step',
      action: { schemaVersion: 'petros.v2.teaching-action.v1', mode: 'public_fixture', compilerVersion: 'fixture-subset.v1', capabilityVersion: 'canvas-subset.v1',
        actionId: `${activityId}-action-${i + 1}`, activityId, branchId: 'fixture-practice', sequence: i + 1, expectedCanvasRevision: i,
        sourceId, purpose: input.caption, type: input.type, operations: input.operations, cancellation: 'preserve-semantic-prefix',
        cue: { mode: input.checkpoint ? 'waiting' : 'teaching', gesture: input.target ? 'point-right' : 'neutral', targetId: input.target ?? null, caption: input.caption },
        ...(input.checkpoint ? { checkpoint: input.checkpoint } : {}), ...(input.equationCheck ? { equationCheck: input.equationCheck } : {}) },
    })),
  });
}
const argumentId = 'public-argument';
const passage = 'A school library should stay open after classes. Students who share a quiet space at home with other family members need somewhere to study. An after-school library gives them access to a calm workspace.';
const slopeId = 'public-slope';
const cloudId = 'public-cloud';
export const TEACHING_FIXTURES: PublicTeachingFixture[] = [
  { id: 'argument-reading', title: 'Read a claim together', category: 'Reading', summary: 'Follow a short argument, highlight its support, and ask about the passage.',
    source: { id: argumentId, title: 'The after-school library', paragraphs: [passage, 'The claim is what the writer wants us to accept. Support gives a reason; the warrant explains how that reason supports the claim.'], review: sourceReview },
    timeline: timeline('argument-reading', argumentId, [
      { type: 'read_source', caption: 'Let’s read this together. The writer wants the library to stay open after classes.', target: 'library-passage', operations: [add(element('library-passage', argumentId, 'text', { text: passage })), highlight('library-passage')] },
      { type: 'write_text', caption: 'Here’s the claim, separated from its support.', target: 'library-claim', operations: [add(element('library-claim', argumentId, 'text', { text: 'Claim: keep the library open after classes.' })), highlight('library-claim')] },
      { type: 'read_source', caption: 'This sentence gives a reason: some students need a quiet place to study.', target: 'library-support', operations: [add(element('library-support', argumentId, 'text', { text: 'Students who share a quiet space at home with other family members need somewhere to study.' })), highlight('library-support')] },
      { type: 'write_text', caption: 'The link is access: opening the library creates a calm workspace. Select any card and ask me about that part.', target: 'library-warrant', operations: [add(element('library-warrant', argumentId, 'text', { text: 'Warrant: access to a calm workspace helps students who need somewhere to study.' })), highlight('library-warrant')] },
    ]), dialogue: [
      { keywords: ['claim', 'conclusion', 'writer', 'wants'], answer: 'The claim is that the school library should stay open after classes. That is the position the writer wants us to accept.' },
      { keywords: ['support', 'evidence', 'reason', 'why'], answer: 'The passage says some students need a quiet place to study. That is its supporting reason. It gives no survey or measurement, so we should not invent one.' },
      { keywords: ['warrant', 'link', 'connect', 'means'], answer: 'The link is that opening the library provides a calm workspace for students who need one. It explains why the reason supports the claim.' },
      { keywords: ['no', 'meant', 'simpler', 'understand'], answer: 'Let’s take one part: “should stay open” is the claim. “Need somewhere to study” gives the reason. Which of those did you mean?' },
    ] },
  { id: 'slope-writing', title: 'Build an equation', category: 'Writing', summary: 'Work out a slope step by step, then complete the last expression.',
    source: { id: slopeId, title: 'Slope between two points', paragraphs: ['For two points with different x coordinates, slope is the change in y divided by the change in x.', 'Use A = (1, 2) and B = (4, 8). The change in y is 8 − 2 = 6. The change in x is 4 − 1 = 3. These coordinates are dimensionless; the denominator must be nonzero.'], review: sourceReview },
    timeline: timeline('slope-writing', slopeId, [
      { type: 'write_text', caption: 'Let’s find how steep the line is between A = (1, 2) and B = (4, 8).', target: 'slope-intro', operations: [add(element('slope-intro', slopeId, 'text', { text: 'Slope compares the vertical change with the horizontal change.' })), highlight('slope-intro')] },
      { type: 'write_equation', caption: 'Start with change in y divided by change in x. The two x coordinates must be different.', target: 'slope-formula', operations: [add(element('slope-formula', slopeId, 'equation', { tex: 'm = \\frac{y_2-y_1}{x_2-x_1}', explanation: 'Change in y divided by change in x; x₂ ≠ x₁.', value: '' })), highlight('slope-formula')] },
      { type: 'transform_equation', caption: 'Substitute the coordinates: eight minus two over four minus one. That becomes six over three.', target: 'slope-substitution', equationCheck: { rule: 'slope-substitution', x1: 1, y1: 2, x2: 4, y2: 8, numerator: 6, denominator: 3 }, operations: [add(element('slope-substitution', slopeId, 'equation', { tex: 'm = \\frac{8-2}{4-1} = \\frac{6}{3}', explanation: 'Substitution, then subtraction in numerator and denominator.', value: '' })), highlight('slope-substitution')] },
      { type: 'request_student_action', caption: 'Your turn. Complete m = 6 ÷ 3, and tell me how you got there. I’ll wait.', target: 'slope-answer', operations: [add(element('slope-answer', slopeId, 'equation', { tex: 'm = \\frac{6}{3}', explanation: 'Complete the final value directly in this equation.', value: '' }, true)), highlight('slope-answer')], checkpoint: { id: 'slope-checkpoint', prompt: 'What is 6 ÷ 3? Explain your step.', editableIds: ['slope-answer'], allowedOperations: ['replace_content'], submitted: false }, reveal: 'instant' },
      { type: 'write_text', caption: 'We’ve kept your submitted work beside the derivation. The slope describes vertical change for one unit of horizontal change.', target: 'slope-summary', operations: [add(element('slope-summary', slopeId, 'text', { text: 'Interpretation: slope is vertical change per unit of horizontal change.' })), highlight('slope-summary')] },
    ]), dialogue: [
      { keywords: ['slope', 'steep', 'means', 'why'], answer: 'Slope compares vertical change with horizontal change. Here the vertical change is 6 and the horizontal change is 3. Their ratio describes the rise for one unit across.' },
      { keywords: ['subtract', 'order', 'negative', 'reverse'], answer: 'Subtract in the same point order on top and bottom. Reversing both orders gives −6 divided by −3, the same ratio. Reversing only one changes the sign.' },
      { keywords: ['zero', 'divide', 'denominator', 'vertical'], answer: 'The formula needs a nonzero change in x. If the x coordinates match, the line is vertical and this slope ratio is undefined.' },
      { keywords: ['no', 'meant', 'simpler', 'understand'], answer: 'Let’s just compare the changes: y goes from 2 to 8, while x goes from 1 to 4. Which change would you like to work through?' },
    ] },
  { id: 'cloud-drawing', title: 'Build a diagram', category: 'Drawing', summary: 'Construct a service diagram, rename a node, and add the missing relationship.',
    source: { id: cloudId, title: 'A simplified cloud service', paragraphs: ['In this public example, a learner uses an app that connects to a provider’s shared computing resources.', 'The arrow “connects” links the learner to the app. The arrow “provides” links shared resources to the app. This simplified diagram illustrates relationships; it is not a complete cloud architecture.'], review: sourceReview },
    timeline: timeline('cloud-drawing', cloudId, [
      { type: 'draw_diagram', caption: 'Start with the learner. We’ll build this relationship map one part at a time.', target: 'cloud-learner', operations: [add(element('cloud-learner', cloudId, 'node', { text: 'Learner', x: 100, y: 160 }, true)), highlight('cloud-learner')] },
      { type: 'draw_diagram', caption: 'The learner uses an app. Here’s that second node.', target: 'cloud-app', operations: [add(element('cloud-app', cloudId, 'node', { text: 'App', x: 300, y: 160 }, true)), highlight('cloud-app')] },
      { type: 'connect_elements', caption: 'Connect the learner to the app. The arrow names the relationship.', target: 'cloud-use', operations: [{ type: 'connect_elements', element: element('cloud-use', cloudId, 'edge', { from: 'cloud-learner', to: 'cloud-app', relation: 'connects', text: 'connects' }) }, highlight('cloud-use')] },
      { type: 'draw_diagram', caption: 'Shared computing resources sit behind the app. One relationship is still missing.', target: 'cloud-resources', operations: [add(element('cloud-resources', cloudId, 'node', { text: 'Shared resources', x: 500, y: 160 }, true)), highlight('cloud-resources')] },
      { type: 'request_student_action', caption: 'Add the missing relationship. You can also rename or move a node. The source explains what each arrow means.', target: 'cloud-resources', operations: [highlight('cloud-app', 'cloud-resources')], checkpoint: { id: 'cloud-checkpoint', prompt: 'Connect shared resources to the app with the “provides” relationship. Explain the link.', editableIds: ['cloud-learner', 'cloud-app', 'cloud-resources'], allowedOperations: ['replace_content', 'move_element', 'connect_elements', 'erase'], submitted: false }, reveal: 'instant' },
      { type: 'write_text', caption: 'Your diagram is preserved. Read each arrow as a sentence, including its direction.', operations: [add(element('cloud-summary', cloudId, 'text', { text: 'Relationships carry meaning: read the source node, arrow label, then destination node.' }))] },
    ]), dialogue: [
      { keywords: ['cloud', 'resources', 'provider', 'server'], answer: 'In this simplified example, the provider’s shared resources support the app. The diagram leaves out many production details; it shows one relationship rather than a full architecture.' },
      { keywords: ['arrow', 'direction', 'connect', 'provides', 'link'], answer: 'Read the arrow as a sentence: shared resources provide computing for the app. The direction should run from “Shared resources” to “App”.' },
      { keywords: ['app', 'learner', 'user'], answer: 'The learner interacts with the app. The app connects to the provider’s resources. Those are distinct roles even if we change the labels.' },
      { keywords: ['no', 'meant', 'simpler', 'understand'], answer: 'Let’s read one arrow at a time. The learner connects to the app. Which other relationship did you mean?' },
    ] },
];
