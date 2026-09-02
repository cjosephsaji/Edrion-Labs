'use client';

import { useRef, type KeyboardEvent } from 'react';
import {
  Bold,
  Code2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Underline,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkUnderline } from '@edrion/ui';

type Selection = { start: number; end: number; text: string };

export function NoteEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  function selection(): Selection {
    const element = textarea.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? start;
    return { start, end, text: value.slice(start, end) };
  }

  function replace(start: number, end: number, content: string, selectStart: number, selectEnd: number) {
    onChange(`${value.slice(0, start)}${content}${value.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + selectStart, start + selectEnd);
    });
  }

  function wrap(before: string, after: string, placeholder: string) {
    const selected = selection();
    const content = selected.text || placeholder;
    replace(
      selected.start,
      selected.end,
      `${before}${content}${after}`,
      before.length,
      before.length + content.length,
    );
  }

  function prefixLines(prefix: string, placeholder: string) {
    const selected = selection();
    const lineStart = value.lastIndexOf('\n', Math.max(0, selected.start - 1)) + 1;
    const nextBreak = value.indexOf('\n', selected.end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const source = value.slice(lineStart, lineEnd) || placeholder;
    const content = source
      .split('\n')
      .map((line, index) => `${typeof prefix === 'string' ? prefix.replace('{n}', String(index + 1)) : prefix}${line}`)
      .join('\n');
    replace(lineStart, lineEnd, content, 0, content.length);
  }

  function heading(level: string) {
    if (!level) return;
    prefixLines(`${'#'.repeat(Number(level))} `, 'Heading');
  }

  function insertBlock(content: string, selectedStart = 0, selectedEnd = content.length) {
    const selected = selection();
    const leading = selected.start > 0 && value[selected.start - 1] !== '\n' ? '\n\n' : '';
    const trailing = selected.end < value.length && value[selected.end] !== '\n' ? '\n\n' : '';
    replace(selected.start, selected.end, `${leading}${content}${trailing}`, leading.length + selectedStart, leading.length + selectedEnd);
  }

  function link() {
    const selected = selection();
    const label = selected.text || 'link text';
    const content = `[${label}](https://example.com)`;
    const urlStart = content.indexOf('https://');
    replace(selected.start, selected.end, content, urlStart, content.length - 1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (!['b', 'i', 'u'].includes(key)) return;
    event.preventDefault();
    if (key === 'b') wrap('**', '**', 'bold text');
    if (key === 'i') wrap('*', '*', 'italic text');
    if (key === 'u') wrap('++', '++', 'underlined text');
  }

  const button =
    'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text-secondary transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-xs">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-background-secondary p-2" role="toolbar" aria-label="Note formatting">
        <select
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue=""
          onChange={(event) => {
            heading(event.target.value);
            event.target.value = '';
          }}
          aria-label="Heading style"
        >
          <option value="">Heading</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
        </select>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <FormatButton label="Bold (⌘B)" className={button} onClick={() => wrap('**', '**', 'bold text')}><Bold /></FormatButton>
        <FormatButton label="Italic (⌘I)" className={button} onClick={() => wrap('*', '*', 'italic text')}><Italic /></FormatButton>
        <FormatButton label="Underline (⌘U)" className={button} onClick={() => wrap('++', '++', 'underlined text')}><Underline /></FormatButton>
        <FormatButton label="Strikethrough" className={button} onClick={() => wrap('~~', '~~', 'struck text')}><Strikethrough /></FormatButton>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <FormatButton label="Bulleted list" className={button} onClick={() => prefixLines('- ', 'List item')}><List /></FormatButton>
        <FormatButton label="Numbered list" className={button} onClick={() => prefixLines('{n}. ', 'List item')}><ListOrdered /></FormatButton>
        <FormatButton label="Checklist" className={button} onClick={() => prefixLines('- [ ] ', 'Task')}><ListChecks /></FormatButton>
        <FormatButton label="Block quote" className={button} onClick={() => prefixLines('> ', 'Important note')}><Quote /></FormatButton>
        <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <FormatButton label="Inline code" className={button} onClick={() => wrap('`', '`', 'code')}><Code2 /></FormatButton>
        <FormatButton label="Code block" text="Code block" className={button} onClick={() => insertBlock('```\ncode\n```', 4, 8)} />
        <FormatButton label="Link" className={button} onClick={link}><Link2 /></FormatButton>
        <FormatButton
          label="Table"
          className={button}
          onClick={() => insertBlock('| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |')}
        ><Table2 /></FormatButton>
        <FormatButton label="Divider" className={button} onClick={() => insertBlock('---')}><Minus /></FormatButton>
      </div>

      <div className="grid lg:grid-cols-2">
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Write</div>
          <textarea
            ref={textarea}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={18}
            placeholder="Write the lesson note here. Use the toolbar to format it."
            className="block min-h-[28rem] w-full resize-y bg-surface-elevated px-4 py-3 font-mono text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted focus:bg-surface"
            aria-label="Note content"
          />
        </div>
        <div className="min-w-0 bg-surface">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Student preview</div>
          <div className="prose prose-sm min-h-[28rem] max-w-none overflow-auto p-5 text-text-primary prose-headings:text-text-primary prose-a:text-primary prose-blockquote:border-primary prose-code:text-text-primary prose-table:text-sm">
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkUnderline]}>{value}</ReactMarkdown>
            ) : (
              <p className="not-prose text-sm text-text-muted">Your formatted note will appear here as you write.</p>
            )}
          </div>
        </div>
      </div>
      <p className="border-t border-border bg-background-secondary px-3 py-2 text-xs text-text-muted">
        Formatting is preserved when students open the note. Keyboard shortcuts: ⌘/Ctrl+B, I, and U.
      </p>
    </div>
  );
}

function FormatButton({
  label,
  text,
  className,
  onClick,
  children,
}: {
  label: string;
  text?: string;
  className: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label}>
      {children ? <span className="[&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{children}</span> : null}
      {text}
    </button>
  );
}
