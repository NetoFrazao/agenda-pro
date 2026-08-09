/**
 * Helpers de isolamento multi-tenant.
 * Toda query de domínio deve passar pelo tenantId — nunca confiar só no ID do recurso.
 */

export class TenantScopeError extends Error {
  constructor(message = 'Recurso não pertence ao tenant autenticado') {
    super(message);
    this.name = 'TenantScopeError';
  }
}

/** Garante que o registro encontrado pertence ao tenant da sessão. */
export function assertTenantOwnership(
  resourceTenantId: string | null | undefined,
  sessionTenantId: string,
): void {
  if (!resourceTenantId || resourceTenantId !== sessionTenantId) {
    throw new TenantScopeError();
  }
}

/** Monta o `where` mínimo obrigatório em listagens. */
export function tenantWhere(tenantId: string) {
  return { tenantId } as const;
}
