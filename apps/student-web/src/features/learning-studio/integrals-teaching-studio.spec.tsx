import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { IntegralsTeachingStudio } from './integrals-teaching-studio';
import { PetrosRig } from './petros-rig';

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  });
});

describe('integrals teaching studio', () => {
  it('requires an explicit mode choice before teaching starts', () => {
    render(<IntegralsTeachingStudio />);
    expect(screen.getByRole('button', { name: 'Learn with Petros' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Read quietly' })).toBeVisible();
  });

  it('keeps the visual, explanation, target and interruption draft together', () => {
    render(<IntegralsTeachingStudio />);
    fireEvent.click(screen.getByRole('button', { name: 'Read quietly' }));
    expect(screen.getByText(/Differentiating x cubed/i)).toBeVisible();
    expect(document.querySelector('[data-petros-target="integrals:relationship"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ask Petros/i }));
    const draft = screen.getByLabelText('Your question');
    fireEvent.change(draft, { target: { value: 'Why does the constant disappear?' } });
    expect(draft).toHaveValue('Why does the constant disappear?');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('renders the original Petros character artwork', () => {
    render(<PetrosRig state="point" />);
    expect(screen.getByRole('img', { name: 'Petros' }).querySelector('img[data-active="true"]')).toHaveAttribute(
      'src',
      '/petros/states/petros-point-left.png',
    );
  });
});
