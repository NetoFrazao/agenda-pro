import { assertTenantOwnership, TenantScopeError, tenantWhere } from './tenant-scope';

describe('tenant-scope', () => {
  it('tenantWhere sempre inclui tenantId', () => {
    expect(tenantWhere('tenant_abc')).toEqual({ tenantId: 'tenant_abc' });
  });

  it('assertTenantOwnership passa quando IDs batem', () => {
    expect(() => assertTenantOwnership('t1', 't1')).not.toThrow();
  });

  it('assertTenantOwnership bloqueia vazamento cross-tenant', () => {
    expect(() => assertTenantOwnership('tenant_a', 'tenant_b')).toThrow(TenantScopeError);
  });

  it('assertTenantOwnership bloqueia recurso sem tenant', () => {
    expect(() => assertTenantOwnership(null, 'tenant_b')).toThrow(TenantScopeError);
  });
});
