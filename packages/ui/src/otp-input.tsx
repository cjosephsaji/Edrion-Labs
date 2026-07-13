'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from './cn';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

const COOLDOWN_TOTAL = 60;

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  error,
  autoFocus,
  id,
  className,
  'aria-label': ariaLabel = 'Verification code',
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [shake, setShake] = useState(false);
  const prevError = useRef(error);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (error && !prevError.current) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 420);
      return () => clearTimeout(t);
    }
    prevError.current = error;
  }, [error]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const el = refs.current[Math.max(0, Math.min(index, length - 1))];
    el?.focus();
    el?.select();
  };

  const emit = useCallback(
    (next: string) => {
      const trimmed = next.replace(/\D/g, '').slice(0, length);
      onChange(trimmed);
      if (trimmed.length === length) onComplete?.(trimmed);
    },
    [length, onChange, onComplete],
  );

  const setDigit = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char;
    emit(next.join(''));
  };

  const onDigitChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigit(index, '');
      return;
    }
    if (cleaned.length === 1) {
      setDigit(index, cleaned);
      if (index < length - 1) focusAt(index + 1);
      return;
    }
    // Mobile autofill / rapid input can deliver multiple chars at once.
    const merged = (digits.slice(0, index).join('') + cleaned).slice(0, length);
    emit(merged);
    focusAt(Math.min(merged.length, length - 1));
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        setDigit(index, '');
        return;
      }
      if (index > 0) {
        setDigit(index - 1, '');
        focusAt(index - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
      return;
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      focusAt(index + 1);
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      setDigit(index, '');
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    emit(pasted);
    focusAt(Math.min(pasted.length, length - 1));
  };

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={cn('flex gap-2', shake && 'animate-otp-shake', className)}
      onPaste={onPaste}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={cn(
            'h-12 w-10 rounded-lg border bg-surface-elevated text-center text-lg font-semibold tabular-nums text-text-primary shadow-xs',
            'transition-[border-color,box-shadow,transform,background-color] duration-150',
            'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:scale-[1.04]',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'animate-otp-digit-in',
            digit ? 'border-primary bg-primary-soft/40' : 'border-border',
            error && 'border-danger ring-2 ring-danger/20',
          )}
          style={{ animationDelay: `${i * 45}ms` }}
          onChange={(e) => onDigitChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export interface OtpResendCooldownProps {
  secondsRemaining: number;
  totalSeconds?: number;
  className?: string;
}

/** Countdown banner shown while OTP resend is rate-limited. */
export function OtpResendCooldown({
  secondsRemaining,
  totalSeconds = COOLDOWN_TOTAL,
  className,
}: OtpResendCooldownProps) {
  if (secondsRemaining <= 0) return null;

  const progress = Math.max(0, Math.min(1, 1 - secondsRemaining / totalSeconds));
  const circumference = 2 * Math.PI * 18;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3',
        'animate-fade-in-up',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-warning transition-[stroke-dashoffset] duration-1000 ease-linear"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: dashOffset,
            }}
          />
        </svg>
        <span className="text-sm font-bold tabular-nums text-warning">{secondsRemaining}</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">Please wait before resending</p>
        <p className="text-xs text-text-secondary">
          You can request a new code in <span className="font-semibold tabular-nums">{secondsRemaining}s</span>.
          The code we already sent is still valid for 10 minutes.
        </p>
      </div>
    </div>
  );
}
