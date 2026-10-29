import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePasswordPage from './change-password/page';
import LoginPage from './login/page';
import AppLayout from '../(app)/layout';
import { StudentApiError } from '@/lib/api-client';

const mocks = vi.hoisted(() => ({
  me: { data: { passwordChangeRequired: true }, isLoading: false, error: null as unknown },
  replace: vi.fn(), post: vi.fn(), removeQueries: vi.fn(), login: vi.fn(), logout: vi.fn(),
  loginError: null as unknown,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ removeQueries: mocks.removeQueries }) }));
vi.mock('@/lib/hooks', () => ({
  useStudentMe: () => mocks.me,
  useStudentLogin: () => ({ mutate: mocks.login, isPending: false, error: mocks.loginError, reset: vi.fn() }),
  useStudentLogout: () => ({ mutate: mocks.logout, isPending: false }),
}));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-client')>(),
  useStudentApi: () => ({ post: mocks.post }),
}));
vi.mock('@/components/app-shell/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/ui/states', () => ({ LoadingBlock: ({ label }: { label: string }) => <p>{label}</p>, UnauthorizedState: () => <p>Sign in</p> }));

describe('student first sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.me.data = { passwordChangeRequired: true };
    mocks.me.error = null;
    mocks.loginError = null;
    mocks.post.mockResolvedValue({ passwordChanged: true });
  });
  it('signs in with student ID and password without asking for an institution code', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email or student ID'), { target: { value: 'ADM-1024' } });
    expect(screen.queryByLabelText('Institution code')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ADM-1024' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to your portal' }));
    expect(mocks.login).toHaveBeenCalledWith({ identifier: 'ADM-1024', password: 'ADM-1024' });
  });
  it('asks for an institution code only after an ambiguous student ID response', () => {
    mocks.loginError = new StudentApiError(400, 'INSTITUTION_CODE_REQUIRED', 'Enter your institution code.');
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email or student ID'), { target: { value: 'ADM-1024' } });
    fireEvent.change(screen.getByLabelText('Institution code'), { target: { value: 'SCHOOL' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ADM-1024' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to your portal' }));
    expect(mocks.login).toHaveBeenCalledWith({ identifier: 'ADM-1024', password: 'ADM-1024', institutionCode: 'SCHOOL' });
  });
  it('keeps email sign-in available without requiring an institution code', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email or student ID'), { target: { value: 'alex@example.com' } });
    expect(screen.queryByLabelText('Institution code')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'NewSecret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to your portal' }));
    expect(mocks.login).toHaveBeenCalledWith({ identifier: 'alex@example.com', password: 'NewSecret123' });
  });
  it('redirects direct portal navigation and does not mount protected page content', () => {
    render(<AppLayout><p>Private portal content</p></AppLayout>);
    expect(screen.queryByText('Private portal content')).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith('/change-password');
  });
  it('requires matching confirmation before sending a password change', () => {
    render(<ChangePasswordPage />);
    fillPasswords('NewSecret123', 'Different123');
    fireEvent.click(screen.getByRole('button', { name: 'Save password and open portal' }));
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('sends a new password, clears cached student data and opens the portal after success', async () => {
    render(<ChangePasswordPage />);
    expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument();
    fillPasswords('NewSecret123', 'NewSecret123');
    fireEvent.click(screen.getByRole('button', { name: 'Save password and open portal' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/home'));
    expect(mocks.post).toHaveBeenCalledWith('/student/auth/change-password', {
      newPassword: 'NewSecret123', confirmPassword: 'NewSecret123',
    });
    expect(mocks.removeQueries).toHaveBeenCalledWith({ queryKey: ['student'] });
  });
  it('keeps password setup open when saving fails', async () => {
    mocks.post.mockRejectedValue(new Error('Could not save password'));
    render(<ChangePasswordPage />);
    fillPasswords('NewSecret123', 'NewSecret123');
    fireEvent.click(screen.getByRole('button', { name: 'Save password and open portal' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mocks.replace).not.toHaveBeenCalledWith('/home');
    expect(screen.getByRole('button', { name: 'Save password and open portal' })).toBeEnabled();
  });
});

function fillPasswords(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } });
}
