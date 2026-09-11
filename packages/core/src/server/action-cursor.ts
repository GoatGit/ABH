import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { RequestContext } from '@abh/contracts';
import { canonicalJson } from '@abh/contracts/digest';
import { CoreError } from '../internal/errors.ts';

import { validateActionListPosition, type ActionListFilter, type ActionListPosition } from '../execution/action-list.ts';

/** Encrypted continuation position, bound to the current identity/scope and normalized filters. */
export class ActionCursorCodec {
  #key: Buffer;
  #ttl: number;
  constructor(key: Uint8Array, ttlMs = 900_000) {
    if (!(key instanceof Uint8Array) || key.byteLength !== 32 || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3_600_000) throw new TypeError('Invalid Action cursor configuration');
    this.#key = Buffer.from(key); this.#ttl = ttlMs;
  }
  #binding(context: Readonly<RequestContext>, filter: ActionListFilter): Buffer {
    return Buffer.from(canonicalJson({ route: 'abh.actions.list', organization: context.resourceOrganizationId,
      actingOrganization: context.actingOrganizationId, workspace: context.workspaceId ?? null, actor: context.actor,
      purpose: context.purposeOfUse, sessionEpoch: context.sessionEpoch, scopeEpoch: context.scopeEpoch,
      missionId: filter.missionId ?? null, type: filter.type ?? null, lifecycle: filter.lifecycle ?? null, outcome: filter.outcome ?? null }));
  }
  encode(after: ActionListPosition, context: Readonly<RequestContext>, filter: ActionListFilter): string {
    validateActionListPosition(after);
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    cipher.setAAD(this.#binding(context, filter));
    const ciphertext = Buffer.concat([cipher.update(canonicalJson({ after, expiresAt: Date.now() + this.#ttl }), 'utf8'), cipher.final()]);
    return `ac1.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
  }
  decode(token: string, context: Readonly<RequestContext>, filter: ActionListFilter): ActionListPosition {
    try {
      if (typeof token !== 'string' || token.length > 512 || !/^ac1\.[A-Za-z0-9_-]+$/.test(token)) throw new Error();
      const bytes = Buffer.from(token.slice(4), 'base64url');
      if (bytes.length < 29 || bytes.toString('base64url') !== token.slice(4)) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28)); decipher.setAAD(this.#binding(context, filter));
      const result = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      if (Object.keys(result).sort().join(',') !== 'after,expiresAt' || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= Date.now()) throw new Error();
      if (!result.after || Object.keys(result.after).sort().join(',') !== 'createdAt,id') throw new Error();
      validateActionListPosition(result.after); return result.after;
    } catch { throw new CoreError('INVALID_ARGUMENT'); }
  }
}
