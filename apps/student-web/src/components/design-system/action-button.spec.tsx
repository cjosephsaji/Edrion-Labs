import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionButton } from './action-button';

describe('ActionButton loading state', () => {
  it('shows progress, announces busy state, and prevents repeat actions', () => {
    const action = vi.fn();
    render(
      <ActionButton loading loadingLabel="Saving changes…" onClick={action}>
        Save changes
      </ActionButton>,
    );

    const button = screen.getByRole('button', { name: 'Saving changes…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
  });
});
