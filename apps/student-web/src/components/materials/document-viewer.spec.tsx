import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentViewer, previewKind } from './document-viewer';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('DocumentViewer', () => {
  it.each([
    ['notes.doc', 'application/msword'],
    ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['marks.xls', 'application/vnd.ms-excel'],
    ['marks.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['marks.csv', 'text/csv'],
    ['notes.txt', 'text/plain'],
    ['notes.md', 'text/markdown'],
  ])('recognizes %s as an in-app document preview', (filename, mimeType) => {
    expect(previewKind(mimeType, 'File', filename)).toBe('structured');
  });

  it.each([
    ['slides.ppt', 'application/vnd.ms-powerpoint'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['slides.odp', 'application/vnd.oasis.opendocument.presentation'],
  ])('recognizes %s as a layout-faithful presentation preview', (filename, mimeType) => {
    expect(previewKind(mimeType, 'File', filename)).toBe('presentation');
  });

  it('also recognizes accepted documents when the upload has a generic MIME type', () => {
    for (const filename of ['file.doc', 'file.docx', 'file.xls', 'file.xlsx', 'file.csv', 'file.txt', 'file.md']) {
      expect(previewKind('application/octet-stream', 'File', filename)).toBe('structured');
    }
    for (const filename of ['file.ppt', 'file.pptx']) {
      expect(previewKind('application/octet-stream', 'File', filename)).toBe('presentation');
    }
  });

  it('opens presentations through the layout-faithful page renderer instead of the text extractor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pageCount: 12 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DocumentViewer
        material={{ id: 'deck-1', title: 'Safety', kindLabel: 'Slides', filename: 'safety.pptx', mimeType: 'application/octet-stream' }}
        previewUrl="/view"
        documentPreviewUrl="/preview"
        downloadUrl="/file"
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByAltText('Safety, page 1 of 12')).toHaveAttribute('src', '/view/pages/1');
    expect(fetchMock).toHaveBeenCalledWith('/view/metadata', expect.objectContaining({ credentials: 'include' }));
    expect(fetchMock).not.toHaveBeenCalledWith('/preview', expect.anything());
  });

  it('loads and displays a private readable preview without injecting document HTML', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        format: 'word',
        sections: [{
          title: 'Page 1',
          text: 'Cloud service models\n<script>window.bad = true</script>',
          rows: null,
        }],
        truncated: false,
        note: 'Download for exact formatting.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DocumentViewer
        material={{
          id: 'material-1',
          title: 'Cloud notes',
          kindLabel: 'Doc',
          filename: 'cloud.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }}
        previewUrl="http://localhost:3007/v1/student/materials/material-1/view"
        documentPreviewUrl="http://localhost:3007/v1/student/materials/material-1/preview"
        downloadUrl="http://localhost:3007/v1/student/materials/material-1/file"
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByText(/Cloud service models/)).toBeInTheDocument();
    expect(screen.getByText(/<script>window\.bad = true<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('.previewText script')).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3007/v1/student/materials/material-1/preview',
      expect.objectContaining({ credentials: 'include' }),
    ));
  });

  it('renders spreadsheet data as a table', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        format: 'spreadsheet',
        sections: [{ title: 'Marks', text: null, rows: [['Student', 'Score'], ['Alex', '87']] }],
        truncated: false,
        note: null,
      }),
    }));

    render(
      <DocumentViewer
        material={{ id: 'sheet-1', title: 'Marks', kindLabel: 'Sheet', filename: 'marks.xlsx', mimeType: 'application/vnd.ms-excel' }}
        previewUrl="/view"
        documentPreviewUrl="/preview"
        downloadUrl="/file"
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
  });
});
