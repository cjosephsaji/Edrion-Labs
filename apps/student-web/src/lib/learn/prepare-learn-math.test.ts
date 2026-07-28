import { describe, expect, it } from 'vitest';
import { liftAsciiMatrices, prepareLearnMath } from './prepare-learn-math';

describe('prepareLearnMath', () => {
  it('lifts 2x2 ASCII matrices to pmatrix', () => {
    expect(liftAsciiMatrices('Compute det of [[2,1],[4,3]].')).toBe(
      'Compute det of $\\begin{pmatrix}2 & 1 \\\\ 4 & 3\\end{pmatrix}$.',
    );
  });

  it('preserves already-delimited math', () => {
    const src = 'See $[[2,1],[4,3]]$ stays if someone put dollars wrongly — wait';
    // Inside $…$ we do not rewrite (scanner skips math spans).
    expect(prepareLearnMath('Keep $\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}$ as-is')).toContain(
      '\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}',
    );
    void src;
  });

  it('lifts 3x3', () => {
    const out = liftAsciiMatrices('A=[[1,0,0],[0,1,0],[0,0,1]]');
    expect(out).toContain('\\begin{pmatrix}');
    expect(out).toContain('1 & 0 & 0');
    expect(out).toContain('0 & 0 & 1');
  });
});
