import type { z } from 'zod';
import type { InstitutionPermissionKey } from '@edrion/permissions/institution';
import type { PortalActionContext } from '../../portal-action-context';

/**
 * A Petros function tool. The registry filters by principal permissions + institution type
 * (guardrail layer 1), the agent loop zod-validates args, `evaluateGuardrail` decides
 * inline-execute vs confirmation, and `execute` delegates to the EXISTING audited portal
 * service — no parallel write paths, same keys as the REST endpoint.
 */
export interface PetrosTool {
  name: string;
  description: string;
  /** Zod schema the loop validates arguments with. */
  inputSchema: z.ZodType;
  /** JSON Schema surfaced to the model (kept literal — no runtime zod→JSON conversion). */
  parameters: Record<string, unknown>;
  /** SAME keys as the REST endpoint. ALL must be held. */
  requiredPermissions: readonly InstitutionPermissionKey[];
  capability: 'read' | 'mutation';
  /** Shown in the UI while the tool runs, e.g. "Searching students…". */
  humanStatus: string;
  /** Restrict to certain institution types (absent = all). */
  institutionTypes?: readonly string[];
  execute(ctx: PortalActionContext, args: Record<string, unknown>): Promise<unknown>;
  /** Exact-impact preview for mutations (renders the confirmation card). */
  impactPreview?(ctx: PortalActionContext, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Base JSON-schema helper for tool parameter objects (strict mode needs every field present). */
export function params(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}
