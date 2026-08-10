'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, X } from './icons';

export type ToastTone = 'success' | 'error';

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastInput = Omit<ToastItem, 'id'> & { id?: string };

type ToastContextValue = {
  toasts: ToastItem[];
  push: (toast: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4500;

function createId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Toast({
  tone,
  title,
  description,
  onClose,
}: {
  tone: ToastTone;
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  const isSuccess = tone === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      aria-live={isSuccess ? 'polite' : 'assertive'}
      className={`animate-toast-in flex w-full max-w-sm gap-3 rounded-2xl border px-4 py-3 shadow-[var(--shadow-toast)] ${
        isSuccess
          ? 'border-success-border bg-success-bg text-success-fg'
          : 'border-danger-border bg-danger-bg text-danger-fg'
      }`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-tight text-ink">{title}</p>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar notificação"
          className="touch-target -mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-black/[0.04] hover:text-ink"
        >
          <X className="size-4" aria-hidden strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-label="Notificações"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
          <Toast
            tone={toast.tone}
            title={toast.title}
            description={toast.description}
            onClose={() => onDismiss(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = toast.id ?? createId();
      const durationMs = toast.durationMs ?? DEFAULT_DURATION;
      const item: ToastItem = {
        id,
        tone: toast.tone,
        title: toast.title,
        description: toast.description,
        durationMs,
      };
      setToasts((prev) => [...prev.slice(-4), item]);
      if (durationMs > 0) {
        const timer = window.setTimeout(() => dismiss(id), durationMs);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  const success = useCallback(
    (title: string, description?: string) => push({ tone: 'success', title, description }),
    [push],
  );

  const error = useCallback(
    (title: string, description?: string) => push({ tone: 'error', title, description }),
    [push],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ toasts, push, success, error, dismiss, clear }),
    [toasts, push, success, error, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>.');
  }
  return ctx;
}
