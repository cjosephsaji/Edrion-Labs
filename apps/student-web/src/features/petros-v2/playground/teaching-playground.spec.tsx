import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const voiceApi = vi.hoisted(() => ({ get: async () => { throw Object.assign(new Error('Disabled local voice fixture'), { status: 404, code: 'PETROS_PREVIEW_DISABLED' }); } }));
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => voiceApi,
  formatApiError: (error: Error) => error.message,
}));

import { PresentationController } from '../presentation-controller';
import { CompanionPlayground } from './companion-playground';
import { TEACHING_FIXTURES } from './teaching-fixtures';
import { fixtureDialogue, fixtureFeedback } from './playground-adapter';
import { authorizedPlaygroundTester, playgroundEnabled } from './playground-admission';

const owner = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('presentation prefix, interruption and student work', () => {
  it.each([{ fixture: TEACHING_FIXTURES[1]!, steps: 2, elementId: 'slope-formula' }, { fixture: TEACHING_FIXTURES[2]!, steps: 3, elementId: 'cloud-use' }])('freezes an in-progress $elementId and resumes the same semantic operation', ({ fixture, steps, elementId }) => {
    vi.useFakeTimers(); const controller = new PresentationController(fixture.timeline);
    for (let i = 1; i < steps; i++) controller.step(); controller.play();
    vi.advanceTimersByTime(175); const before = controller.getSnapshot();
    expect(before.progress).toBeGreaterThan(0); expect(before.progress).toBeLessThan(1);
    expect(before.canvas.elements.filter(e => e.id === elementId)).toHaveLength(1);
    controller.interrupt(); vi.advanceTimersByTime(10000); expect(controller.getSnapshot().progress).toBe(before.progress);
    controller.resume(); expect(controller.getSnapshot().canvas.completedActionIds).toEqual(before.canvas.completedActionIds); vi.advanceTimersByTime(140);
    expect(controller.getSnapshot().canvas.elements.filter(e => e.id === elementId)).toHaveLength(1);
    expect(controller.getSnapshot().canvas.completedActionIds).toEqual(before.canvas.completedActionIds); controller.dispose();
  });
  it.each(TEACHING_FIXTURES)('interrupts $id immediately and resumes without duplicated canvas content', fixture => {
    vi.useFakeTimers(); const controller = new PresentationController(fixture.timeline); controller.play();
    vi.advanceTimersByTime(350); const paused = controller.getSnapshot();
    expect(paused.progress).toBeGreaterThan(0);
    controller.interrupt(); vi.advanceTimersByTime(20000);
    expect(controller.getSnapshot().progress).toBe(paused.progress);
    expect(controller.getSnapshot().canvas).toEqual(paused.canvas);
    controller.resume(); vi.advanceTimersByTime(140);
    expect(controller.getSnapshot().canvas.elements.map(e => e.id)).toEqual(paused.canvas.elements.map(e => e.id));
    expect(controller.getSnapshot().progress).toBeGreaterThan(paused.progress); controller.dispose();
  });
  it('restores the actual prefix and explanation in a paused state; rejects corrupt/stale checkpoints', () => {
    const controller = new PresentationController(TEACHING_FIXTURES[1]!.timeline); controller.configure({ reducedMotion: true });
    controller.step(); controller.step(); controller.step(); controller.step();
    expect(controller.getSnapshot().status).toBe('awaiting_response');
    const canvas = controller.getSnapshot().canvas, equation = canvas.elements.find(e => e.id === 'slope-answer')!;
    controller.edit([{ type: 'replace_content', id: equation.id, expectedVersion: equation.version, text: '2' }]);
    controller.setExplanation('Two groups of three make six.');
    const restored = new PresentationController(TEACHING_FIXTURES[1]!.timeline); restored.restore(controller.serialize());
    expect(restored.getSnapshot().canvas).toEqual(controller.getSnapshot().canvas);
    expect(restored.getSnapshot().explanation).toBe('Two groups of three make six.');
    restored.submit((scene, reason) => fixtureFeedback(TEACHING_FIXTURES[1]!, scene, reason));
    expect(restored.getSnapshot().feedback).toContain('not been semantically evaluated');
    const count = restored.getSnapshot().canvas.revision; restored.submit(() => 'duplicate');
    expect(restored.getSnapshot().canvas.revision).toBe(count);
    expect(() => restored.restore('{bad')).toThrow();
    const wrong = JSON.parse(controller.serialize()); wrong.events[0].index = 3;
    expect(() => restored.restore(JSON.stringify(wrong))).toThrow('prefix');
    restored.step(); expect(restored.getSnapshot().canvas.elements.find(e => e.id === 'slope-answer')).toMatchObject({ value: '2' });
    controller.dispose(); restored.dispose();
  });
  it('preserves renamed nodes and relationships through diagram interruption, submit and reload', () => {
    const fixture = TEACHING_FIXTURES[2]!, controller = new PresentationController(fixture.timeline); controller.configure({ reducedMotion: true });
    for (let i = 0; i < 5; i++) controller.step();
    controller.edit([{ type: 'replace_content', id: 'cloud-app', expectedVersion: 1, text: 'Study app' }]);
    controller.edit([{ type: 'connect_elements', element: { id: 'student-edge', label: 'Provides link', sourceId: fixture.source.id, version: 1, editable: true, kind: 'edge', from: 'cloud-resources', to: 'cloud-app', relation: 'provides', text: 'provides' } }]);
    controller.interrupt(); const restored = new PresentationController(fixture.timeline); restored.restore(controller.serialize());
    expect(restored.getSnapshot().canvas.elements.find(e => e.id === 'cloud-app')).toMatchObject({ text: 'Study app', version: 2 });
    restored.submit((scene, reason) => fixtureFeedback(fixture, scene, reason));
    expect(restored.getSnapshot().feedback).toContain('matches');
    expect(() => restored.edit([{ type: 'replace_content', id: 'cloud-app', expectedVersion: 2, text: 'Overwrite' }])).toThrow('No open');
    controller.dispose(); restored.dispose();
  });
  it('never advances a waiting checkpoint from time alone', () => {
    vi.useFakeTimers(); const controller = new PresentationController(TEACHING_FIXTURES[1]!.timeline); controller.configure({ reducedMotion: true });
    for (let i = 0; i < 4; i++) controller.step();
    const before = controller.getSnapshot(); expect(() => controller.play()).toThrow('submit'); controller.step(); vi.advanceTimersByTime(600000);
    expect(controller.getSnapshot()).toEqual(before); controller.dispose();
  });
});
describe('interactive classroom UI and isolation', () => {
  it('keeps canvas, conversation and source together and preserves a typed question', () => {
    render(<CompanionPlayground ownerId={owner} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Interactive learning canvas' })).toBeVisible();
    expect(screen.getByLabelText('Your question')).toBeVisible();
    expect(screen.getByText('Source preview')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What supports this claim?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    expect(screen.getByLabelText('Your question')).toHaveValue('What supports this claim?');
    expect(document.querySelector('[data-source-unit] mark')).toBeTruthy();
  });
  it('supports inline equation completion, preserves prior steps and labels feedback truthfully', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in fixture'));
    render(<CompanionPlayground ownerId={owner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build an equation' }));
    fireEvent.click(screen.getByLabelText(/Reduce motion/));
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(document.querySelector('[data-element-id="slope-answer"]')).toContainElement(screen.getByLabelText('Final value'));
    fireEvent.change(screen.getByLabelText('Final value'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Explain your reasoning'), { target: { value: 'Six divided by three is two.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select slope formula' }));
    expect(screen.getByLabelText('Final value')).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: 'Submit demonstration response' }));
    expect(screen.getByText('Demonstration-only feedback')).toBeInTheDocument();
    expect(screen.getByText(/No assessment, mastery/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(`petros.m0p.fixture.v1:${owner}:slope-writing`)).toContain('slope-checkpoint');
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Demonstration-only feedback')).toBeInTheDocument();
  });
  it('allows keyboard rename with Enter and Escape while teaching content is protected', () => {
    render(<CompanionPlayground ownerId={owner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build a diagram' }));
    fireEvent.click(screen.getByLabelText(/Reduce motion/));
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    const diagram = screen.getByRole('group', { name: 'Editable service relationship diagram' });
    fireEvent.keyDown(within(diagram).getByRole('button', {name:'App'}), {key:'Enter'});
    fireEvent.change(screen.getByLabelText('Rename App'), {target:{value:'Study app'}});
    fireEvent.keyDown(screen.getByLabelText('Rename App'), {key:'Enter'});
    fireEvent.keyDown(within(diagram).getByRole('button', {name:'Study app'}), {key:'Enter'});
    fireEvent.change(screen.getByLabelText('Rename Study app'), {target:{value:'Cancel'}});
    fireEvent.keyDown(screen.getByLabelText('Rename Study app'), {key:'Escape'});
    expect(within(diagram).getByRole('button', {name:'Study app'})).toBeVisible();
    fireEvent.click(within(diagram).getByRole('button', {name:'Learner'}));
    expect(screen.getByRole('button', {name:'Delete selected element'})).toBeDisabled();
    expect(screen.queryByLabelText('Node to edit')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New label')).not.toBeInTheDocument();
  });
  it('clears selection and a pending connection from blank canvas clicks while preserving elements and saved work', () => {
    render(<CompanionPlayground ownerId={owner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build a diagram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    const diagram = screen.getByRole('group', { name: 'Editable service relationship diagram' });
    const node = within(diagram).getByRole('button', { name: 'Shared resources' });
    const checkpoint = () => JSON.parse(localStorage.getItem(`petros.m0p.fixture.v1:${owner}:cloud-drawing`)!);
    const before = checkpoint().events;
    fireEvent.click(node);
    expect(node).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected node' }));
    expect(screen.getByText(/Choose a destination node, or drag/)).toBeInTheDocument();
    fireEvent.click(diagram);
    expect(node).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Choose a destination node, or drag/)).not.toBeInTheDocument();
    fireEvent.click(within(diagram).getByRole('button', { name: 'connects' }));
    expect(within(diagram).getByRole('button', { name: 'connects' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Interactive learning canvas'));
    expect(screen.queryByRole('button', { name: 'Ask Petros about selected element' })).not.toBeInTheDocument();
    expect(checkpoint().events).toEqual(before);
    expect(checkpoint().selectedId).toBeNull();
  });
  it.each([
    { title: 'Build an equation', steps: 3, input: 'Final value' },
    { title: 'Build a diagram', steps: 4, input: 'Explain your reasoning' },
  ])('shows and focuses the required $title input once at Your turn', async ({ title, steps, input }) => {
    render(<CompanionPlayground ownerId={owner} />);
    fireEvent.click(screen.getByRole('button', { name: title }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish step' }));
    expect(screen.queryByLabelText('Student response')).not.toBeInTheDocument();
    for (let i = 0; i < steps; i++) fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    await waitFor(() => expect(screen.getByLabelText(input)).toHaveFocus());
    fireEvent.change(screen.getByLabelText('Explain your reasoning'), { target: { value: 'My explanation.' } });
    act(() => { screen.getByLabelText('Your question').focus(); });
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected teaching element' }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(screen.getByLabelText('Your question')).toHaveFocus();
    expect(screen.getByLabelText('Explain your reasoning')).toHaveValue('My explanation.');
  });
  it('keeps fixture replies scoped and uses real assets with unsupported voice disabled', () => {
    render(<CompanionPlayground ownerId={owner} />);
    // JSDOM has no harbor geometry; browser QA checks visible floating placement.
    expect(screen.getByAltText(/Petros/)).toHaveAttribute('src', '/petros/states/petros-idle.png');
    fireEvent.click(screen.getByText('Internal inspector'));
    expect(screen.getByText(/Unsupported:.*writing-pose/)).toBeInTheDocument();
    expect(screen.getByText(/Text-only mode/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What is the writer trying to claim?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(within(screen.getByRole('log')).getByText(/position the writer/)).toBeInTheDocument();
    const fixture = TEACHING_FIXTURES[0]!, controller = new PresentationController(fixture.timeline);
    expect(fixtureDialogue(fixture, 'Tell me about quantum gravity', null, controller.getSnapshot().canvas).text).toContain('haven’t checked');
  });
  it('defaults off and requires an allowlisted authenticated student with learning permission', () => {
    expect(playgroundEnabled(undefined)).toBe(false); expect(playgroundEnabled('false')).toBe(false); expect(playgroundEnabled('true')).toBe(true);
    const me = { kind: 'institutional', studentId: owner, permissions: ['student.learn.use'] };
    expect(authorizedPlaygroundTester(me, owner)).toBe(owner);
    expect(authorizedPlaygroundTester(me, '')).toBeNull();
    expect(authorizedPlaygroundTester({ ...me, permissions: [] }, owner)).toBeNull();
    expect(authorizedPlaygroundTester({ ...me, kind: 'independent' }, owner)).toBeNull();
    expect(authorizedPlaygroundTester({ ...me, passwordChangeRequired: true }, owner)).toBeNull();
    expect(authorizedPlaygroundTester(null, owner)).toBeNull();
  });
});
