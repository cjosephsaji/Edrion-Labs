import React, { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

vi.mock('@/lib/api-client', () => ({
  formatApiError: () => 'Request failed',
  useStudentApi: () => ({
    fileUrl: (path: string) => `http://localhost:3007/v1${path}`,
  }),
}));

vi.mock('@/lib/hooks', () => ({
  useStudentList: (key: string) => key === 'materials'
    ? {
        data: {
          items: [{
            id: 'material-1',
            title: 'CST 423 Cloud Computing — Module 1 Revision Questions',
            description: 'Teacher-assigned revision sheet.',
            kindLabel: 'DOCX',
            weekNo: 1,
            className: 'Test Class A',
            publishedAt: '2026-08-19T00:00:00.000Z',
          }],
        },
      }
    : {
        data: {
          items: [{
            id: 'source-1',
            title: 'CST 423 Cloud Computing — Module 1 Revision Questions',
            kind: 'docx',
            pageCount: 1,
            status: 'ready',
            extractionReady: true,
            pagesDone: 1,
            origin: { classMaterialId: 'material-1' },
            version: 1,
            updatedAt: '2026-08-19T00:00:00.000Z',
          }],
        },
        error: null,
        isLoading: false,
      },
}));

vi.mock('@/components/query-page', () => ({
  QueryPage: ({ query, children }: { query: { data: unknown }; children: (data: unknown) => ReactNode }) => children(query.data),
}));

vi.mock('@/components/design-system', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@/components/petros/petros-door-button', () => ({
  PetrosDocumentDoor: ({ title }: { title: string }) => <button type="button">Teach me this page from {title}</button>,
}));

describe('Study materials', () => {
  it('keeps document download and Petros teaching as separate actions', () => {
    render(<Page />);

    const link = screen.getByRole('link', {
      name: 'Open CST 423 Cloud Computing — Module 1 Revision Questions',
    });
    expect(link).toHaveAttribute(
      'href',
      'http://localhost:3007/v1/student/materials/material-1/file',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Open document')).toBeInTheDocument();
    const teachButton = screen.getByRole('button', { name: /Teach me this page/ });
    expect(teachButton).toBeEnabled();
    expect(teachButton.closest('a')).toBeNull();
    expect(link).not.toContainElement(teachButton);
  });
});
