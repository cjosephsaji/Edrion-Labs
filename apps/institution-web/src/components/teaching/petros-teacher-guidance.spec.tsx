import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PetrosTeacherGuidance } from './petros-teacher-guidance';
const client = { get: vi.fn(), post: vi.fn() },
  scope = { mode: 'institution' };
vi.mock('@/lib/portal-client', () => ({
  usePortalClient: () => client,
  formatPortalError: () => 'Action unavailable.',
}));
vi.mock('@/lib/scope', () => ({ useScope: () => ({ scope }) }));
vi.mock('@/lib/format', () => ({
  useFormat: () => ({ date: (value: string) => value.slice(0, 10) }),
}));
vi.mock('./petros-guidance-attachments', () => ({
  GuidanceAttachments: () => <p>Permitted attachments</p>,
  GuidanceFileList: () => null,
}));
const assignment = {
  classId: '00000000-0000-4000-8000-000000000001',
  subjectId: '00000000-0000-4000-8000-000000000002',
  className: 'Synthetic class',
  subjectName: 'Synthetic subject',
} as never;
function mount(mode: 'goals' | 'progress' = 'goals') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <PetrosTeacherGuidance assignment={assignment} mode={mode} demo />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  client.get.mockResolvedValue({ students: [], goals: [] });
  client.post.mockResolvedValue({ id: 'synthetic-goal' });
});
afterEach(cleanup);
it('shows no functional assignment form without authorized recipients', async () => {
  mount();
  await screen.findByText('No students are available in this demo.');
  expect(
    screen.queryByRole('button', { name: 'Assign learning goal' }),
  ).toBeNull();
  expect(
    screen.queryByLabelText('What should they learn or improve?'),
  ).toBeNull();
  expect(client.post).not.toHaveBeenCalled();
});
it('keeps progress separate and uses only returned evidence', async () => {
  mount('progress');
  await screen.findByText('No student progress available yet');
  expect(screen.queryByText('Give students a learning goal')).toBeNull();
  expect(
    screen.getByText(/No learning evidence has been recorded/),
  ).toBeTruthy();
});
it('reviews a goal before using the existing authorized recipient operation', async () => {
  const studentId = '00000000-0000-4000-8000-000000000003';
  client.get.mockResolvedValue({
    students: [{ id: studentId, name: 'Synthetic recipient', rollNo: 'S1' }],
    goals: [],
  });
  mount();
  await screen.findByText('Synthetic recipient');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(
    screen.getByLabelText('What should they learn or improve?'),
    { target: { value: 'Compare supported claims and evidence' } },
  );
  expect(client.post).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Preview learning goal' }),
  );
  expect(screen.getByLabelText('Learning goal preview')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Assign learning goal' }));
  await waitFor(() => expect(client.post).toHaveBeenCalled());
  expect(client.post.mock.calls[0]?.[0]).toBe(
    '/portal/teaching/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/guidance',
  );
  expect(client.post.mock.calls[0]?.[2]).toMatchObject({
    schemaVersion: 'petros.teacher-guidance.v1',
    focus: 'Compare supported claims and evidence',
    audience: { kind: 'students', studentIds: [studentId] },
    attachmentObjectIds: [],
  });
});

it('distinguishes permitted recipients from disabled demo assignment',async()=>{
  client.get.mockResolvedValue({students:[{id:'one',name:'Fixture one',rollNo:null},{id:'two',name:'Fixture two',rollNo:null}],goals:[],assignmentAvailability:{available:false,reason:'Student assignment is disabled in this isolated lesson preview.'}});
  mount();await screen.findByText('Student assignment unavailable');
  expect(screen.getByText('2 permitted recipients for learning goals')).toBeTruthy();
  expect(screen.queryByLabelText('Who should learn this?')).toBeNull();expect(client.post).not.toHaveBeenCalled();
});
