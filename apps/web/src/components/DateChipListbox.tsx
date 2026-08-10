'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type DateChip = {
  ymd: string;
  hint: string;
  dayNum: string | number;
};

interface DateChipListboxProps {
  chips: DateChip[];
  value: string;
  onChange: (ymd: string) => void;
  label?: string;
}

/**
 * Chips horizontais de dia com teclado (setas, Home/End, Enter/Espaço).
 */
export function DateChipListbox({
  chips,
  value,
  onChange,
  label = 'Dias disponíveis',
}: DateChipListboxProps) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(() => {
    const i = chips.findIndex((c) => c.ymd === value);
    return i >= 0 ? i : 0;
  });

  useEffect(() => {
    const i = chips.findIndex((c) => c.ymd === value);
    if (i >= 0) setActiveIndex(i);
    else if (chips.length > 0 && activeIndex >= chips.length) setActiveIndex(0);
  }, [chips, value, activeIndex]);

  function focusOption(index: number) {
    const clamped = Math.max(0, Math.min(chips.length - 1, index));
    setActiveIndex(clamped);
    const el = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[clamped];
    el?.focus();
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (chips.length === 0) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusOption(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(chips.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onChange(chips[index].ymd);
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      aria-activedescendant={chips[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map((chip, index) => {
        const selected = value === chip.ymd;
        return (
          <button
            key={chip.ymd}
            id={`${listId}-${index}`}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onChange(chip.ymd)}
            onKeyDown={(e) => onKeyDown(e, index)}
            onFocus={() => setActiveIndex(index)}
            className={`focus-ring flex min-h-11 min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl px-3 py-2 text-center transition ${
              selected
                ? 'bg-ink text-white shadow-[var(--shadow-primary)]'
                : 'bg-white text-ink ring-1 ring-line hover:ring-mint-deep/40'
            }`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                selected ? 'text-mint-glow' : 'text-muted'
              }`}
            >
              {chip.hint}
            </span>
            <span className="font-display text-lg font-semibold leading-tight">{chip.dayNum}</span>
          </button>
        );
      })}
    </div>
  );
}
