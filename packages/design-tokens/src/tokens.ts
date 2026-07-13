/**
 * Edrion design tokens — the single source of truth for the visual system.
 *
 * Components must reference *semantic* tokens (via Tailwind classes that map to the CSS
 * variables generated in css.ts), never raw hex values. Adjust the palette here and every
 * surface updates coherently.
 *
 * Colour direction: warm ivory, composed dark-green navigation, refined primary actions,
 * muted olive/brown secondary text, soft warm borders.
 */

/** Raw brand palette. Starting values from the brief — tune here, nowhere else. */
export const palette = {
  // Surfaces (warm ivory)
  background: '#f8f5ee',
  backgroundSecondary: '#f1ecdf',
  surface: '#fffaf1',
  surfaceElevated: '#ffffff',

  // Sidebar (dark green)
  sidebar: '#0d3229',
  sidebarHover: '#17473b',
  sidebarActive: '#e3f0e8',
  sidebarText: '#e8f1ec',
  sidebarMuted: '#9db9ad',

  // Primary (green)
  primary: '#1f604a',
  primaryHover: '#164f3d',
  primarySoft: '#deeee4',
  primaryForeground: '#ffffff',

  // Text
  textPrimary: '#25241d',
  textSecondary: '#686355',
  // Darkened from #989181 (2.8–3.1:1, below WCAG AA) to meet AA on the reading surfaces:
  // ≥4.7:1 on surface/background, ≥3:1 (AA large/UI) on secondary panels. (Phase 9c.)
  textMuted: '#7a725f',

  // Borders
  border: '#e2d9c8',
  borderStrong: '#cfc4af',

  // Status
  success: '#37825f',
  successSoft: '#e3f1e8',
  warning: '#b7821d',
  warningSoft: '#f6ecd3',
  danger: '#b74833',
  dangerSoft: '#f6e2dd',
  info: '#426e87',
  infoSoft: '#e0ecf2',

  // Focus ring
  ring: '#1f604a',
} as const;

/**
 * Semantic colour tokens. These names become CSS variables (`--surface`, `--text-primary`,
 * …) and Tailwind utilities (`bg-surface`, `text-text-primary`, …). Two themes share the
 * same keys so a dark theme can be added later without touching components.
 */
export type ColorTokens = Record<string, string>;

export const lightTheme: ColorTokens = {
  background: palette.background,
  'background-secondary': palette.backgroundSecondary,
  surface: palette.surface,
  'surface-elevated': palette.surfaceElevated,

  sidebar: palette.sidebar,
  'sidebar-hover': palette.sidebarHover,
  'sidebar-active': palette.sidebarActive,
  'sidebar-text': palette.sidebarText,
  'sidebar-muted': palette.sidebarMuted,

  primary: palette.primary,
  'primary-hover': palette.primaryHover,
  'primary-soft': palette.primarySoft,
  'primary-foreground': palette.primaryForeground,

  'text-primary': palette.textPrimary,
  'text-secondary': palette.textSecondary,
  'text-muted': palette.textMuted,

  border: palette.border,
  'border-strong': palette.borderStrong,

  success: palette.success,
  'success-soft': palette.successSoft,
  warning: palette.warning,
  'warning-soft': palette.warningSoft,
  danger: palette.danger,
  'danger-soft': palette.dangerSoft,
  info: palette.info,
  'info-soft': palette.infoSoft,

  ring: palette.ring,
};

/** Dark theme placeholder — keeps the same token keys so the theme control can switch. */
export const darkTheme: ColorTokens = {
  ...lightTheme,
  background: '#15170f',
  'background-secondary': '#1b1d13',
  surface: '#1f221a',
  'surface-elevated': '#262a20',
  'text-primary': '#f3f1e8',
  'text-secondary': '#bdb9ac',
  'text-muted': '#8f8b7e',
  border: '#33372b',
  'border-strong': '#434838',
};

/** Border radii — rounded cards, soft inputs. */
export const radius = {
  none: '0px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

/** Spacing scale (px). 4px base grid. */
export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

/** Component sizing — consistent header/input/row heights across every page. */
export const sizing = {
  inputHeight: '38px',
  buttonHeight: '38px',
  buttonHeightSm: '32px',
  tableHeaderHeight: '44px',
  tableRowHeight: '52px',
  topbarHeight: '60px',
  sidebarWidth: '260px',
  sidebarCollapsedWidth: '68px',
  drawerWidth: '460px',
} as const;

/** Soft shadows — subtle, never heavy. */
export const shadow = {
  xs: '0 1px 2px 0 rgb(42 38 29 / 0.04)',
  sm: '0 2px 8px -4px rgb(42 38 29 / 0.16), 0 1px 2px -1px rgb(42 38 29 / 0.08)',
  md: '0 12px 26px -18px rgb(42 38 29 / 0.28), 0 2px 6px -3px rgb(42 38 29 / 0.10)',
  lg: '0 22px 48px -28px rgb(42 38 29 / 0.34), 0 10px 20px -16px rgb(42 38 29 / 0.18)',
  focus: `0 0 0 3px ${palette.primarySoft}`,
} as const;

/** Typography. */
export const typography = {
  fontFamily: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
  },
  fontSize: {
    xs: ['12px', '16px'],
    sm: ['13px', '18px'],
    base: ['14px', '20px'],
    md: ['15px', '22px'],
    lg: ['16px', '24px'],
    xl: ['18px', '26px'],
    '2xl': ['22px', '30px'],
    '3xl': ['28px', '36px'],
  },
  fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
} as const;

/**
 * Motion durations (ms) per the brief. Keep interactions immediate — no artificial delay.
 * Honour `prefers-reduced-motion` at the component layer.
 */
export const motion = {
  button: 100,
  hover: 130,
  dropdown: 140,
  pageEnter: 160,
  drawer: 200,
  modal: 180,
  sidebar: 200,
  tabIndicator: 150,
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1.2)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export const tokens = {
  palette,
  lightTheme,
  darkTheme,
  radius,
  spacing,
  sizing,
  shadow,
  typography,
  motion,
} as const;

export type Tokens = typeof tokens;
