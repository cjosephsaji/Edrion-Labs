import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type EquationStep, type M4Snapshot } from '@edrion/schemas';
import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { feedbackFixture } from './feedback-fixtures';
import { DemoInformation, TeachingContext, TeachingSources } from './teaching-support';
import { EquationBoard } from './canvas/session-equation-board';

const question =
  'For IaaS, who manages the guest operating system? A host has 64 GB, reserves 16 GB, and needs 8 GB per VM. Find the available memory and whole-VM capacity.';
const step: EquationStep = {
  id: 'divide',
  rule: 'divide',
  inputs: [
    { value: 48, unit: 'GB' },
    { value: 8, unit: 'GB/VM' },
  ],
  result: { value: 6, unit: 'VM' },
  assumptions: ['Only memory limits this example.'],
  corrects: null,
  elementId: 'capacity',
};
const element = {
  id: 'capacity',
  kind: 'equation' as const,
  label: 'Whole VM capacity',
  version: 1,
  sourceId: 'source',
  editable: true,
  tex: '48 / 8 = 6 VM',
  explanation: 'Divide the available memory into 8 GB groups.',
  value: '7',
};
function snapshot() {
  const s = feedbackFixture('partial');
  s.task!.prompt = question;
  s.evaluation!.criteria[0]!.status = 'satisfied';
  s.evaluation!.criteria[2]!.status = 'not_satisfied';
  s.teaching = {
    actionId: s.id,
    status: 'presenting',
    caption: 'Keep the correct responsibility distinction.',
    decision: {
      strategy: 'method_repair',
      reason:
        'The committed application criterion needs attention; the hypothesis remains evidence-limited.',
    },
    nextBeat: 1,
    beatCount: 3,
    limitations: ['Synthetic material; no live semantic inference.'],
    equationSteps: [step],
  } as unknown as NonNullable<M4Snapshot['teaching']>;
  return s;
}
function board(textOnly = false, example: EquationStep | undefined = step) {
  const edit = vi.fn(async () => undefined);
  render(
    <TeachingTargetRegistry>
      <EquationBoard
        element={element}
        editable
        busy={false}
        edit={edit}
        step={example}
        textOnly={textOnly}
      />
    </TeachingTargetRegistry>,
  );
  return edit;
}

describe('Question context and learner-facing teaching support', () => {
  it('shows the exact question, a useful rationale and scoped prior feedback without internal diagnosis', () => {
    const s = snapshot(),
      sources = vi.fn();
    render(<TeachingContext snapshot={s} onSources={sources} />);
    expect(
      screen.getByRole('region', { name: 'Question you’re working on' }),
    ).toHaveTextContent(question);
    expect(screen.getByRole('region', { name: 'Why this step?' })).toHaveTextContent(
      'Working through one operation at a time',
    );
    const previous = screen.getByRole('region', {
      name: 'Feedback on your last submitted answer',
    });
    expect(within(previous).getByText('Already correct')).toBeInTheDocument();
    expect(
      within(previous).getByText('Responsibility classification'),
    ).toBeInTheDocument();
    expect(within(previous).getByText('Let’s revisit')).toBeInTheDocument();
    expect(within(previous).getByText('VM capacity')).toBeInTheDocument();
    expect(
      screen.queryByText(/hypothesis|committed application|Keep the correct/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Teaching source/ }));
    expect(sources).toHaveBeenCalledOnce();
  });
  it('does not acknowledge stale or unavailable feedback as correct', () => {
    const s = snapshot();
    s.evaluation!.responseId = 'another-response';
    render(<TeachingContext snapshot={s} />);
    expect(
      screen.queryByRole('region', { name: 'Feedback on your last submitted answer' }),
    ).not.toBeInTheDocument();
  });
  it('gives an exploration its own focus while keeping the previous question and feedback available', () => {
    const s = snapshot();
    s.teaching!.capability = 'graph';
    s.teaching!.decision.strategy = 'participation';
    render(<TeachingContext snapshot={s} />);
    expect(screen.getByRole('region', { name: 'Exploration focus' })).toHaveTextContent(
      'Select a point',
    );
    expect(
      screen.getByText('View the question you answered').closest('details'),
    ).not.toHaveAttribute('open');
    expect(screen.getByText(question)).not.toBeVisible();
    expect(
      screen.getByText('Feedback from your previous question').closest('details'),
    ).not.toHaveAttribute('open');
  });
  it('retains a practice question’s original details', () => {
    const s = snapshot();
    s.task!.prompt = 'Correct the capacity step.';
    s.task!.passage = question;
    render(<TeachingContext snapshot={s} />);
    expect(screen.getByText('Correct the capacity step.')).toBeInTheDocument();
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.getByText('Question details')).toBeInTheDocument();
  });
  it('keeps a long supplied passage available without flooding the question card', () => {
    const s = snapshot();
    s.task!.passage = 'Source passage. '.repeat(80);
    render(<TeachingContext snapshot={s} />);
    expect(
      screen.getByText('View question details').closest('details'),
    ).not.toHaveAttribute('open');
    expect(screen.getByText(s.task!.passage.trim())).toBeInTheDocument();
  });
  it('uses a segmented memory model only from a revealed checked step', () => {
    const subtract: EquationStep = {
      ...step,
      id: 'subtract',
      rule: 'subtract',
      inputs: [
        { value: 64, unit: 'GB' },
        { value: 16, unit: 'GB' },
      ],
      result: { value: 48, unit: 'GB' },
    };
    board(false, subtract);
    expect(
      screen.getByRole('figure', { name: 'Memory allocation example' }),
    ).toHaveTextContent('16 GB set aside');
    expect(
      screen.getByRole('figure', { name: 'Memory allocation example' }),
    ).toHaveTextContent('48 GB available');
    expect(
      screen.queryByRole('figure', { name: 'Equal VM groups example' }),
    ).not.toBeInTheDocument();
  });
  it('keeps the checked six-VM example separate from the learner’s saved seven and edits the actual value', () => {
    const edit = board();
    expect(
      screen.getByRole('figure', { name: 'Equal VM groups example' }),
    ).toHaveTextContent('6 whole VMs');
    const input = screen.getByRole('textbox', { name: element.label });
    expect(input).toHaveValue('7');
    expect(screen.queryByText('Already correct')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: `Save ${element.label} step` }));
    expect(edit).toHaveBeenCalledWith({
      type: 'replace_content',
      id: 'capacity',
      expectedVersion: 1,
      text: '5',
    });
  });
  it('keeps the equation and input usable in text-only mode', () => {
    board(true);
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Checked equation')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: element.label })).toHaveValue('7');
  });
});

describe('Source transparency and preview boundaries', () => {
  function sourcesSnapshot() {
    const s = snapshot();
    s.teaching = null;
    s.task!.citation = 'Teacher-reviewed source excerpt';
    s.lesson = {
      citation: 'Teacher-reviewed source excerpt',
      excerpts: [{ text: 'Exact source passage.', reference: { unitId: 'unit' } }],
      limitations: ['Memory-only model.'],
    } as unknown as NonNullable<M4Snapshot['lesson']>;
    return s;
  }
  it('labels simulated reviews honestly and exposes demo limitations separately', () => {
    const s = sourcesSnapshot();
    const { unmount } = render(<TeachingSources snapshot={s} preview />);
    expect(screen.getByText('Sample teaching material')).toBeInTheDocument();
    expect(screen.queryByText('Teacher-reviewed source excerpt')).not.toBeInTheDocument();
    expect(screen.getByText('Exact source passage.')).toBeInTheDocument();
    unmount();
    render(<DemoInformation snapshot={s} />);
    expect(
      screen.getByText(/review records in this preview are synthetic/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Memory-only model/)).toBeInTheDocument();
  });
  it('preserves genuine citations and material limitations outside the preview', () => {
    render(<TeachingSources snapshot={sourcesSnapshot()} preview={false} />);
    expect(screen.getByText('Teacher-reviewed source excerpt')).toBeInTheDocument();
    expect(screen.getByText('Memory-only model.')).toBeInTheDocument();
  });
  it('withholds teaching excerpts during an unsubmitted independent task', () => {
    const s = sourcesSnapshot();
    s.submission = null;
    s.assistance = 'independent';
    render(<TeachingSources snapshot={s} preview={false} />);
    expect(screen.queryByText('Exact source passage.')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Use the passage supplied with your question/),
    ).toBeInTheDocument();
  });
});
