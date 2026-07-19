'use client';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import type { CodeLanguage } from '@edrion/schemas';

function languageExtension(lang: string) {
  switch (lang) {
    case 'python':
      return [python()];
    case 'javascript':
    case 'typescript':
      return [javascript({ typescript: lang === 'typescript' })];
    default:
      return [];
  }
}

/** Lightweight CodeMirror 6 editor for code questions (highlight + edit; no runner yet). */
export function CodeEditor({
  value,
  onChange,
  language = 'python',
  minHeight = '140px',
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage | string;
  minHeight?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <CodeMirror
        value={value}
        height={minHeight}
        extensions={languageExtension(language)}
        onChange={onChange}
        editable={!readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !readOnly,
        }}
      />
    </div>
  );
}
