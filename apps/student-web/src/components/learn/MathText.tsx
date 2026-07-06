'use client';
import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type MathTextProps = {
  children: string;
  display?: boolean;
  className?: string;
};

export function MathText({ children, display = false, className = '' }: MathTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(children, ref.current, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      ref.current.textContent = children;
    }
  }, [children, display]);

  return <span ref={ref} className={className} />;
}
