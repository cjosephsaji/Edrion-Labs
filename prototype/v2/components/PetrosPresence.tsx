import type { VoiceStatus } from '../core/voice-provider';
export function PetrosPresence({
  status,
  thinking,
  assetBase = '/petros',
}: {
  status: VoiceStatus;
  thinking: boolean;
  assetBase?: string;
}) {
  const pose = thinking
    ? 'thinking'
    : status === 'speaking'
      ? 'talking'
      : status === 'listening'
        ? 'listening'
        : 'idle';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          position: 'relative',
          width: 56,
          height: 63,
          overflow: 'hidden',
          borderRadius: '45%',
          background: '#eef0e4',
        }}
      >
        {['idle', 'thinking', 'talking', 'listening'].map((state) => (
          <img
            key={state}
            src={`${assetBase}/petros-${state}.png`}
            alt={state === pose ? 'Original Petros' : ''}
            aria-hidden={state !== pose}
            style={{
              position: 'absolute',
              inset: 0,
              width: 56,
              height: 75,
              objectFit: 'cover',
              mixBlendMode: 'multiply',
              opacity: state === pose ? 1 : 0,
              transition: 'opacity 180ms ease',
            }}
          />
        ))}
      </div>
      <div>
        <strong style={{ fontSize: 15, fontWeight: 600 }}>Petros</strong>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          <span style={{ color: '#709064', marginRight: 5 }}>●</span>
          {thinking
            ? 'Thinking through your question'
            : status === 'disconnected'
              ? 'Here for your curiosity'
              : status === 'ready'
                ? 'Voice connected'
                : status}
        </div>
      </div>
    </div>
  );
}
