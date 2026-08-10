'use client';

import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_TONE, type BadgeTone } from '@/lib/format';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { AlertCircle, CheckCircle2, Info, Loader2, Star, X } from './icons';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'dark';
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-mint-deep text-white shadow-[var(--shadow-primary)] hover:bg-mint-hover disabled:bg-mint-deep/45',
  secondary:
    'bg-white/90 text-ink border border-line hover:bg-white disabled:text-muted-soft',
  danger: 'bg-danger text-white hover:bg-danger-hover disabled:bg-danger/50',
  ghost: 'bg-transparent text-ink-muted hover:bg-black/[0.04] disabled:text-muted-soft',
  dark: 'bg-ink text-white hover:bg-ink-soft disabled:bg-ink/50',
};

const buttonSizes: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-11 rounded-lg px-3.5 py-2 text-sm',
  md: 'min-h-11 rounded-xl px-4 py-2.5 text-sm',
  lg: 'min-h-12 rounded-2xl px-6 py-3.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading = false,
  className = '',
  type = 'button',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`focus-ring inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition duration-150 disabled:cursor-not-allowed ${buttonVariants[variant]} ${buttonSizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="size-3.5 shrink-0 animate-spin opacity-80" aria-hidden /> : null}
      {children}
    </button>
  );
}

type FieldProps = {
  label: string;
  id: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, id, hint, error, children }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {control}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  'w-full min-h-11 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-soft shadow-[var(--shadow-inset-control)] transition focus-visible:border-mint-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mint-deep/35 disabled:bg-paper-2';

export function Input({ className = '', id, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input id={id} className={`${controlClass} ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea id={id} className={`${controlClass} min-h-24 ${className}`} {...props} />;
}

export function Select({
  className = '',
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select id={id} className={`${controlClass} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success' | 'info';
}) {
  const tones = {
    error: {
      className: 'border-danger-border bg-danger-bg text-danger-fg',
      Icon: AlertCircle,
    },
    success: {
      className: 'border-success-border bg-success-bg text-success-fg',
      Icon: CheckCircle2,
    },
    info: {
      className: 'border-line bg-white/70 text-ink-muted',
      Icon: Info,
    },
  };
  const { className, Icon } = tones[tone];
  return (
    <div
      role="alert"
      className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${className}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden strokeWidth={2} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="type-display-lg text-ink sm:text-[2rem]">{title}</h1>
        {description ? (
          <p className="type-body-lg mt-2 max-w-2xl text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line-soft bg-white/50 px-6 py-12 text-center">
      {title ? <p className="type-display-sm text-ink">{title}</p> : null}
      <div
        className={`type-body-sm text-muted ${title ? 'mt-2' : ''} ${action ? 'mb-5' : ''}`}
      >
        {children}
      </div>
      {action ? <div className="flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin text-mint-deep" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Bloco base de skeleton — use com className de tamanho. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-skeleton rounded-xl bg-paper-2 ${className}`} aria-hidden />
  );
}

/** Skeleton de card (StatCard / surface). */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`surface-elevated space-y-3 rounded-2xl p-5 ${className}`}
      role="status"
      aria-label="Carregando card"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32 max-w-full" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

/** Skeleton de lista (linhas em surface). */
export function SkeletonList({
  rows = 4,
  className = '',
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={`surface-elevated overflow-hidden rounded-2xl ${className}`}
      role="status"
      aria-label="Carregando lista"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 border-b border-paper-2 px-5 py-4 last:border-0"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

export function PageSkeleton({
  cards = 4,
  rows = 4,
}: {
  cards?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-8" role="status" aria-label="Carregando">
      <div className="space-y-3">
        <Skeleton className="h-9 w-48 sm:w-64" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <SkeletonList rows={rows} />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

const badgeTones: Record<BadgeTone, string> = {
  emerald: 'bg-success-bg text-success-fg',
  sky: 'bg-info-bg text-info-fg',
  amber: 'bg-warning-bg text-warning-fg',
  red: 'bg-danger-bg text-danger-fg',
  orange: 'bg-warning-bg text-warning-fg',
  stone: 'bg-paper-2 text-ink-muted',
};

export function Badge({ tone = 'stone', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={APPOINTMENT_STATUS_TONE[status] ?? 'stone'}>
      {APPOINTMENT_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const rounded = Math.round(value);
  const iconClass = size === 'lg' ? 'size-5' : 'size-3.5';
  return (
    <span
      className="inline-flex gap-0.5 text-brass"
      role="img"
      aria-label={`${value.toLocaleString('pt-BR')} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={iconClass}
          aria-hidden
          fill={n <= rounded ? 'currentColor' : 'none'}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, { onEscape: onClose });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Fechar janela"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-[var(--shadow-modal)] outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="type-display-sm text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring touch-target inline-flex items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink"
          >
            <X className="size-5" aria-hidden strokeWidth={2} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 ${accent ? 'bg-ink text-white' : 'surface-elevated'}`}>
      <p className={`type-overline ${accent ? 'text-white/70' : 'text-muted'}`}>{label}</p>
      <div className={`mt-3 type-display-lg tracking-tight ${accent ? 'text-white' : 'text-ink'}`}>
        {value}
      </div>
      {hint ? (
        <div className={`mt-2 text-sm ${accent ? 'text-white/75' : 'text-muted'}`}>{hint}</div>
      ) : null}
    </div>
  );
}

/* Re-exports claros para Agentes 2–3 */
export { Toast, ToastProvider, useToast } from './Toast';
export type { ToastItem, ToastTone } from './Toast';
