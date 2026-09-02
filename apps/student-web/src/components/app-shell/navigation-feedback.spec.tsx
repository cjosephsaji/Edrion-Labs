import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationFeedback } from './navigation-feedback';

const mocks = vi.hoisted(() => ({ pathname: '/home' }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));

describe('NavigationFeedback', () => {
  beforeEach(() => {
    mocks.pathname = '/home';
    window.history.replaceState({}, '', '/home');
    delete document.documentElement.dataset.routePending;
  });

  it('announces an internal destination immediately and blocks repeat clicks', () => {
    const navigate = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(
      <>
        <NavigationFeedback />
        <a href="/courses" onClick={navigate}>Courses</a>
      </>,
    );

    const link = screen.getByRole('link', { name: 'Courses' });
    fireEvent.click(link);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('data-route-pending', 'true');
    expect(document.documentElement).toHaveAttribute('data-route-pending', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Opening Courses…');

    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('ignores current-page, modified, and external links', () => {
    render(
      <>
        <NavigationFeedback />
        <a href="/home" onClick={(event) => event.preventDefault()}>Current</a>
        <a href="/courses" onClick={(event) => event.preventDefault()}>Modified</a>
        <a href="https://example.com" onClick={(event) => event.preventDefault()}>External</a>
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Current' }));
    fireEvent.click(screen.getByRole('link', { name: 'Modified' }), { metaKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'External' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-route-pending');
  });
});
