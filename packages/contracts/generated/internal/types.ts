/* Generated from JSON Schema 2020-12. Do not edit. */

export type UUID = string;
export type RegisteredName = string;
export type Version = number;
export type Time = string;

/**
 * Internal data access contract only. Never accepted from public clients.
 */
export interface TenantContext {
  requestId: UUID;
  actor: Actor;
  actingOrganizationId: UUID;
  resourceOrganizationId: UUID;
  workspaceId?: UUID;
  purposeOfUse: RegisteredName;
  sessionEpoch: number;
  scopeEpoch: number;
  contextExpiresAt: Time;
}
export interface Actor {
  type: "Human" | "AgentInvocation" | "Service" | "ExternalPlatform";
  id: UUID;
  responsibilityRef?: EntityRef;
}
export interface EntityRef {
  type: RegisteredName;
  id: UUID;
  version: Version;
}
