import type { VoiceStatus } from '../core/voice-provider';
export function VoiceControls({
  status,
  mic,
  onConnect,
  onMic,
  onStop,
}: {
  status: VoiceStatus;
  mic: boolean;
  onConnect: () => void;
  onMic: () => void;
  onStop: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <button
        type="button"
        onClick={onConnect}
        disabled={status === 'connecting'}
        aria-label={
          status === 'disconnected'
            ? 'Connect realtime voice'
            : 'Disconnect realtime voice'
        }
      >
        {status === 'disconnected'
          ? '◉ Connect voice'
          : status === 'connecting'
            ? 'Connecting…'
            : '◉ Voice on'}
      </button>
      {status !== 'disconnected' && status !== 'connecting' && (
        <button
          type="button"
          aria-pressed={mic}
          onClick={onMic}
          title="Toggle microphone; hold V while this tab is focused"
        >
          {mic ? '◼ Mute mic' : '♩ Talk'}
        </button>
      )}
      <button type="button" onClick={onStop} aria-label="Interrupt Petros">
        Stop
      </button>
    </div>
  );
}
