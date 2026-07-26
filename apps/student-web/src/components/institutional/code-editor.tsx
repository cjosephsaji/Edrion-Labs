'use client';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';

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

export function StudentCodeEditor({
  value,
  onChange,
  language = 'python',
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-st-bd2">
      <CodeMirror
        value={value}
        height="220px"
        extensions={languageExtension(language)}
        onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
      />
    </div>
  );
}
