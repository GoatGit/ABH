import type { EntityRef, FenceRecord } from '@abh/contracts';
import type { TenantTransaction } from '../data/uow.ts';
import { contract } from '../data/journal.ts';
import { CoreError } from '../internal/errors.ts';

export async function lockFences(tx: TenantTransaction, scopes: readonly EntityRef[]): Promise<FenceRecord[]> {
  const c=tx.context.tenant, sql=tx.owner('Control');
  const unique=new Map(scopes.map(scope=>[`${scope.type}/${scope.id}`,scope]));
  const results: FenceRecord[]=[];
  for (const [key,scope] of [...unique].sort(([a],[b])=>a<b?-1:a>b?1:0)) {
    contract('EntityRef',scope);
    await tx.lock(1,`${c.resourceOrganizationId}/Control/${key}`,()=>sql`SELECT id FROM control.fences
      WHERE resource_organization_id=${c.resourceOrganizationId} AND scope_type=${scope.type} AND scope_id=${scope.id} FOR UPDATE`);
    const rows=await sql`SELECT * FROM control.fences WHERE resource_organization_id=${c.resourceOrganizationId}
      AND scope_type=${scope.type} AND scope_id=${scope.id} AND deleted_at IS NULL`;
    if (!rows[0]) throw new CoreError('AUTHORITY_REQUIRED');
    const row=rows[0];
    results.push(contract('FenceRecord',{fenceRef:{type:'abh.fence',id:row.id,version:Number(row.version)},
      resourceOrganizationId:c.resourceOrganizationId,scopeRef:scope,epoch:Number(row.epoch),stopFlag:row.stop_flag}));
  }
  return results;
}
