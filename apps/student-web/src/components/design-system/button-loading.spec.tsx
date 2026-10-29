import React, { type ButtonHTMLAttributes, type ComponentType, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { Plus } from 'lucide-react';
import { Button } from '@edrion/ui';
import { ActionButton } from './action-button';
import styles from './primitives.module.css';

// Use the real styles: the regression is a visible duplicate icon, including inside fragments.
let stylesheet: HTMLStyleElement;
beforeAll(async () => {
  const source = readFileSync(resolve('../../packages/ui/src/button.tsx'), 'utf8');
  const utilities = await postcss([
    tailwindcss({
      content: [{ raw: source, extension: 'tsx' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  const studentStyles = postcss.parse(
    readFileSync(resolve('src/components/design-system/primitives.module.css'), 'utf8'),
  );
  const loadingRules: string[] = [];
  studentStyles.walkRules((rule) => {
    if (rule.selector.includes('.action[data-loading-indicator=')) {
      loadingRules.push(rule.toString().replaceAll('.action', `.${styles.action}`));
    }
  });
  stylesheet = document.createElement('style');
  stylesheet.textContent = utilities.css + loadingRules.join('\n');
  document.head.append(stylesheet);
});
afterAll(() => stylesheet.remove());

type LoadingButton = ComponentType<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    children: ReactNode;
  }
>;

describe.each<[string, LoadingButton]>([
  ['shared Button', Button],
  ['student ActionButton', ActionButton],
])('%s loading icons', (_name, TestButton) => {
  it.each(['fragment', 'nested wrapper'])(
    'replaces the icon inside a %s and restores it afterwards',
    (shape) => {
      const action = vi.fn();
      const content = (
        <>
          <Plus data-testid="action-icon" /> <span className="h-4 w-4">Add staff member</span>
        </>
      );
      const children = shape === 'fragment' ? content : <span>{content}</span>;
      const { rerender } = render(<TestButton onClick={action}>{children}</TestButton>);
      expect(screen.getByTestId('action-icon')).toBeVisible();

      rerender(
        <TestButton loading onClick={action}>
          {children}
        </TestButton>,
      );
      const button = screen.getByRole('button', { name: 'Add staff member' });
      expect(screen.getByTestId('action-icon')).not.toBeVisible();
      expect(button.querySelector('[data-button-spinner]')).toBeVisible();
      expect(screen.getByText('Add staff member')).toBeVisible();
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      fireEvent.click(button);
      expect(action).not.toHaveBeenCalled();

      rerender(<TestButton onClick={action}>{children}</TestButton>);
      expect(screen.getByTestId('action-icon')).toBeVisible();
      expect(button.querySelector('[data-button-spinner]')).toBeNull();
      expect(button).toBeEnabled();
    },
  );

  it('shows only the spinner in an icon-only button while preserving its accessible name', () => {
    render(
      <TestButton loading aria-label="Add staff member">
        <Plus data-testid="action-icon" />
      </TestButton>,
    );
    const button = screen.getByRole('button', { name: 'Add staff member' });
    expect(screen.getByTestId('action-icon')).not.toBeVisible();
    expect(button.querySelector('[data-button-spinner]')).toBeVisible();
  });
});
