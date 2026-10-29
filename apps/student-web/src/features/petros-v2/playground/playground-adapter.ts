import type { SharedCanvasState } from '@edrion/schemas';
import type { PublicTeachingFixture } from './teaching-fixtures';
import { COMPANION_PERSONA } from '../companion/companion-persona';

/** Local public preview adapter. Deliberately has no API client, media upload, model or evidence route. */
export function fixtureDialogue(fixture: PublicTeachingFixture, question: string, selectedId: string | null, canvas: SharedCanvasState) {
  const normalized = question.toLowerCase().replace(/[’']/g, '');
  const match = fixture.dialogue.find(d => d.keywords.some(word => normalized.includes(word)));
  const selected = canvas.elements.find(e => e.id === selectedId);
  const selectedText = selected && ('text' in selected ? selected.text : selected.label);
  return { personaVersion: COMPANION_PERSONA.version, simulated: true as const,
    text: match?.answer ?? (selectedText
      ? `You selected “${selectedText}”. I can discuss the relationships in this fixture. Try asking what it means or why it connects to the next step.`
      : 'I can discuss this public example, but this preview uses a small set of fixture replies. Try asking about the claim, the equation, or an arrow. I haven’t checked any other sources.') };
}
export function fixtureFeedback(fixture: PublicTeachingFixture, canvas: SharedCanvasState, explanation: string): string {
  if (fixture.id === 'slope-writing') {
    const answer = canvas.elements.find(e => e.id === 'slope-answer');
    const value = answer?.kind === 'equation' ? answer.value.trim() : '';
    const numeric = Number(value);
    if (!value || !Number.isFinite(numeric)) return 'This fixture expects a numerical value. Your work is saved; try writing the result of the division.';
    if (numeric !== 2) return 'The fixture result is 2. Check how many groups of 3 fit into 6. Your submitted work is preserved.';
    return explanation.trim() ? 'Your value matches this fixture: 6 ÷ 3 = 2. Your explanation is saved but has not been semantically evaluated.' : 'Your value matches this fixture: 6 ÷ 3 = 2. No reasoning was evaluated.';
  }
  const linked = canvas.elements.some(e => e.kind === 'edge' && e.from === 'cloud-resources' && e.to === 'cloud-app' && e.relation === 'provides');
  return linked ? 'Your link matches the authored relationship: shared resources → provides → app. Renamed labels and your explanation are saved, without semantic grading.' : 'Compare the source relationship with your arrow: shared resources → provides → app. Your submitted diagram is preserved.';
}
