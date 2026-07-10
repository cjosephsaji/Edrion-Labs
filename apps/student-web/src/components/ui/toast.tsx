'use client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ToastOptions = {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

type ToastItem = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  say: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const say = useCallback((message: string, options?: ToastOptions) => {
    const id = ++toastId;
    setToasts((prev) => [
      ...prev,
      {
        id,
        message,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
      },
    ]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options?.durationMs ?? 3600);
  }, []);

  const value = useMemo(() => ({ say }), [say]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-24 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-8"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-st-fade-up rounded-full bg-st-ink px-5 py-2.5 text-sm font-medium text-st-page shadow-lg ${
              t.actionLabel ? 'pointer-events-auto flex items-center gap-3' : ''
            }`}
          >
            <span>{t.message}</span>
            {t.actionLabel && t.onAction ? (
              <button
                type="button"
                className="rounded-full border border-st-page/25 px-3 py-1 text-xs font-semibold text-st-page focus:outline-none focus-visible:ring-2 focus-visible:ring-st-page/60"
                aria-label={t.actionLabel}
                onClick={() => {
                  t.onAction?.();
                  setToasts((prev) => prev.filter((item) => item.id !== t.id));
                }}
              >
                {t.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
