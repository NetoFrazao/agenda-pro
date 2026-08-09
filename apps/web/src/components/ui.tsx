import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { APPOINTMENT_STATUS_LABEL, APPOINTMENT_STATUS_TONE, type BadgeTone } from '@/lib/format';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
};

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50',
  secondary:
    'bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 disabled:text-stone-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
  ghost: 'bg-transparent text-stone-700 hover:bg-stone-100 disabled:text-stone-400',
};

export function Button({
  variant = 'primary',
  fullWidth,
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${buttonVariants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
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
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-800">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-stone-500">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:bg-stone-100';

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
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-stone-200 bg-stone-50 text-stone-700',
  };
  return (
    <div role="alert" className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-stone-600">{description}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center text-sm text-stone-600">
      {children}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-stone-600" role="status">
      <span
        className="inline-block size-4 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-700"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

const badgeTones: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-900',
  sky: 'bg-sky-100 text-sky-900',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-900',
  orange: 'bg-orange-100 text-orange-900',
  stone: 'bg-stone-200 text-stone-700',
};

export function Badge({ tone = 'stone', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}
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

/** Estrelas somente-leitura (avaliações). */
export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const rounded = Math.round(value);
  return (
    <span
      className={`inline-flex text-amber-500 ${size === 'lg' ? 'text-xl' : 'text-sm'}`}
      role="img"
      aria-label={`${value.toLocaleString('pt-BR')} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden>
          {n <= rounded ? '★' : '☆'}
        </span>
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-stone-900/40"
        onClick={onClose}
        aria-label="Fechar janela"
        tabIndex={-1}
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-stone-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md px-2 py-0.5 text-lg leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
