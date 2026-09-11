import type {Query} from '../data/uow.ts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';
/** Catalog-only direct trigger-function fingerprint, shared by table and view checks.
 * Caller has already established role, schema, transaction mode and search_path.
 * Does not recursively inspect function dependencies or execute function bodies. */
export async function readMigrationTriggers(sql:Query,relationOid:number){
   const triggers=await sql`SELECT t.tgname AS name,pg_get_triggerdef(t.oid,false) AS definition,t.tgenabled AS enabled,
     n.nspname AS function_schema,p.proname AS function_name,pg_get_function_identity_arguments(p.oid) AS arguments,l.lanname AS language,r.rolname AS function_owner,
     p.prosecdef AS security_definer,p.proleakproof AS leakproof,p.proisstrict AS strict,p.provolatile AS volatility,p.proparallel AS parallel,p.proconfig AS config,p.prosrc AS source,p.probin AS binary
     FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang JOIN pg_roles r ON r.oid=p.proowner
     WHERE t.tgrelid=${relationOid} AND NOT t.tgisinternal ORDER BY t.tgname COLLATE "C" LIMIT 1001`;
 if(triggers.length>1000)throw new CoreError('LIMIT_EXCEEDED');
 return await Promise.all(triggers.map(async t=>({name:t.name,definition:t.definition,enabled:t.enabled,functionDigest:await digestBytes(new TextEncoder().encode(canonicalJson({schema:t.function_schema,name:t.function_name,arguments:t.arguments,language:t.language,owner:t.function_owner,securityDefiner:t.security_definer,leakproof:t.leakproof,strict:t.strict,volatility:t.volatility,parallel:t.parallel,config:t.config,source:t.source,binary:t.binary})))})));
}
