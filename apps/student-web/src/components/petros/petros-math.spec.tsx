import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathExpression, readableMathText } from './petros-math';

describe('Petros math rendering', () => {
  it('turns lightweight TeX in prose into readable mathematical notation', () => {
    expect(readableMathText('Integrate \\int 3x^2 \\, dx = x^3 + C.')).toBe(
      'Integrate ∫ 3x² dx = x³ + C.',
    );
  });

  it('renders equation steps as accessible KaTeX instead of raw commands', () => {
    const { container } = render(
      <MathExpression value="\\frac{d}{dx}(x^3) = 3x^2" />,
    );
    expect(container.querySelector('.katex-mathml math')).toBeTruthy();
    expect(container.querySelector('.katex-html')?.textContent).not.toContain('\\frac');
  });

  it('repairs the saved word integral only in equation fields', () => {
    const { container } = render(<MathExpression value="integral 3x² dx = x³ + C" />);
    expect(container.querySelector('.katex-mathml math')).toBeTruthy();
    expect(container.textContent).toContain('∫');
    expect(container.textContent).not.toContain('i n t e g r a l');
  });
});
