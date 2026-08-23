import React, { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
            kindLabel: 'PDF',
            weekNo: 1,
            className: 'Test Class A',
            filename: 'module-1.pdf',
            mimeType: 'application/pdf',
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
  it('opens documents inside Edrion while keeping external and download alternatives', () => {
    render(<Page />);

    const openButton = screen.getByRole('button', {
      name: 'View CST 423 Cloud Computing — Module 1 Revision Questions in Edrion',
    });
    fireEvent.click(openButton);

    expect(screen.getByRole('dialog', { name: 'CST 423 Cloud Computing — Module 1 Revision Questions' })).toBeInTheDocument();
    expect(screen.getByTitle('CST 423 Cloud Computing — Module 1 Revision Questions document')).toHaveAttribute(
      'src',
      'http://localhost:3007/v1/student/materials/material-1/view#page=1&zoom=page-width',
    );
    expect(screen.getByRole('link', { name: 'Open document in a new tab' })).toHaveAttribute(
      'href',
      'http://localhost:3007/v1/student/materials/material-1/view',
    );
    expect(screen.getByRole('link', { name: 'Download CST 423 Cloud Computing — Module 1 Revision Questions' })).toHaveAttribute(
      'href',
      'http://localhost:3007/v1/student/materials/material-1/file',
    );

    const teachButton = screen.getByRole('button', { name: /Teach me this page/ });
    expect(teachButton).toBeEnabled();
    expect(openButton).not.toContainElement(teachButton);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
