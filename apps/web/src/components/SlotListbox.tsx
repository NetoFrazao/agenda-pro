'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatTime } from '@/lib/format';

interface SlotListboxProps {
  slots: string[];
  value: string | null;
  onChange: (iso: string) => void;
  timezone?: string;
  label?: string;
  className?: string;
}

/**
 * Listbox de horários navegável por teclado (setas, Home/End, Enter/Espaço).
 * Mantém o visual Graphite (`slot-chip`) do booking público.
 */
export function SlotListbox({
  slots,
  value,
  onChange,
  timezone,
  label = 'Horários disponíveis',
  className = 'mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4',
}: SlotListboxProps) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(() => {
    const i = value ? slots.indexOf(value) : -1;
    return i >= 0 ? i : 0;
  });

  useEffect(() => {
    const i = value ? slots.indexOf(value) : -1;
    if (i >= 0) setActiveIndex(i);
    else if (slots.length > 0 && activeIndex >= slots.length) setActiveIndex(0);
  }, [slots, value, activeIndex]);

  function focusOption(index: number) {
    const clamped = Math.max(0, Math.min(slots.length - 1, index));
    setActiveIndex(clamped);
    const el = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[clamped];
    el?.focus();
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (slots.length === 0) return;
    const cols =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches ? 4 : 3;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusOption(index - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusOption(index + cols);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusOption(index - cols);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(slots.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onChange(slots[index]);
        break;
      default:
        break;
    }
  }

  return (
    <ul
      ref={listRef}
      id={listId}
      className={className}
      role="listbox"
      aria-label={label}
      aria-activedescendant={slots[activeIndex] ? `${listId}-${activeIndex}` : undefined}
    >
      {slots.map((iso, index) => {
        const selected = value === iso;
        return (
          <li key={iso}>
            <button
              type="button"
              id={`${listId}-${index}`}
              role="option"
              aria-selected={selected}
              data-selected={selected}
              tabIndex={index === activeIndex ? 0 : -1}
              className="slot-chip min-h-11 w-full rounded-xl bg-white px-2 py-2.5 text-sm font-semibold text-ink ring-1 ring-line hover:ring-mint-deep/40 focus-visible:ring-2 focus-visible:ring-mint-deep"
              onClick={() => onChange(iso)}
              onKeyDown={(e) => onKeyDown(e, index)}
              onFocus={() => setActiveIndex(index)}
            >
              {formatTime(iso, timezone)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
