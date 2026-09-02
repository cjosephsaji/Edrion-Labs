import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LearnCrossLinks } from './learn-links';

const route = vi.hoisted(() => ({ pathname: '/materials' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

describe('Learning workspace navigation', () => {
  it.each([
    ['/learn', 'Overview'], ['/materials', 'Library'], ['/notes', 'Notes'], ['/notes/123', 'Notes'],
    ['/progress', 'Progress'], ['/learning-path', 'Progress'],
  ])('marks the current section at %s', (pathname, label) => {
    route.pathname = pathname;
    render(<LearnCrossLinks />);
    expect(screen.getByRole('navigation', { name: 'Learning workspace' })).toBeVisible();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.queryByText('Teacher files and uploads')).not.toBeInTheDocument();
  });
});
