import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import tailwindTypography from '@tailwindcss/typography';
import { lightTheme, radius, sizing, typography } from '@edrion/design-tokens';

/** Map a token key to its CSS variable so utilities resolve to live theme values. */
function colorVar(key: string): string {
  return `var(--${key})`;
}

const colors = Object.fromEntries(
  Object.keys(lightTheme).map((key) => [key, colorVar(key)]),
) as Record<string, string>;

const stColors = [
  'page', 'card', 'cardAlt', 'surface2', 'bd1', 'bd2', 'divider', 'ink', 'inkSoft', 'muted', 'faint', 'faint2',
  'accent', 'accentDeep', 'accentSoft', 'accentSoft2', 'accentBd', 'accentLine', 'amber', 'amberSoft', 'amberBd', 'amberInk',
  'danger', 'dangerSoft', 'violet', 'violetSoft', 'blue', 'blueSoft', 'gold', 'goldSoftBg', 'goldBd', 'goldInk', 'mintBg',
  'selection', 'success', 'sidebar', 'canvasGrid', 'canvasEdge', 'canvasAlternative', 'canvasMissing',
].reduce(
  (acc, key) => {
    acc[`st-${key}`] = `var(--st-${key})`;
    return acc;
  },
  {} as Record<string, string>,
);

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
      colors: { ...colors, ...stColors },
      borderRadius,
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        'mono-ui': ['var(--font-mono-ui)'],
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
        'st-block-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'st-fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'st-pop-in': {
          '0%': { transform: 'scale(0.86)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'st-soft-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(30,122,94,.32)' },
          '55%': { boxShadow: '0 0 0 7px rgba(30,122,94,0)' },
        },
        'st-burst': {
          '0%': { transform: 'translate(0,0) scale(1)', opacity: '1' },
          '100%': {
            transform: 'translate(var(--tx), var(--ty)) scale(0.2)',
            opacity: '0',
          },
        },
        'st-slide-in-drawer': {
          from: { transform: 'translateX(26px)', opacity: '0' },
          to: { transform: 'none', opacity: '1' },
        },
        'st-sheet-in': {
          from: { transform: 'translateY(36px)', opacity: '0' },
          to: { transform: 'none', opacity: '1' },
        },
        'st-dot-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-4px)' },
        },
        'st-shimmer': {
          '0%': { backgroundPosition: '-260px 0' },
          '100%': { backgroundPosition: '260px 0' },
        },
        'st-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.15' },
        },
        'otp-digit-in': {
          from: { opacity: '0', transform: 'scale(0.82) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'otp-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-5px)' },
          '40%, 80%': { transform: 'translateX(5px)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 160ms var(--ease-standard)',
        'fade-in': 'fade-in 140ms var(--ease-standard)',
        'slide-in-right': 'slide-in-right 180ms var(--ease-standard)',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        // Snappier button/action spinner (Tailwind's default is 1s) so clicks feel responsive.
        spin: 'spin 0.6s linear infinite',
        'st-block-in': `st-block-in 180ms ease-out`,
        'st-fade-up': 'st-fade-up 160ms ease-out',
        'st-pop-in': 'st-pop-in 200ms ease-out',
        'st-soft-pulse': 'st-soft-pulse 2s ease-in-out infinite',
        'st-burst': 'st-burst 600ms ease-out forwards',
        'st-slide-in-drawer': 'st-slide-in-drawer 280ms ease-out',
        'st-sheet-in': 'st-sheet-in 320ms ease-out',
        'st-dot-bounce': 'st-dot-bounce 1.2s ease-in-out infinite',
        'st-shimmer': 'st-shimmer 1.4s ease-in-out infinite',
        'st-blink': 'st-blink 1.1s ease-in-out infinite',
        'otp-digit-in': 'otp-digit-in 280ms var(--ease-emphasized) both',
        'otp-shake': 'otp-shake 420ms ease-in-out',
      },
    },
  },
  plugins: [animate, tailwindTypography],
};

void sizing; // referenced via CSS vars; kept for token completeness

export default preset;
