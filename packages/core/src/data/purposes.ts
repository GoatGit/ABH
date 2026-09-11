import {coreCatalog} from '@abh/contracts/catalog';
import {contract} from './journal.ts';
import {CoreError} from '../internal/errors.ts';

/** Static Core lifecycle metadata only. Artifact content keeps its separate explicit purpose policy. */
export function lifecyclePurposes(names:readonly string[],current:string):string[]{
  contract('LifecyclePurposeNames',names);
  const known=new Set<string>(coreCatalog.purposes.map(purpose=>purpose.name));
  if(!names.includes(current)||names.some(name=>!known.has(name)))throw new CoreError('PURPOSE_DENIED');
  return [...names].sort();
}
