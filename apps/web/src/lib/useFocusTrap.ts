'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Elementos focáveis dentro de um container (dialog / drawer). */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

type UseFocusTrapOptions = {
  /** Quando false, o trap não ativa (útil para drawers condicionais). */
  enabled?: boolean;
  /** Escape fecha o overlay. */
  onEscape?: () => void;
  /** Restaura foco ao desmontar (default true). */
  restoreFocus?: boolean;
  /** Trava scroll do body (default true). */
  lockScroll?: boolean;
  /** Se true, só aplica Tab trap em viewport mobile (drawer). */
  mobileOnly?: boolean;
};

/**
 * Focus trap reutilizável para overlays (Modal, menu mobile, confirm dialogs).
 * Move o foco inicial para o primeiro focável (ou o container) e cicla Tab.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  {
    enabled = true,
    onEscape,
    restoreFocus = true,
    lockScroll = true,
    mobileOnly = false,
  }: UseFocusTrapOptions = {},
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const panel = containerRef.current;
    const focusable = panel ? getFocusable(panel) : [];
    (focusable[0] ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (onEscapeRef.current) {
          e.preventDefault();
          onEscapeRef.current();
        }
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;
      if (mobileOnly && window.matchMedia('(min-width: 768px)').matches) return;

      const items = getFocusable(containerRef.current);
      if (items.length === 0) {
        e.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !containerRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !containerRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      if (restoreFocus) previous?.focus();
    };
  }, [enabled, restoreFocus, lockScroll, mobileOnly, containerRef]);
}
