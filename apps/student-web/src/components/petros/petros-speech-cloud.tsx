import styles from './petros-speech-cloud.module.css';

/** Content-sized presentation only; callers supply public speech or truthful operation status. */
export function PetrosSpeechCloud({ text, kind = 'speech', label = 'Petros', className = '', labelClassName = '' }: {
  text: string; kind?: 'speech' | 'status'; label?: string; className?: string; labelClassName?: string;
}) {
  if (!text.trim()) return null;
  return <div className={`${styles.cloud} ${className}`} data-cloud={kind}>
    <span className={labelClassName}>{label}</span><p tabIndex={text.length > 120 ? 0 : undefined}>{text.trim()}</p>
  </div>;
}

export function petrosStatus(input: { recording?: boolean; transcribing?: boolean; preparing?: boolean; speaking?: boolean;
  teaching?: boolean; waiting?: boolean; paused?: boolean; questionReady?: boolean }) {
  return input.recording ? 'Recording' : input.transcribing ? 'Transcribing' : input.preparing ? 'Preparing speech'
    : input.speaking ? 'Speaking' : input.questionReady ? 'Ready for your question' : input.teaching ? 'Teaching'
      : input.waiting ? 'Waiting' : input.paused ? 'Paused' : 'Ready';
}
