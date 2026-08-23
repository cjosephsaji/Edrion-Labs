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
    storageKey: 'inst/example/material.pdf',
    filename: 'Interest theory.pdf',
    mimeType: 'application/pdf',
  });
  const pipe = vi.fn();
  const stream = vi.fn(() => ({ pipe }));
  const setHeader = vi.fn();
  const removeHeader = vi.fn();
  const response = { setHeader, removeHeader } as unknown as Response;
  const controller = new StudentMaterialsController(
    { file } as never,
    { stream } as never,
    {
      API_CORS_ORIGINS: ['http://localhost:3011', 'https://students.edrion.example'],
    } as ApiEnv,
  );
  return { controller, file, stream, pipe, setHeader, removeHeader, response };
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
});
