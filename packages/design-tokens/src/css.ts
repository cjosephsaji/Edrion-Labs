/**
 * Generates the global CSS that publishes design tokens as CSS variables. Imported once by
 * the web app's global stylesheet. Components read these via Tailwind utilities, never hex.
 */
import { darkTheme, lightTheme, motion, radius, shadow, sizing, type ColorTokens } from './tokens';
import { studentThemes, type StudentThemeName } from './student';

function colorVars(theme: ColorTokens): string {
  return Object.entries(theme)
    .map(([key, value]) => `    --${key}: ${value};`)
    .join('\n');
}

function staticVars(): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(radius)) lines.push(`    --radius-${k}: ${v};`);
  for (const [k, v] of Object.entries(sizing)) {
    const kebab = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    lines.push(`    --size-${kebab}: ${v};`);
  }
  for (const [k, v] of Object.entries(shadow)) lines.push(`    --shadow-${k}: ${v};`);
  // `next/font` publishes the actual self-hosted family names through the
  // --font-st-*-face variables. Keep the semantic aliases separate so the
  // generated token sheet never overwrites those injected values.
  lines.push(
    `    --font-sans: var(--font-st-body-face), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;`,
  );
  lines.push(`    --font-display: var(--font-st-display-face), Georgia, serif;`);
  lines.push(`    --font-body: var(--font-st-body-face), system-ui, sans-serif;`);
  lines.push(
    `    --font-mono: var(--font-st-mono-face), ui-monospace, SFMono-Regular, monospace;`,
  );
  lines.push(
    `    --font-mono-ui: var(--font-st-mono-face), ui-monospace, SFMono-Regular, monospace;`,
  );
  lines.push(`    --ease-standard: ${motion.easing.standard};`);
  lines.push(`    --ease-emphasized: ${motion.easing.emphasized};`);
  lines.push(`    --ease-exit: ${motion.easing.exit};`);
  return lines.join('\n');
}

function studentThemeVars(themeName: StudentThemeName): string {
  const theme = studentThemes[themeName];
  return Object.entries(theme)
    .map(([key, value]) => `    --st-${key}: ${value};`)
    .join('\n');
}

function studentThemeBlocks(): string {
  const names: StudentThemeName[] = ['standard', 'dim', 'dark'];
  return names
    .map(
      (name) => `  [data-student-theme='${name}'] {\n${studentThemeVars(name)}\n  }`,
    )
    .join('\n\n');
}

/** Full CSS string: :root (light) + [data-theme='dark'] + student themes + reduced-motion. */
export function generateTokenCss(): string {
  return `:root {
${colorVars(lightTheme)}
${staticVars()}
  }

  [data-theme='dark'] {
${colorVars(darkTheme)}
  }

${studentThemeBlocks()}

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  [data-reduced-motion='true'] *, [data-reduced-motion='true'] *::before, [data-reduced-motion='true'] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
`;
}
