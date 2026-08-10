/**
 * Schema field helpers for capability input/output declarations.
 *
 * Produces CapabilityInputSchema / CapabilityOutputSchema as defined in
 * @rohinik-org/capability-manifest. No Zod dependency — keeps SDK thin.
 * Runtime validates these at ingestion; authors get local type checking.
 */

export type { CapabilityInputSchema, CapabilityOutputSchema } from '@rohinik-org/capability-manifest'
import type { CapabilityInputSchema, CapabilityOutputSchema } from '@rohinik-org/capability-manifest'

export function inputField(
  name: string,
  type: string,
  opts?: { description?: string; required?: boolean },
): CapabilityInputSchema {
  if (!name.trim()) throw new Error('input field name must be non-empty')
  if (!type.trim()) throw new Error('input field type must be non-empty')
  return { name, type, ...opts }
}

export function outputField(
  name: string,
  type: string,
  opts?: { description?: string },
): CapabilityOutputSchema {
  if (!name.trim()) throw new Error('output field name must be non-empty')
  if (!type.trim()) throw new Error('output field type must be non-empty')
  return { name, type, ...opts }
}
