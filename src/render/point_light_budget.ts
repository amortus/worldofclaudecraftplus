// Pure slot bookkeeping for the forward renderer's point-light budget. No THREE,
// no DOM: the renderer owns the actual lights, this module owns the DECISION of
// how many are attached and which of them contribute, so the decision can be
// unit tested in Node (tests/render_lights.test.ts) without a GPU.
//
// Why a fixed attached count matters: three.js bakes the number of VISIBLE
// lights into every lit material's shader. If that number changes, every lit
// material in view recompiles at once (a measured 21-program, multi-second
// in-world freeze on a real GPU). The fire lights the world owns are minted at
// different times (props at boot, dungeon/rift torches when an interior streams
// in) and their prop groups hide themselves with distance, so anything derived
// from "how many fire lights exist and are showing right now" DRIFTS. The
// renderer therefore mints exactly `slotCount` point lights once, keeps all of
// them attached forever, and gates contribution with intensity instead.

export interface PointLightSlotInput {
  /** fixed number of point lights the renderer minted once (GFX.maxPointLights) */
  readonly slotCount: number;
  /** fire lights that exist right now; GROWS as interiors stream in */
  readonly sourceCount: number;
  /** governor-throttled cap on how many slots may actually shine */
  readonly contributingBudget: number;
}

export interface PointLightSlotPlan {
  /** lights attached to the scene this frame. INVARIANT: always === slotCount */
  readonly attachedCount: number;
  /** leading slots that carry a real fire light (the nearest ones) */
  readonly filledSlots: number;
  /** leading slots allowed to shine; every slot past this one is zeroed */
  readonly contributingSlots: number;
  /** more sources than slots, so the ranking has to be sorted to pick the nearest */
  readonly needsSort: boolean;
}

function clampCount(n: number, fallback = 0): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

export function planPointLightSlots(input: PointLightSlotInput): PointLightSlotPlan {
  const slotCount = clampCount(input.slotCount);
  const sourceCount = clampCount(input.sourceCount);
  const filledSlots = Math.min(slotCount, sourceCount);
  const budget = clampCount(input.contributingBudget, slotCount);
  return {
    // Constant by construction: the count NEVER follows sourceCount.
    attachedCount: slotCount,
    filledSlots,
    contributingSlots: Math.min(filledSlots, budget),
    needsSort: sourceCount > slotCount,
  };
}

/** Does slot `slotIndex`, holding a source at `distanceSq`, shine this frame? */
export function slotContributes(
  slotIndex: number,
  distanceSq: number,
  plan: PointLightSlotPlan,
  rangeSq: number,
): boolean {
  if (slotIndex < 0 || slotIndex >= plan.contributingSlots) return false;
  return distanceSq < rangeSq;
}

/**
 * Campfire/torch flicker. `phase` is derived from the SOURCE index (not the slot)
 * so a light keeps its own wobble when the distance ranking reorders the slots.
 * Only contributing slots ever need this, so the renderer evaluates it at most
 * `slotCount` times per frame instead of once per fire light in the world.
 */
export function fireFlickerIntensity(base: number, phase: number, time: number): number {
  return base + Math.sin(time * 11 + phase) * 2.5 * (base / 11);
}

/** Stable flicker phase for the fire light minted at `sourceIndex`. */
export function fireFlickerPhase(sourceIndex: number): number {
  return sourceIndex * 1.7;
}
