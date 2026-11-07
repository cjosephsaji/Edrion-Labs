import type { ReactNode } from 'react';
export function GlossaryCaption({
  text,
  glossary,
  onOpen,
}: {
  text: string;
  glossary: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const terms = Object.keys(glossary).join('|'),
    pattern = new RegExp(`\\b(${terms})\\b`, 'gi');
  const nodes: ReactNode[] = [];
  let from = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index!;
    nodes.push(text.slice(from, at));
    nodes.push(
      <button
        key={at}
        type="button"
        onClick={() => onOpen(glossary[m[0].toLowerCase()])}
      >
        {m[0]}
      </button>,
    );
    from = at + m[0].length;
  }
  nodes.push(text.slice(from));
  return <>{nodes}</>;
}
