'use client';

import { Fragment, useMemo } from 'react';
import katex from 'katex';
import styles from './petros-document-teaching.module.css';

const superscripts: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
const unicodePowers: Record<string, string> = Object.fromEntries(
  Object.entries(superscripts).map(([plain, raised]) => [raised, plain]),
);
const subscripts: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

function script(value: string, glyphs: Record<string, string>) {
  return [...value].map((character) => glyphs[character] ?? character).join('');
}

/** Conservative repair for equation-only legacy fields. */
export function normalizeLegacyMath(value: string) {
  return value
    .replace(/\bintegral\b/gi, '\\int')
    .replaceAll('∫', '\\int')
    .replaceAll('Σ', '\\sum')
    .replaceAll('≈', '\\approx')
    .replaceAll('×', '\\times')
    .replace(/d\s*\/\s*d([A-Za-z])/g, '\\frac{d}{d$1}')
    .replace(/([A-Za-z0-9)])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_match, base: string, power: string) =>
      `${base}^{${[...power].map((part) => unicodePowers[part] ?? part).join('')}}`,
    )
    .replace(/\s+d([A-Za-z])\b/g, '\\,d$1')
    .trim();
}

/** Keeps ordinary prose readable when it contains lightweight TeX. */
export function readableMathText(value: string) {
  let text = value;
  for (let pass = 0; pass < 3; pass += 1) {
    text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
    text = text.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  }
  return text
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:,|;|!|quad|qquad)\s*/g, ' ')
    .replace(/\\int/g, '∫')
    .replace(/\\sum/g, '∑')
    .replace(/\\prod/g, '∏')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\approx/g, '≈')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\to/g, '→')
    .replace(/\\infty/g, '∞')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\theta/g, 'θ')
    .replace(/\^\{?(-?\d+)\}?/g, (_match, exponent: string) => script(exponent, superscripts))
    .replace(/_\{?(\d+)\}?/g, (_match, subscript: string) => script(subscript, subscripts))
    .replace(/[{}]/g, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\b([A-Za-z])\s+\(/g, '$1(')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function spokenMath(value: string) {
  return readableMathText(normalizeLegacyMath(value))
    .replaceAll('∫', ' integral of ')
    .replaceAll('∑', ' sum of ')
    .replaceAll('≈', ' approximately equals ')
    .replaceAll('=', ' equals ')
    .replace(/\s+/g, ' ')
    .trim();
}

function RenderedMath({ value, display = false }: { value: string; display?: boolean }) {
  const rendered = useMemo(() => {
    try {
      return {
        html: katex.renderToString(normalizeLegacyMath(value), {
          displayMode: display,
          output: 'htmlAndMathml',
          strict: false,
          throwOnError: true,
          trust: false,
        }),
        error: false,
      };
    } catch {
      return { html: '', error: true };
    }
  }, [display, value]);

  if (rendered.error) return <span className={styles.mathFallback}>{readableMathText(value)}</span>;
  const Tag = display ? 'div' : 'span';
  return <Tag className={display ? styles.mathDisplay : styles.mathInline} aria-label={spokenMath(value)} dangerouslySetInnerHTML={{ __html: rendered.html }} />;
}

export function MathText({ children }: { children: string }) {
  const parts = children.split(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g);
  return <>{parts.filter(Boolean).map((part, index) => {
    const display = (part.startsWith('$$') && part.endsWith('$$')) || (part.startsWith('\\[') && part.endsWith('\\]'));
    const inline = (part.startsWith('$') && part.endsWith('$')) || (part.startsWith('\\(') && part.endsWith('\\)'));
    if (!display && !inline) return <Fragment key={index}>{readableMathText(part)}</Fragment>;
    const delimiter = part.startsWith('$$') || part.startsWith('\\[') || part.startsWith('\\(') ? 2 : 1;
    return <RenderedMath key={index} value={part.slice(delimiter, -delimiter)} display={display} />;
  })}</>;
}

export function MathExpression({ value, display = false }: { value: string; display?: boolean }) {
  return <RenderedMath value={value} display={display} />;
}
