import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const login = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));

vi.mock('@/lib/hooks', () => ({ useStudentLogin: () => login }));
vi.mock('@/lib/api-client', () => ({ formatApiError: (error: Error) => error.message }));

describe('student portal sign in', () => {
  beforeEach(() => {
    login.mutate.mockReset();
    login.isPending = false;
    login.error = null;
  });

  it('preserves sign-in values and the activation route', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email or student ID'), { target: { value: '  student-123  ' } });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: ' example-password ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to your portal' }));
    expect(login.mutate).toHaveBeenCalledWith({ identifier: 'student-123', password: ' example-password ' });
    expect(screen.getByRole('link', { name: 'Activate your account' })).toHaveAttribute('href', '/activate');
  });

  it('shows and hides the password without submitting', () => {
    render(<LoginPage />);
    const password = screen.getByLabelText('Password', { exact: true });
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(login.mutate).not.toHaveBeenCalled();
  });

  it('disables repeated sign-in while pending', () => {
    login.isPending = true;
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });

  it('announces sign-in errors accessibly', () => {
    login.error = new Error('Check your email or student ID and password.');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(login.error.message);
  });
});
