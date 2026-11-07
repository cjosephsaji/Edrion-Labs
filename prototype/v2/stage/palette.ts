import {
  palette as brand,
  darkTheme,
  radius,
} from '../../../packages/design-tokens/src/tokens';
const alpha = (hex: string, opacity: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${opacity})`;
/** Site brand is authoritative for chrome/studio; specimen signals retain the approved reference. */
export const palette = {
  bg: darkTheme.background,
  'bg-2': darkTheme.surface,
  ink: darkTheme['text-primary'],
  muted: darkTheme['text-secondary'],
  hairline: alpha(darkTheme['border-strong'], 0.7),
  glass: alpha(darkTheme.surface, 0.76),
  panel: alpha(darkTheme.surface, 0.94),
  tag: alpha(darkTheme.surface, 0.88),
  selected: alpha(brand.primarySoft, 0.1),
  primary: brand.primary,
  'primary-hover': brand.primaryHover,
  'on-primary': brand.primaryForeground,
  focus: brand.primarySoft,
  amber: '#ffb35f',
  mint: '#7df0c8',
  copper: '#d49a6a',
  dark: brand.sidebar,
  steel: darkTheme['border-strong'],
  blue: '#6fb8ff',
  backdrop: brand.primary,
  pool: brand.sidebarHover,
} as const;
export const paletteVariables = {
  ...Object.fromEntries(
    Object.entries(palette).map(([k, v]) => [`--stage-${k}`, v]),
  ),
  '--stage-card-radius': radius.xl,
};
