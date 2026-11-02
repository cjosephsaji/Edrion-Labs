import { useState } from 'react';
export function ContextualInput({
  busy,
  onAsk,
  placeholder = 'Ask why, change something, or make a prediction…',
  describedBy,
}: {
  busy: boolean;
  onAsk: (q: string) => void;
  placeholder?: string;
  describedBy?: string;
}) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = String(
          new FormData(e.currentTarget).get('question') ?? '',
        ).trim();
        if (value) {
          onAsk(value);
          setText('');
        }
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
    >
      <input
        aria-label="Ask Petros"
        name="question"
        placeholder={placeholder}
        aria-describedby={describedBy}
        value={text}
        maxLength={1200}
        onChange={(e) => setText(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          background: 'transparent',
          padding: '13px 3px',
          font: 'inherit',
          fontSize: 14,
          color: 'var(--ink)',
          outlineOffset: 3,
        }}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label={busy ? 'Interrupt and ask' : 'Send question'}
        style={{
          borderRadius: '50%',
          width: 38,
          height: 38,
          padding: 0,
          background: 'var(--green)',
          color: 'var(--paper)',
          border: 0,
          fontSize: 20,
        }}
      >
        ↑
      </button>
    </form>
  );
}
