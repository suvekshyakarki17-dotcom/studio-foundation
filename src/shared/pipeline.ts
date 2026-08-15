/**
 * Pipeline transition rules for Agency Studio.
 *
 * Imported by the Convex backend (`businesses.setStage`) so every stage
 * change is validated in one place. This module has no dependencies so it
 * stays importable from server-side bundles and client-side bundles alike.
 *
 * The pipeline is deliberately permissive for a single operator: any move
 * from a non-terminal stage is allowed (including to WON/LOST). WON and
 * LOST are absorbing — a closed opportunity stays closed. Stage changes
 * are always operator-driven; nothing advances automatically.
 */
import {
  ENGAGED_STAGES,
  PIPELINE_STAGES,
  type PipelineStage,
} from "./domain";

/** Terminal (absorbing) stages. */
export const TERMINAL_STAGES: readonly PipelineStage[] = ["WON", "LOST"];

/** Stages representing a live, engaged conversation/opportunity. */
export const LIVE_OPPORTUNITY_STAGES: readonly PipelineStage[] =
  ENGAGED_STAGES;

export function isTerminal(stage: PipelineStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

/**
 * Whether a transition from `from` to `to` is permitted.
 * - Moving to the same stage is a no-op (false).
 * - Nothing may leave a terminal stage.
 * - Everything else is allowed, including closing to WON/LOST.
 */
export function canTransition(
  from: PipelineStage,
  to: PipelineStage,
): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  return PIPELINE_STAGES.includes(to);
}

/** Human-readable reason a transition is rejected (for error messages). */
export function transitionError(
  from: PipelineStage,
  to: PipelineStage,
): string | null {
  if (from === to) return null;
  if (isTerminal(from)) {
    return `"${from}" is a closed stage — move it back to an open stage before changing anything.`;
  }
  if (!PIPELINE_STAGES.includes(to)) {
    return `"${to}" is not a known pipeline stage.`;
  }
  return null;
}
