import {validateContract} from '@abh/contracts/schema';
import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { stateRegistry } from '@abh/contracts/states';
import { databaseManifest } from './manifest.ts';
import { queueManifest } from './queue-manifest.ts';

export class DatabaseReadinessError extends Error {
  readonly violations: readonly string[];
  constructor(violations: string[]) {
    super('Database does not satisfy the registered security manifest.');
    this.name = 'DatabaseReadinessError';
    this.violations = violations;
  }
}

/** Catalog reads are performed through the same restricted identity as the application. */
export async function verifyDatabase(sql: postgres.Sql): Promise<void> {
  const violations: string[] = [];
  const [environment] = await sql`SELECT current_user AS actor, current_setting('server_version_num')::integer AS version,
    current_setting('abh.resource_organization_id', true) AS tenant,
    has_database_privilege(current_user, current_database(), 'CREATE') AS db_create,
    has_database_privilege(current_user, current_database(), 'TEMP') AS db_temp`;
  if (environment?.actor !== databaseManifest.runtime || Math.floor(environment.version / 10000) !== databaseManifest.postgresMajor) violations.push('runtime-or-postgres-version');
  if (environment?.tenant || environment?.db_create || environment?.db_temp) violations.push('session-or-database-privileges');
  const roles = await sql`SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication, rolinherit
    FROM pg_roles WHERE rolname IN ('abh_runtime','abh_core_owner','abh_queue','abh_control_verifier')`;
  if (roles.length !== 4) violations.push('roles-missing');
  for (const role of roles) if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolbypassrls || role.rolreplication || role.rolinherit || role.rolcanlogin !== ['abh_runtime','abh_queue'].includes(role.rolname)) violations.push(`role:${role.rolname}`);
  const inherited = await sql`SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('abh_runtime','abh_queue','abh_control_verifier'))`;
  if (inherited.length) violations.push('runtime-role-membership');
  const defaults = await sql`SELECT 1 FROM pg_db_role_setting WHERE setconfig::text LIKE '%abh.resource_organization_id=%'`;
  if (defaults.length) violations.push('tenant-session-default');
  const schemas = await sql`SELECT n.nspname, r.rolname AS owner, has_schema_privilege('abh_runtime', n.oid, 'CREATE') AS runtime_create,
    has_schema_privilege('abh_queue', n.oid, 'USAGE') AS queue_usage
    FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE n.nspname IN ('core','identity','control','resource','data','deployment','release','human','execution','runtime','extension','read')`;
  if (schemas.length !== databaseManifest.schemas.length) violations.push('schemas-missing');
  for (const schema of schemas) if (schema.owner !== databaseManifest.owner || schema.runtime_create || schema.queue_usage) violations.push(`schema:${schema.nspname}`);
  const publicCreate = await sql`SELECT has_schema_privilege('abh_runtime','public','CREATE') AS allowed`;
  if (publicCreate[0]?.allowed) violations.push('public-schema-write');
  const queueSchemas=await sql`SELECT r.rolname AS owner,has_schema_privilege('abh_runtime',n.oid,'USAGE,CREATE') AS runtime_access,
    has_schema_privilege('abh_control_verifier',n.oid,'USAGE,CREATE') AS verifier_access FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='abh_pgboss'`;
  if(queueSchemas.length!==1||queueSchemas[0]!.owner!==queueManifest.owner||queueSchemas[0]!.runtime_access||queueSchemas[0]!.verifier_access)violations.push('queue-schema-privileges');
  // Registered migration targets are isolated deployment storage, not Core
  // business objects. Permit their presence only while runtime/queue/verifier
  // have no schema or relation access. This does not certify migration/Enable.
  const isolatedPackSchemas=new Map<string,string>();
  const [ownershipTable]=await sql`SELECT to_regclass('extension.schema_ownership') AS present`;
  if(ownershipTable?.present){
    const owned=await sql`SELECT o.schema_name,o.pack_id,o.database_role,o.migration_version,o.review_ref,
      r.rolname AS actual_owner,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,r.rolreplication,r.rolinherit,
      EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership,
      EXISTS(SELECT 1 FROM extension.schema_roles sr WHERE sr.database_role=o.database_role AND sr.pack_id=o.pack_id) AS bound,
      has_schema_privilege('abh_runtime',n.oid,'USAGE,CREATE') AS runtime_access,
      has_schema_privilege('abh_queue',n.oid,'USAGE,CREATE') AS queue_access,
      has_schema_privilege('abh_control_verifier',n.oid,'USAGE,CREATE') AS verifier_access
      FROM extension.schema_ownership o LEFT JOIN pg_namespace n ON n.nspname=o.schema_name LEFT JOIN pg_roles r ON r.oid=n.nspowner
      ORDER BY o.schema_name LIMIT 1001`;
    if(owned.length>1000)violations.push('pack-schema-inventory-limit');
    for(const owner of owned){
      const reserved=(databaseManifest.schemas as readonly string[]).includes(owner.schema_name)||['public','information_schema'].includes(owner.schema_name)||/^(pg_|abh_)/.test(owner.schema_name);
      if(reserved||!validateContract('PackSchemaOwnership',{schemaName:owner.schema_name,packId:owner.pack_id,databaseRole:owner.database_role}).success||
        !validateContract('EntityRef',owner.review_ref).success||Number(owner.migration_version)!==0||!owner.bound||owner.actual_owner!==owner.database_role||
        /^(pg_|abh_)/.test(owner.database_role)||owner.database_role==='postgres'||!owner.rolcanlogin||owner.rolsuper||owner.rolcreatedb||owner.rolcreaterole||owner.rolbypassrls||owner.rolreplication||owner.rolinherit||owner.membership||
        owner.runtime_access||owner.queue_access||owner.verifier_access){violations.push(`pack-schema-isolation:${owner.schema_name}`);continue;}
      isolatedPackSchemas.set(owner.schema_name,owner.database_role);
    }
  }
  const tables = await sql`SELECT n.nspname AS schema, c.relname AS name, c.oid,c.relkind,
    (SELECT parent.relname FROM pg_inherits inheritance JOIN pg_class parent ON parent.oid=inheritance.inhparent JOIN pg_namespace pn ON pn.oid=parent.relnamespace WHERE inheritance.inhrelid=c.oid AND pn.nspname=n.nspname LIMIT 1) AS parent_name,
    pg_get_expr(c.relpartbound,c.oid) AS partition_bound, r.rolname AS owner, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
    has_table_privilege('abh_runtime', c.oid, 'SELECT') AS can_select,
    has_table_privilege('abh_runtime', c.oid, 'INSERT') AS can_insert,
    has_table_privilege('abh_runtime', c.oid, 'UPDATE') AS can_update,
    has_table_privilege('abh_runtime', c.oid, 'DELETE') AS can_delete,
    has_table_privilege('abh_runtime', c.oid, 'TRUNCATE') AS can_truncate,
    has_table_privilege('abh_runtime', c.oid, 'REFERENCES') AS can_reference,
    has_table_privilege('abh_runtime', c.oid, 'TRIGGER') AS can_trigger,
    has_table_privilege('abh_queue', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS queue_access,
    has_any_column_privilege('abh_queue',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS queue_column_access,
    has_any_column_privilege('abh_runtime',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS runtime_column_access,
    has_any_column_privilege('abh_runtime',c.oid,'INSERT,UPDATE,REFERENCES') AS runtime_column_write,
    has_any_column_privilege('abh_control_verifier',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS verifier_column_access,
    has_table_privilege('abh_control_verifier', c.oid, 'DELETE,TRUNCATE,TRIGGER') AS verifier_destructive,
    has_table_privilege('abh_control_verifier',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS verifier_access,
    (SELECT attnotnull FROM pg_attribute WHERE attrelid=c.oid AND attname='resource_organization_id' AND NOT attisdropped) AS tenant_required
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
    WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;
  if(isolatedPackSchemas.size){
    const sequences=await sql`SELECT n.nspname AS schema,c.relname AS name,r.rolname AS owner,
      has_sequence_privilege('abh_runtime',c.oid,'USAGE,SELECT,UPDATE') AS runtime_access,
      has_sequence_privilege('abh_queue',c.oid,'USAGE,SELECT,UPDATE') AS queue_access,
      has_sequence_privilege('abh_control_verifier',c.oid,'USAGE,SELECT,UPDATE') AS verifier_access
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE c.relkind='S' AND n.nspname=ANY(${[...isolatedPackSchemas.keys()]})`;
    for(const sequence of sequences)if(sequence.owner!==isolatedPackSchemas.get(sequence.schema)||sequence.runtime_access||sequence.queue_access||sequence.verifier_access)violations.push(`pack-sequence-isolation:${sequence.schema}.${sequence.name}`);
  }
  const policies = await sql`SELECT polrelid AS table_oid, polname, polcmd, polpermissive,
    ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)) AS roles,
    pg_get_expr(polqual,polrelid) AS using_expr, pg_get_expr(polwithcheck,polrelid) AS check_expr FROM pg_policy`;
  const generated=await sql`SELECT ns.nspname AS schema,c.relname AS table_name,a.attname AS name,a.attgenerated,
    format_type(a.atttypid,a.atttypmod) AS type,pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE ns.nspname=ANY(${databaseManifest.schemas}) AND a.attnum>0 AND NOT a.attisdropped`;
  for(const expected of databaseManifest.generatedColumns){
    const actual=generated.find(column=>column.schema===expected.schema&&column.table_name===expected.table&&column.name===expected.name);
    if(!actual||actual.attgenerated!=='s'||actual.type!==expected.type||actual.expression!==expected.expression)violations.push(`generated-lookup:${expected.schema}.${expected.table}.${expected.name}`);
  }
  const indexes=await sql`SELECT ns.nspname AS schema,idx.relname AS name,tbl.relname AS table_name,tn.nspname AS table_schema,
    r.rolname AS owner,i.indisvalid,i.indisready,i.indislive,pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_namespace ns ON ns.oid=idx.relnamespace
    JOIN pg_class tbl ON tbl.oid=i.indrelid JOIN pg_namespace tn ON tn.oid=tbl.relnamespace JOIN pg_roles r ON r.oid=idx.relowner
    WHERE ns.nspname=ANY(${databaseManifest.schemas})`;
  for(const expected of databaseManifest.indexes){
    const actual=indexes.find(index=>index.schema===expected.schema&&index.name===expected.name);
    if(!actual||actual.table_schema!==expected.schema||actual.table_name!==expected.table||actual.owner!==databaseManifest.owner||!actual.indisvalid||!actual.indisready||!actual.indislive||actual.definition!==expected.definition)violations.push(`lookup-index:${expected.schema}.${expected.name}`);
  }
  const constraints = await sql`SELECT conrelid AS table_oid,conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint`;
  for(const expected of databaseManifest.lifecycleConstraints){
    const table=tables.find(item=>`${item.schema}.${item.name}`===expected.table);
    const actual=constraints.find(item=>item.table_oid===table?.oid&&item.conname===expected.name);
    if(!actual?.convalidated||createHash('sha256').update(actual.definition).digest('hex')!==expected.sha256)violations.push(`lifecycle-constraint:${expected.table}`);
  }
  // Keep boolean grouping. Removing parentheses can conceal a changed AND/OR state constraint.
  const normalize = (s: string) => s.split(/('(?:[^']|'')*')/).map((part,i)=>i%2?part:part.replace(/\s/g,'').replaceAll('::text','')).join('');
  const expectedPolicy = normalize("(resource_organization_id = (NULLIF(current_setting('abh.resource_organization_id', true), ''))::uuid)");
  for (const actual of tables) {
    const packOwner=isolatedPackSchemas.get(actual.schema);
    if(packOwner){
      if(actual.owner!==packOwner||actual.can_select||actual.can_insert||actual.can_update||actual.can_delete||actual.can_truncate||actual.can_reference||actual.can_trigger||actual.runtime_column_access||actual.queue_access||actual.queue_column_access||actual.verifier_access||actual.verifier_destructive||actual.verifier_column_access)violations.push(`pack-table-isolation:${actual.schema}.${actual.name}`);
      continue;
    }
    if(actual.schema===queueManifest.schema){
      const known=(queueManifest.tables as readonly string[]).includes(actual.name);
      const partition=/^queue_stats_[0-9]{8}$/.test(actual.name)&&actual.parent_name==='queue_stats'&&actual.relkind==='r'&&/^FOR VALUES FROM /.test(actual.partition_bound??'');
      if((!known&&!partition)||actual.owner!==queueManifest.owner||actual.can_select||actual.can_insert||actual.can_update||actual.can_delete||actual.can_truncate||actual.can_reference||actual.can_trigger||actual.verifier_access||actual.verifier_destructive||actual.runtime_column_access||actual.verifier_column_access)violations.push(`queue-table:${actual.name}`);
      continue;
    }
    if(actual.verifier_destructive) violations.push(`verifier-destructive:${actual.schema}.${actual.name}`);
    const expected = databaseManifest.tables.find(t=>t.schema===actual.schema && t.name===actual.name);
    if (!expected) {
      const deployment = databaseManifest.deploymentTables.find(t=>t.schema===actual.schema && t.name===actual.name);
      if (!deployment) violations.push(`unregistered-table:${actual.schema}.${actual.name}`);
      if(deployment && 'maintenanceOnly' in deployment && deployment.maintenanceOnly){
        if(actual.owner!==databaseManifest.owner||actual.can_select||actual.can_insert||actual.can_update||actual.can_delete||actual.can_truncate||actual.can_reference||actual.can_trigger||actual.runtime_column_access||actual.queue_access||actual.queue_column_access||actual.verifier_access||actual.verifier_destructive||actual.verifier_column_access)violations.push(`deployment-table-privileges:${actual.schema}.${actual.name}`);
      }else if (deployment && (deployment.contract || ('readOnly' in deployment && deployment.readOnly)) && (actual.owner !== databaseManifest.owner || !actual.can_select || actual.can_insert || actual.can_update || actual.can_delete || actual.can_truncate || actual.can_reference || actual.can_trigger || actual.queue_access || actual.queue_column_access || actual.verifier_access || actual.verifier_destructive || actual.verifier_column_access || actual.runtime_column_write)) violations.push(`deployment-table-privileges:${actual.schema}.${actual.name}`);
      if(actual.schema==='extension'&&['migration_packages','migration_attempts','migration_observations'].includes(actual.name)){
        const required=actual.name==='migration_packages'?['PRIMARY KEY (pack_id, pack_version)','UNIQUE (pack_id, pack_version, package_digest)']:
          actual.name==='migration_attempts'?['PRIMARY KEY (id)','UNIQUE (pack_id, pack_version, migration_ref)','FOREIGN KEY (pack_id, pack_version, package_digest) REFERENCES extension.migration_packages(pack_id, pack_version, package_digest)']:
          ['PRIMARY KEY (id)','UNIQUE (attempt_id, kind)','FOREIGN KEY (attempt_id) REFERENCES extension.migration_attempts(id)'];
        if(required.some(definition=>!constraints.some(c=>c.table_oid===actual.oid&&c.convalidated&&normalize(c.definition)===normalize(definition))))violations.push(`migration-journal-constraints:${actual.name}`);
      }
      if(actual.schema==='extension'&&['schema_roles','schema_ownership'].includes(actual.name)){
        const required=actual.name==='schema_roles'?['PRIMARY KEY (database_role)','UNIQUE (database_role, pack_id)']:
          ['PRIMARY KEY (schema_name)','FOREIGN KEY (database_role, pack_id) REFERENCES extension.schema_roles(database_role, pack_id)'];
        if(required.some(definition=>!constraints.some(c=>c.table_oid===actual.oid&&c.convalidated&&normalize(c.definition)===normalize(definition))))violations.push(`schema-ownership-constraints:${actual.name}`);
      }
      continue;
    }
    const key = `${expected.schema}.${expected.name}`;
    if (actual.owner !== databaseManifest.owner || !actual.enabled || !actual.forced || !actual.tenant_required) violations.push(`rls-or-owner:${key}`);
    if (!actual.can_select || !actual.can_insert || actual.can_update !== expected.mutable || actual.can_delete || actual.can_truncate || actual.can_reference || actual.can_trigger || actual.queue_access) violations.push(`table-privileges:${key}`);
    if (expected.state) {
      const machine: {states:readonly string[];combinations?:Readonly<Record<string,readonly string[]>>}=stateRegistry.machines[expected.state];
      const stateName=expected.state.replace(/[A-Z]/g,(letter,i)=>(i?'_':'')+letter.toLowerCase())+'_state_check';
      const constraint=constraints.find(c=>c.table_oid===actual.oid && c.conname===stateName);
      const literal=(s:string)=>"'"+s+"'";
      const oneOf=(column:string,values:readonly string[])=>values.length===1?column+'='+literal(values[0]!):column+'=ANY(ARRAY['+values.map(literal).join(',')+'])';
      const expression=machine.combinations?'CHECK(((lifecycle IS NOT NULL) AND (outcome IS NOT NULL) AND ('+Object.entries(machine.combinations).map(([state,outcomes])=>'((lifecycle='+literal(state)+') AND ('+oneOf('outcome',outcomes)+'))').join(' OR ')+')))':"CHECK(((status IS NOT NULL) AND ("+oneOf('status',machine.states)+")))";
      if (!constraint?.convalidated || normalize(constraint.definition)!==normalize(expression)) violations.push(`state-constraint:${key}`);
    }
    if (constraints.some(c=>c.table_oid===actual.oid && c.contype==='f')) violations.push(`physical-foreign-key:${key}`);
    const matches = policies.filter(p=>p.table_oid===actual.oid);
    const verifierExpected=(databaseManifest.verifierTables as readonly string[]).includes(key);
    const helper=matches.find(p=>p.polname==='control_verifier');
    if (verifierExpected && (!helper || !helper.polpermissive || helper.polcmd!=='*' || JSON.stringify(helper.roles)!=='["abh_control_verifier"]' || helper.using_expr!=='true' || helper.check_expr!=='false')) violations.push(`control-verifier-policy:${key}`);
    const policy = matches.find(p=>p.polname==='tenant_isolation');
    if (matches.length !== (verifierExpected?2:1) || !policy || policy.polname !== 'tenant_isolation' || policy.polcmd !== '*' || !policy.polpermissive || JSON.stringify(policy.roles) !== '["abh_runtime"]' || normalize(policy.using_expr ?? '') !== expectedPolicy || normalize(policy.check_expr ?? '') !== expectedPolicy) violations.push(`policy:${key}`);
  }
  for (const expected of databaseManifest.tables) if (!tables.some(t=>t.schema===expected.schema && t.name===expected.name)) violations.push(`table-missing:${expected.schema}.${expected.name}`);
  for (const expected of databaseManifest.deploymentTables) if (!tables.some(t=>t.schema===expected.schema && t.name===expected.name)) violations.push(`deployment-table-missing:${expected.schema}.${expected.name}`);
  const columns=await sql`SELECT n.nspname||'.'||c.relname AS table_name,a.attname,
    has_column_privilege('abh_runtime',c.oid,a.attnum,'UPDATE') AS runtime_update,
    has_column_privilege('abh_control_verifier',c.oid,a.attnum,'SELECT') AS can_read,
    has_column_privilege('abh_control_verifier',c.oid,a.attnum,'UPDATE') AS can_update,
    has_column_privilege('abh_control_verifier',c.oid,a.attnum,'INSERT') AS can_insert,
    has_column_privilege('abh_control_verifier',c.oid,a.attnum,'REFERENCES') AS can_reference
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p') AND n.nspname IN ('core','identity','control','resource','data','deployment','release','human','execution','runtime','extension','read')`;
  for (const column of columns) {
    const table=databaseManifest.tables.find(item=>`${item.schema}.${item.name}`===column.table_name);
    if(table&&!table.mutable){
      const allowed=(databaseManifest.lifecycleUpdateColumns as Record<string,readonly string[]>)[column.table_name]??[];
      if(column.runtime_update!==allowed.includes(column.attname))violations.push(`runtime-update-columns:${column.table_name}.${column.attname}`);
    }
    const expected=(databaseManifest.verifierColumns as Record<string,readonly string[]>)[column.table_name]??[];
    if (column.can_read!==expected.includes(column.attname) || column.can_update!==(column.table_name==='control.fences'&&column.attname==='epoch') || column.can_insert || column.can_reference) violations.push(`control-verifier-columns:${column.table_name}.${column.attname}`);
  }
  const functions = await sql`SELECT p.oid,p.proname,n.nspname,r.rolname AS owner,p.prosecdef,p.proconfig,p.prosrc,oidvectortypes(p.proargtypes) AS arguments,
    has_function_privilege('abh_runtime',p.oid,'EXECUTE') AS runtime_execute,has_function_privilege('abh_queue',p.oid,'EXECUTE') AS queue_execute,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'`;
  const queueInstalled=tables.some(table=>table.schema===queueManifest.schema);
  if(queueInstalled)for(const name of queueManifest.tables)if(!tables.some(table=>table.schema===queueManifest.schema&&table.name===name))violations.push(`queue-table-missing:${name}`);
  if (functions.length!==databaseManifest.functions.length+(queueInstalled?queueManifest.functions.length:0)) violations.push('function-inventory');
  for (const fn of functions) {
    if(fn.nspname===queueManifest.schema){
      const expected=queueManifest.functions.find(item=>item.name===fn.proname&&item.arguments===fn.arguments);
      if(!expected||fn.owner!==queueManifest.owner||fn.prosecdef||fn.runtime_execute||!fn.queue_execute||fn.public_execute||createHash('sha256').update(fn.prosrc).digest('hex')!==expected.sourceSha256)violations.push(`queue-function:${fn.proname}`);
      continue;
    }
    const registered=databaseManifest.functions.find(item=>item.schema===fn.nspname && item.name===fn.proname);
    if (!registered || fn.owner!==registered.owner || fn.arguments!==registered.arguments || createHash('sha256').update(fn.prosrc).digest('hex')!==registered.sourceSha256 || !fn.prosecdef || !fn.runtime_execute || fn.queue_execute || fn.public_execute || JSON.stringify(fn.proconfig)!=='["search_path=pg_catalog, control"]') violations.push(`control-function:${fn.proname}`);
  }
  if (violations.length) throw new DatabaseReadinessError(violations);
}
