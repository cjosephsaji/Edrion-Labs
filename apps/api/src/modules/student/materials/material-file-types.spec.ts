import { describe, expect, it } from 'vitest';
import { canonicalMaterialMimeType, isPresentationMaterial } from './material-file-types';

describe('material file type normalization', () => {
  it('recovers browser-renderable types when raw uploads use application/octet-stream', () => {
    expect(canonicalMaterialMimeType('lesson.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(canonicalMaterialMimeType('lesson.pptx', 'application/octet-stream')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  });

  it('recognizes presentations from either filename or media type', () => {
    expect(isPresentationMaterial('lesson.pptx', 'application/octet-stream')).toBe(true);
    expect(isPresentationMaterial(null, 'application/vnd.ms-powerpoint')).toBe(true);
    expect(isPresentationMaterial('lesson.pdf', 'application/pdf')).toBe(false);
  });
});
