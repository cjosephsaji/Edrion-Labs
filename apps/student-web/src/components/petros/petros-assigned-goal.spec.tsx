import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosAssignedGoal, type AssignedPetrosGoal } from './petros-assigned-goal';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ useStudentApi: () => ({ post: mocks.post, fileUrl: (path: string) => `/v1${path}` }),
  formatApiError: (error: unknown) => error instanceof Error ? error.message : 'Failed' }));
vi.mock('./petros-door-button', () => ({ PetrosDoorButton: ({ label }: { label: string }) => <button>{label}</button> }));
const goal: AssignedPetrosGoal = { id: '11111111-1111-4111-8111-111111111111', status: 'assigned', dueAt: '2099-10-14',
  petrosGuidance: { schemaVersion: 'petros.teacher-guidance.v1', focus: 'Learn fractions',
    instructions: 'Use visual examples and explain the denominator.', approach: 'practice', sessionMinutes: 15, attachmentObjectIds: [] },
  petrosParticipation: { started: false, completedSteps: 0, currentSessionId: null } };
function show(data = goal) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><PetrosAssignedGoal data={data} /></QueryClientProvider>);
}
beforeEach(() => { mocks.post.mockReset(); });
describe('assigned Petros learning goal', () => {
  it('shows only the goal’s attached files and uses its private learning-goal download route', () => {
    const file = { id: '22222222-2222-4222-8222-222222222222', filename: 'Fractions worksheet.pdf',
      mimeType: 'application/pdf', sizeBytes: 1200, textStatus: 'readable' as const, textTruncated: false };
    show({ ...goal, attachments: [file] });
    expect(screen.getByRole('link', { name: `Download ${file.filename}` })).toHaveAttribute('href',
      `/v1/student/assignments/learning-goals/${goal.id}/files/${file.id}`);
    expect(screen.getByText('Petros can use readable excerpts from this file.')).toBeInTheDocument();
  });
  it('shows teacher instructions and keeps completion unavailable before learning', () => {
    show();
    expect(screen.getByText(goal.petrosGuidance.instructions)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('What can you explain or do now?'), { target: { value: 'I understand denominators.' } });
    expect(screen.getByRole('button', { name: 'Report completion' })).toBeDisabled();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });
  it('reports reflection through the learning goal endpoint after a completed step', async () => {
    mocks.post.mockResolvedValue({ submitted: true });
    show({ ...goal, petrosParticipation: { started: true, completedSteps: 1, currentSessionId: null } });
    fireEvent.change(screen.getByLabelText('What can you explain or do now?'), { target: { value: 'I can explain equivalent fractions.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Report completion' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`/student/assignments/learning-goals/${goal.id}/completion`, {
      fileObjectIds: [], note: 'I can explain equivalent fractions.',
    }));
  });
  it('resumes the student’s existing session instead of creating another', () => {
    show({ ...goal, petrosParticipation: { started: true, completedSteps: 0, currentSessionId: 'current-session' } });
    expect(screen.getByRole('link', { name: 'Continue your session' })).toHaveAttribute('href', '/petros/session?session=current-session');
    expect(screen.queryByRole('button', { name: 'Start this learning goal' })).not.toBeInTheDocument();
  });
});
