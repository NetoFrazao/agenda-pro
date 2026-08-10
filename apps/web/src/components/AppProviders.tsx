'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from './Toast';

/** Providers de UI compartilhados (toast, etc.). */
export function AppProviders({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
