export function TeachingCaption({
  text,
  followup,
  ai,
}: {
  text: string;
  followup: string;
  ai: boolean;
}) {
  return (
    <div aria-live="polite" aria-atomic="true">
      <p
        style={{
          margin: 0,
          fontSize: 17,
          lineHeight: 1.6,
          color: 'var(--ink)',
        }}
      >
        {text}
      </p>
      {followup && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--green)',
          }}
        >
          {followup}
        </p>
      )}
    </div>
  );
}
