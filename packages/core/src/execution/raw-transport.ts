import type {ArtifactRecord} from '@abh/contracts';
import {canonicalJson,digestBytes} from '@abh/contracts/digest';
import {CoreError} from '../internal/errors.ts';

export const rawTransportMediaType='application/vnd.abh.raw-transport+json';
/** Bounded inline profile. Larger raw receipts must use the ObjectStore staging path. */
export async function encodeRawTransport(bytes:Uint8Array):Promise<string>{
  if(bytes.length>48_000)throw new CoreError('LIMIT_EXCEEDED');
  return canonicalJson({encoding:'base64',sizeBytes:bytes.length,digest:await digestBytes(bytes),bytes:Buffer.from(bytes).toString('base64')});
}
export async function decodeReceiptBytes(record:ArtifactRecord,bytes:Uint8Array):Promise<Uint8Array>{
  if(record.mediaType!==rawTransportMediaType)return bytes;
  try{
    const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!raw||typeof raw!=='object'||canonicalJson(Object.keys(raw).sort())!==canonicalJson(['bytes','digest','encoding','sizeBytes'])
      ||raw.encoding!=='base64'||typeof raw.bytes!=='string'||!Number.isInteger(raw.sizeBytes)||raw.sizeBytes<0||raw.sizeBytes>48_000)throw new Error();
    const decoded=Buffer.from(raw.bytes,'base64');
    if(decoded.toString('base64')!==raw.bytes||decoded.length!==raw.sizeBytes||await digestBytes(decoded)!==raw.digest)throw new Error();return new Uint8Array(decoded);
  }catch{throw new CoreError('RAW_RECEIPT_UNSUPPORTED');}
}
