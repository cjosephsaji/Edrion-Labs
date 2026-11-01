'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import styles from './cloud.module.css';
/** A single message slot. Every replacement cancels its previous exit timer/frame. */
function useMessage(
  text: string,
  identity: string,
  visible = true,
  paused = false,
) {
  const [held, setHeld] = useState({ text, identity });
  const [present, setPresent] = useState(visible);
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const generation = useRef(0);
  useEffect(() => {
    const id = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const show = () => {
      if (generation.current !== id) return;
      setHeld({ text, identity });
      setPresent(true);
      setPhase('enter');
      frame = requestAnimationFrame(() => {
        if (generation.current === id) setPhase('show');
      });
    };
    if (paused) {
      setHeld({ text, identity });
      setPresent(visible);
      setPhase('show');
    } else if (!visible) {
      setPhase('exit');
      timer = setTimeout(() => {
        if (generation.current === id) setPresent(false);
      }, 170);
    } else if (!present || held.identity !== identity) show();
    else if (held.text !== text) {
      setPhase('exit');
      timer = setTimeout(show, 160);
    } else
      frame = requestAnimationFrame(() => {
        if (generation.current === id) setPhase('show');
      });
    return () => {
      generation.current++;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [text, identity, visible, paused]);
  return {
    present,
    phase,
    text: held.identity === identity ? held.text : text,
  };
}
export function MotionCaption({
  text,
  identity,
  role,
  paused,
}: {
  text: string;
  identity: string;
  role?: 'status';
  paused?: boolean;
}) {
  const message = useMessage(text, identity, true, paused);
  return (
    <p
      className={styles.caption}
      data-message-phase={message.phase}
      role={role}
    >
      {message.text}
    </p>
  );
}
export function WorldCloud({
  text,
  identity,
  visible,
  discard,
  element,
  className,
  kind,
  onDismiss,
  onLayout,
}: {
  text: string;
  identity: string;
  visible: boolean;
  discard: boolean;
  element: RefObject<HTMLDivElement>;
  className: string | undefined;
  kind: string;
  onDismiss: () => void;
  onLayout: () => void;
}) {
  const message = useMessage(text, identity, visible);
  useEffect(() => {
    if (message.present && !discard) {
      const frame = requestAnimationFrame(onLayout);
      return () => cancelAnimationFrame(frame);
    }
  }, [message.present, message.text, discard, onLayout]);
  if (!message.present || discard) return null;
  return (
    <div
      ref={element}
      className={className}
      data-kind={kind}
      data-message-phase={message.phase}
      aria-hidden={!visible}
      role="status"
    >
      <div className={styles.body} data-message-phase={message.phase}>
        <span>PETROS</span>
        <button aria-label="Dismiss World speech" onClick={onDismiss}>
          ×
        </button>
        <p>{message.text}</p>
      </div>
    </div>
  );
}
