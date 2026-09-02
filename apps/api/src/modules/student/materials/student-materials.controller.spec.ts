import type { Response } from 'express';
import type { ApiEnv } from '@edrion/config';
import { describe, expect, it, vi } from 'vitest';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { StudentMaterialsController } from './student-materials.controller';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional',
  institutionId: '11111111-1111-4111-8111-111111111111',
  campusId: null,
  institutionUserId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  email: 'student@example.edu',
  fullName: 'Student Example',
  lastAuthAt: null,
  permissions: ['student.classes.view'],
};

function harness() {
  const file = vi.fn().mockResolvedValue({
    objectId: '44444444-4444-4444-8444-444444444444',
    storageKey: 'inst/example/material.pdf',
    filename: 'Interest theory.pdf',
    mimeType: 'application/pdf',
    derived: {},
  });
  const previewPages = vi.fn().mockResolvedValue([{ pageIndex: 0, text: 'Preview text' }]);
  const pipe = vi.fn();
  const stream = vi.fn(() => ({ pipe }));
  const readBuffer = vi.fn().mockResolvedValue(Buffer.from('document bytes'));
  const create = vi.fn().mockResolvedValue({ format: 'word', sections: [] });
  const resolve = vi.fn().mockResolvedValue(null);
  const metadata = vi.fn().mockResolvedValue({ pageCount: 3, mimeType: 'application/pdf' });
  const renderPage = vi.fn().mockResolvedValue(Buffer.from('png bytes'));
  const setHeader = vi.fn();
  const removeHeader = vi.fn();
  const send = vi.fn();
  const response = { setHeader, removeHeader, send } as unknown as Response;
  const controller = new StudentMaterialsController(
    { file, previewPages } as never,
    { stream, readBuffer } as never,
    { create } as never,
    { resolve, metadata, renderPage } as never,
    {
      API_CORS_ORIGINS: ['http://localhost:3011', 'https://students.edrion.example'],
    } as ApiEnv,
  );
  return {
    controller, file, previewPages, stream, readBuffer, create, resolve, metadata, renderPage,
    pipe, setHeader, removeHeader, send, response,
  };
}

describe('StudentMaterialsController document delivery', () => {
  it('serves authenticated previews inline and allows only configured Edrion frames', async () => {
    const h = harness();

    await h.controller.view(principal, 'material-id', h.response);

    expect(h.file).toHaveBeenCalledWith(principal, 'material-id');
    expect(h.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "inline; filename*=UTF-8''Interest%20theory.pdf",
    );
    expect(h.removeHeader).toHaveBeenCalledWith('X-Frame-Options');
    expect(h.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    expect(h.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "frame-ancestors 'self' http://localhost:3011 https://students.edrion.example",
    );
    expect(h.pipe).toHaveBeenCalledWith(h.response);
  });

  it('keeps the explicit download route as an attachment', async () => {
    const h = harness();

    await h.controller.file(principal, 'material-id', h.response);

    expect(h.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "attachment; filename*=UTF-8''Interest%20theory.pdf",
    );
    expect(h.removeHeader).not.toHaveBeenCalled();
    expect(h.pipe).toHaveBeenCalledWith(h.response);
  });

  it('serves a rendered PDF for a presentation preview while preserving the original download', async () => {
    const h = harness();
    h.resolve.mockResolvedValue({
      storageKey: 'inst/example/derived/slides.pdf',
      filename: 'Safety slides.pdf',
      mimeType: 'application/pdf',
    });

    await h.controller.view(principal, 'material-id', h.response);

    expect(h.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(h.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      "inline; filename*=UTF-8''Safety%20slides.pdf",
    );
    expect(h.stream).toHaveBeenCalledWith('inst/example/derived/slides.pdf');
  });

  it('serves metadata and rendered page images for the built-in document reader', async () => {
    const h = harness();

    await expect(h.controller.viewMetadata(principal, 'material-id')).resolves.toEqual({
      pageCount: 3,
      mimeType: 'application/pdf',
    });
    await h.controller.viewPage(principal, 'material-id', '2', h.response);

    expect(h.metadata).toHaveBeenCalledWith(expect.objectContaining({ storageKey: 'inst/example/material.pdf' }));
    expect(h.renderPage).toHaveBeenCalledWith(expect.objectContaining({ storageKey: 'inst/example/material.pdf' }), 2);
    expect(h.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(h.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'cross-origin');
    expect(h.send).toHaveBeenCalledWith(Buffer.from('png bytes'));
  });

  it('builds private document previews from the stored file and extracted pages', async () => {
    const h = harness();

    await h.controller.preview(principal, 'material-id');

    expect(h.file).toHaveBeenCalledWith(principal, 'material-id');
    expect(h.readBuffer).toHaveBeenCalledWith('inst/example/material.pdf');
    expect(h.previewPages).toHaveBeenCalledWith(principal, 'material-id');
    expect(h.create).toHaveBeenCalledWith({
      filename: 'Interest theory.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('document bytes'),
      extractedPages: [{ pageIndex: 0, text: 'Preview text' }],
    });
  });
});
