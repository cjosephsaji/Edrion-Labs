'use client';
import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type MathTextProps = {
  children: string;
  /** True for dedicated LaTeX fields (equation, math). False for prose that may contain inline math. */
  display?: boolean;
  className?: string;
};

type Segment =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; display: boolean };

/** Matches \( \), \[ \], $ $, $$ $$ — non-greedy, ordered longest-first. */
const MIXED_MATH_RE =
  /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$]+)\$/g;

function hasInlineMath(text: string): boolean {
  return /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$[\s\S]*?\$\$|\$[^$]+\$/.test(text);
}

function unwrapDisplayLatex(tex: string): string {
  const t = tex.trim();
  const bracket = /^\\\[([\s\S]*)\\\]$/.exec(t);
  if (bracket) return bracket[1] ?? t;
  const paren = /^\\\(([\s\S]*)\\\)$/.exec(t);
  if (paren) return paren[1] ?? t;
  const dollars = /^\$\$([\s\S]*)\$\$$/.exec(t);
  if (dollars) return dollars[1] ?? t;
  return t;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const re = new RegExp(MIXED_MATH_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'math', value: match[1], display: true });
    } else if (match[2] !== undefined) {
      segments.push({ type: 'math', value: match[2], display: false });
    } else if (match[3] !== undefined) {
      segments.push({ type: 'math', value: match[3], display: true });
    } else if (match[4] !== undefined) {
      segments.push({ type: 'math', value: match[4], display: false });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

function renderKatex(el: HTMLElement, tex: string, displayMode: boolean) {
  try {
    katex.render(tex, el, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch {
    el.textContent = tex;
  }
}

function renderMixedInline(text: string, container: HTMLElement) {
  container.textContent = '';
  for (const segment of parseSegments(text)) {
    if (segment.type === 'text') {
      if (segment.value) container.appendChild(document.createTextNode(segment.value));
      continue;
    }
    const node = document.createElement(segment.display ? 'div' : 'span');
    if (segment.display) node.className = 'my-1 overflow-x-auto';
    renderKatex(node, segment.value, segment.display);
    container.appendChild(node);
  }
}

export function MathText({ children, display = false, className = '' }: MathTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    if (display) {
      renderKatex(el, unwrapDisplayLatex(children), true);
      return;
    }

    if (!hasInlineMath(children)) {
      el.textContent = children;
      return;
    }

    renderMixedInline(children, el);
  }, [children, display]);

  return <span ref={ref} className={className} />;
}
