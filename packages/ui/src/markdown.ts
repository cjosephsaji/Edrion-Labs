type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
  data?: { hName?: string };
};

/**
 * Adds a small, safe underline extension to Markdown: `++underlined text++`.
 * The generated mdast node is converted to a real <u> element by remark-rehype,
 * without enabling arbitrary HTML from authored notes.
 */
export function remarkUnderline() {
  return (tree: MarkdownNode) => visit(tree);
}

function visit(node: MarkdownNode): void {
  if (!node.children) return;

  const next: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type !== 'text' || typeof child.value !== 'string' || !child.value.includes('++')) {
      visit(child);
      next.push(child);
      continue;
    }

    const pattern = /\+\+([^+\n](?:.*?[^+\n])?)\+\+/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(child.value)) !== null) {
      if (match.index > cursor) next.push({ type: 'text', value: child.value.slice(cursor, match.index) });
      next.push({
        type: 'underline',
        data: { hName: 'u' },
        children: [{ type: 'text', value: match[1] }],
      });
      cursor = match.index + match[0].length;
    }
    if (cursor === 0) next.push(child);
    else if (cursor < child.value.length) next.push({ type: 'text', value: child.value.slice(cursor) });
  }
  node.children = next;
}
