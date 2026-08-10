import type { UserRole } from './enums';

/** Usuário autenticado (contrato FE↔API). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  timezone?: string | null;
  phone?: string | null;
}
