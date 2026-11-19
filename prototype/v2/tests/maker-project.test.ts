import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  cloneProject,
  compileScript,
  deletePart,
  duplicatePart,
  findPart,
  initialProject,
  projectScript,
  reparent,
  shapes,
  validateProject,
  worldMatrix,
} from '../core/maker-project';
import {
  applyWorldTransform,
  geometryFacts,
  partGeometry,
  meshVolume,
  projectOBJ,
} from '../core/maker-geometry';
import { localProposal } from '../core/maker-prompt';

describe('editable assembly model', () => {
  it('constructs a parametric radial mechanism and moves attached parts around its pivot', () => {
    const p = initialProject();
    expect(p.parts).toHaveLength(8);
    const a = new Vector3().setFromMatrixPosition(worldMatrix(p, 'blade', 0)),
      b = new Vector3().setFromMatrixPosition(worldMatrix(p, 'blade', 0.625));
    expect(a.toArray()).toEqual([48, 142, 20]);
    expect(b.x).toBeCloseTo(0, 8);
    expect(b.y).toBeCloseTo(190, 8);
    expect(
      new Vector3().setFromMatrixPosition(worldMatrix(p, 'base', 3)).toArray(),
    ).toEqual([0, 6, 0]);
  });
  it('reparents under rotated parents without moving a part in world space', () => {
    const p = compileScript(
      'box base size 30 30 30 at 20 30 40 rotate 0 40 0\nsphere sensor size 10 10 10 at 80 90 60',
    );
    const before = worldMatrix(p, 'sensor'),
      next = reparent(p, 'sensor', 'base');
    worldMatrix(next, 'sensor').elements.forEach((v, i) =>
      expect(v).toBeCloseTo(before.elements[i], 8),
    );
    expect(findPart(next, 'sensor').parent).toBe('base');
    expect(() => reparent(next, 'base', 'sensor')).toThrow(/circular/);
  });
  it('edits a child through a world-space gizmo while preserving local hierarchy', () => {
    const p = compileScript(
      'box base at 100 0 0\nbox child at 10 20 0\nattach child to base',
    );
    const next = validateProject(
      applyWorldTransform(p, 'child', [150, 40, 0], [0, 0, 0], [2, 1, 1]),
    );
    expect(findPart(next, 'child').position).toEqual([50, 40, 0]);
    expect(findPart(next, 'child').size).toEqual([80, 40, 40]);
    expect(
      new Vector3().setFromMatrixPosition(worldMatrix(next, 'child')).toArray(),
    ).toEqual([150, 40, 0]);
  });
  it('deleting a parent preserves its children and duplicating preserves editable properties', () => {
    const p = initialProject(),
      before = worldMatrix(p, 'blade'),
      next = deletePart(p, 'rotor');
    expect(findPart(next, 'blade').parent).toBeNull();
    worldMatrix(next, 'blade').elements.forEach((v, i) =>
      expect(v).toBeCloseTo(before.elements[i], 8),
    );
    const copy = duplicatePart(p, 'base');
    expect(findPart(copy, 'base_copy').size).toEqual(findPart(p, 'base').size);
    expect(p.parts).toHaveLength(8);
  });
  it('round-trips every part, relation and motion through its editable source', () => {
    const p = initialProject(),
      restored = compileScript(projectScript(p), p.title);
    expect(
      restored.parts.map((part) => ({
        ...part,
        position: part.position.map((n) => +n.toFixed(4) || 0),
      })),
    ).toEqual(
      p.parts.map((part) => ({
        ...part,
        position: part.position.map((n) => +n.toFixed(4) || 0),
      })),
    );
  });
  it('rejects malformed, cyclic, oversized and executable input atomically', () => {
    for (const code of [
      'box a size 0 4 5',
      'box a\nbox a',
      'box a\nbox b\nattach a to b\nattach b to a',
      'while(true) {}',
      'box x\nradial x 100000 around x z 10',
      'box world',
      'box x at NaN 0 0',
      'box x color red',
      'box x\nspin x q 20',
    ])
      expect(() => compileScript(code)).toThrow();
    const p = cloneProject(initialProject());
    delete (p.parts[0] as Partial<(typeof p.parts)[0]>).id;
    expect(() => validateProject(p)).toThrow();
    expect(() =>
      compileScript(
        Array.from({ length: 65 }, (_, i) => `box part_${i}`).join('\n'),
      ),
    ).toThrow(/64/);
    expect(() => compileScript('box p size $missing 10 10')).toThrow(/Line 1/);
  });
});
describe('measurements and reusable geometry', () => {
  it('matches analytic box, cylinder, sphere, cone and tube volume within tessellation tolerance', () => {
    const expected: Record<string, number> = {
      box: 1000,
      cylinder: Math.PI * 250,
      sphere: (Math.PI * 1000) / 6,
      cone: (Math.PI * 250) / 3,
      tube: Math.PI * (25 - 12.25) * 10,
    };
    for (const shape of shapes) {
      const p = compileScript(`${shape} part size 10 10 10`),
        g = partGeometry(p.parts[0]),
        volume = meshVolume(g);
      g.dispose();
      expect(volume).toBeGreaterThan(0);
      if (expected[shape])
        expect(Math.abs(volume / expected[shape] - 1)).toBeLessThan(0.015);
    }
  });
  it('dimensional edits change material mass and density changes preserve volume', () => {
    const a = compileScript('box block size 100 20 30 material polymer'),
      b = compileScript('box block size 200 20 30 material polymer'),
      c = compileScript('box block size 100 20 30 material aluminium');
    expect(geometryFacts(a).mass).toBeCloseTo(74.4, 6);
    expect(geometryFacts(b).mass).toBeCloseTo(148.8, 6);
    expect(geometryFacts(c).mass).toBeCloseTo(162, 6);
    expect(geometryFacts(c).volume).toEqual(geometryFacts(a).volume);
  });
  it('exports named geometry with attachment transforms in millimetres', () => {
    const obj = projectOBJ(
      compileScript(
        'box parent size 10 10 10 at 100 0 0\nbox child size 10 10 10 at 20 0 0\nattach child to parent',
      ),
    );
    expect(obj).toContain('units: millimetres');
    expect(obj).toContain('o child');
    expect(obj).toContain('v 125');
    expect(obj).toMatch(/\nf \d+ \d+ \d+/);
  });
});
describe('real prompt edits', () => {
  it('creates arbitrary dimensions and changes an existing part without mutating the source', () => {
    const p = initialProject(),
      proposal = localProposal(p, 'base', 'Make base wider by 20 mm')!;
    expect(findPart(proposal.project, 'base').size[0]).toBe(130);
    expect(findPart(p, 'base').size[0]).toBe(110);
    const added = localProposal(
      p,
      null,
      'Add a cylinder named axle 12 x 80 x 12 mm',
    )!;
    expect(findPart(added.project, 'axle').size).toEqual([12, 80, 12]);
    expect(
      findPart(
        localProposal(p, 'base', 'double the height of selected')!.project,
        'base',
      ).size[1],
    ).toBe(24);
    expect(
      findPart(
        localProposal(p, 'rotor', 'spin it around z at 45 rpm')!.project,
        'rotor',
      ).rpm,
    ).toBe(45);
  });
  it('never pretends an unknown or partially understood request succeeded', () => {
    expect(
      localProposal(
        initialProject(),
        null,
        'Build a levitating working quantum engine',
      ),
    ).toBeNull();
    expect(
      localProposal(
        initialProject(),
        'base',
        'make base width 100 mm and delete everything',
      ),
    ).toBeNull();
    expect(() =>
      localProposal(initialProject(), 'base', 'set base width to -10'),
    ).toThrow();
  });
});
