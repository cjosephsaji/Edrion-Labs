import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { lightTheme, radius, sizing, typography } from '@edrion/design-tokens';

/** Map a token key to its CSS variable so utilities resolve to live theme values. */
function colorVar(key: string): string {
  return `var(--${key})`;
}

const colors = Object.fromEntries(
  Object.keys(lightTheme).map((key) => [key, colorVar(key)]),
) as Record<string, string>;

const borderRadius = Object.fromEntries(
  Object.entries(radius).map(([k]) => [k, `var(--radius-${k})`]),
) as Record<string, string>;

const fontSize = typography.fontSize as unknown as Record<string, [string, string]>;

/**
 * Shared Tailwind preset for every app/package. Apps extend it with their own `content`.
 * All colours resolve to CSS variables published by @edrion/design-tokens — never hardcode.
 */
const preset: Omit<Config, 'content'> = {
  darkMode: ['class', "[data-theme='dark']"],
  theme: {
    extend: {
      colors,
      borderRadius,
      fontFamily: {
        sans: typography.fontFamily.sans.split(',').map((s) => s.trim()),
        mono: typography.fontFamily.mono.split(',').map((s) => s.trim()),
      },
      fontSize: Object.fromEntries(
        Object.entries(fontSize).map(([k, [size, line]]) => [k, [size, { lineHeight: line }]]),
      ) as Config['theme'],
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      height: {
        input: 'var(--size-input-height)',
        topbar: 'var(--size-topbar-height)',
        'table-row': 'var(--size-table-row-height)',
        'table-header': 'var(--size-table-header-height)',
      },
      width: {
        sidebar: 'var(--size-sidebar-width)',
        'sidebar-collapsed': 'var(--size-sidebar-collapsed-width)',
        drawer: 'var(--size-drawer-width)',
      },
      ringColor: { DEFAULT: colorVar('ring') },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        // Transparent light sweep for skeleton/loading placeholders.
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 160ms var(--ease-standard)',
        'fade-in': 'fade-in 140ms var(--ease-standard)',
        'slide-in-right': 'slide-in-right 180ms var(--ease-standard)',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        // Snappier button/action spinner (Tailwind's default is 1s) so clicks feel responsive.
        spin: 'spin 0.6s linear infinite',
      },
    },
  },
  plugins: [animate],
};

void sizing; // referenced via CSS vars; kept for token completeness

export default preset;
