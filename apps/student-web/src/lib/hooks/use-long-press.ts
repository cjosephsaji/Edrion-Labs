'use client';

import { useCallback, useRef } from 'react';

type LongPressOptions = {
  delayMs?: number;
  onLongPress: () => void;
  onClick?: () => void;
};

export function useLongPress({ delayMs = 500, onLongPress, onClick }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    longPressTriggeredRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
    }, delayMs);
  }, [clear, delayMs, onLongPress]);

  const end = useCallback(() => {
    clear();
    if (!longPressTriggeredRef.current) {
      onClick?.();
    }
  }, [clear, onClick]);

  const cancel = useCallback(() => {
    clear();
    longPressTriggeredRef.current = false;
  }, [clear]);

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}
