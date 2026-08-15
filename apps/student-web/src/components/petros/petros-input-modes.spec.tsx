import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosInputModes } from './petros-input-modes';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  upload: vi.fn(),
  push: vi.fn(),
  id: 0,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => ({ post: mocks.post, uploadPetrosMedia: mocks.upload }),
  newIdempotencyKey: () => `00000000-0000-4000-8000-${String(++mocks.id).padStart(12, '0')}`,
  formatApiError: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

describe('Petros input modes', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.upload.mockReset();
    mocks.push.mockReset();
    mocks.id = 0;
  });

  it('exposes five native-feeling, keyboard-selectable modes and a camera/file fallback', () => {
    const { container } = render(<PetrosInputModes />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: /Snap a question/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const file = container.querySelector('input[type="file"]');
    expect(file).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(file).toHaveAttribute('capture', 'environment');

    fireEvent.click(screen.getByRole('tab', { name: /Voice session/ }));
    expect(
      screen.getByText(/never records after pause, tab backgrounding, or close/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/complete text equivalent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Walking mode/i)).toBeInTheDocument();
  });

  it('shows the finite promise and starts only the explicit four-move session', async () => {
    mocks.post.mockResolvedValueOnce({
      session: { id: '11111111-1111-4111-8111-111111111111' },
    });
    render(<PetrosInputModes />);
    fireEvent.click(screen.getByRole('tab', { name: /Five-minute mode/ }));
    expect(screen.getByText(/4 moves · about 5 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/Continuing requires a separate explicit choice/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('One concept'), {
      target: { value: 'chain rule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start the five-minute session' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith(
      '/student/petros/five-minute/sessions',
      expect.objectContaining({ concept: 'chain rule' }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      '/petros/session?session=11111111-1111-4111-8111-111111111111&mode=five-minute',
    );
  });
});
