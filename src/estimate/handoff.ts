/**
 * What the siding studio hands to the estimate form.
 *
 * A module variable, not storage and not a query string: the configuration is
 * a prototype convenience, it belongs to this visit only, and it is read once
 * and cleared. Nothing about it is persisted and nothing about it leaves the
 * browser, which is the same promise the rest of the form makes.
 */

import type { ServiceId } from '../content';

export interface StudioHandoff {
  serviceIds: ServiceId[];
  details: string;
}

let pending: StudioHandoff | null = null;

export function carryToEstimate(handoff: StudioHandoff): void {
  pending = handoff;
}

/** Read once. A reload, or a second visit to the form, starts empty again. */
export function takeHandoff(): StudioHandoff | null {
  const held = pending;
  pending = null;
  return held;
}
