import {canonicalJson} from '@abh/contracts/digest';
import type {TransactionOptions} from '../data/uow.ts';
import {readPackArchive} from './read-pack-archive.ts';
import {validatePackArchive} from './validate-pack-archive.ts';
import type {PackGovernanceSource,GovernedLocalPack} from './validate-current-pack.ts';

/** Local distribution entry: bounded archive file read and full validation share one deadline. */
export async function validatePackArchiveFile(input:Omit<Parameters<typeof validatePackArchive>[0],'bytes'>&{path:string},
  source:PackGovernanceSource,options:TransactionOptions):Promise<GovernedLocalPack>{
  const current={...options,readOnly:true,deadline:Math.min(options.deadline,Date.now()+30000)};
  const snapshot=JSON.parse(canonicalJson(input)) as typeof input,read=source.current.bind(source);
  const bytes=await readPackArchive(snapshot.path,snapshot.limits.maxArchiveBytes,current);
  return validatePackArchive({...snapshot,bytes},{current:read},current);
}
