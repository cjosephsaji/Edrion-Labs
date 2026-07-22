import { describe, expect, it } from 'vitest';
import { isReservedNtaSkin, resolveRenderSkin } from './skin-resolver';

describe('mock exam skin resolver (D-T2-017)', () => {
  it('maps nta → standard (fallback, not a bespoke NTA component)', () => {
    expect(resolveRenderSkin('nta')).toBe('standard');
  });

  it('keeps paper and standard as themselves', () => {
    expect(resolveRenderSkin('paper')).toBe('paper');
    expect(resolveRenderSkin('standard')).toBe('standard');
  });

  it('defaults unknown/null to standard', () => {
    expect(resolveRenderSkin(null)).toBe('standard');
    expect(resolveRenderSkin(undefined)).toBe('standard');
    expect(resolveRenderSkin('legacy')).toBe('standard');
  });

  it('flags reserved nta for the coming-soon chrome note', () => {
    expect(isReservedNtaSkin('nta')).toBe(true);
    expect(isReservedNtaSkin('standard')).toBe(false);
    expect(isReservedNtaSkin('paper')).toBe(false);
  });

  it('does not expose an nta render target (component swap later)', () => {
    const rendered = resolveRenderSkin('nta');
    expect(rendered).not.toBe('nta' as never);
    // Only standard|paper are render skins today
    expect(['standard', 'paper']).toContain(rendered);
  });
});
