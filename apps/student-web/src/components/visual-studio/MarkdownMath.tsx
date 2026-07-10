'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

type MarkdownMathProps = {
  children: string;
  display?: boolean;
  className?: string;
};

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isAllowedHref(href: string): boolean {
  if (href.startsWith('/')) return true;
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'https://edrion.local');
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function MarkdownMathComponent({ children, display = false, className = '' }: MarkdownMathProps) {
  const source = display ? `$$\n${children}\n$$` : children;

  const components = useMemo(
    () => ({
      a: ({ href, children: linkChildren }: { href?: string; children?: React.ReactNode }) => {
        if (!href || !isAllowedHref(href)) {
          return <span>{linkChildren}</span>;
        }
        const external = href.startsWith('http');
        return (
          <a
            href={href}
            className="text-st-accent underline decoration-st-accent/40 underline-offset-2"
            rel={external ? 'noreferrer noopener' : undefined}
            target={external ? '_blank' : undefined}
          >
            {linkChildren}
          </a>
        );
      },
      p: ({ children: paragraphChildren }: { children?: React.ReactNode }) => (
        <p className={display ? 'my-0 overflow-x-auto' : 'my-0'}>{paragraphChildren}</p>
      ),
    }),
    [display],
  );

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownMath = memo(MarkdownMathComponent);
