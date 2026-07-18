import * as THREE from 'three';

// Quality tiers: every tier-dependent knob keys off this module instead of
// scattered LOW_GFX ternaries.
//
// Resolution order:
//   1. '?lowgfx' (legacy flag) or '?gfx=low'  -> low
//   2. '?gfx=medium' / '?gfx=high' / '?gfx=ultra' -> that tier, EVEN on software GL
//      (headless screenshot verification: stills render slowly but correctly)
//   3. an explicit persisted graphics preset -> that tier
//   4. no persisted preset (first boot / inconclusive detection) -> DEVICE-AWARE default via
//      resolveDefaultGraphicsPreset (recognized weak/software -> low, strong desktop -> high/ultra,
//      anything unrecognized -> medium), so the 3D tier matches the medium data-fx-level fallback

export type GfxTier = 'low' | 'medium' | 'high' | 'ultra';
export const GFX_CONFIG_VERSION = 14;

export const GFX_BUCKET_IDS = [
  'resolution',
  'grass',
  'foliage',
  'props',
  'lighting',
  'materials',
  'waterSky',
  'vfx',
  'characters',
  'weapons',
  'worldStreaming',
  'ui',
] as const;

export type GfxBucketId = typeof GFX_BUCKET_IDS[number];
export type GfxBucketCost = 'gpu' | 'cpu' | 'mixed';

export interface GfxBucketBand {
  readonly min: number;
  readonly baseline: number;
  readonly max: number;
  readonly roi: number;
  readonly cost: GfxBucketCost;
  readonly governable: boolean;
}

export type GfxBucketBands = Record<GfxBucketId, GfxBucketBand>;
export type GfxBucketLevels = Record<GfxBucketId, number>;

export interface GfxRuntimeHints {
  search: string;
  deviceMemory?: number;
  maxTouchPoints: number;
  coarsePointer: boolean;
  narrowViewport: boolean;
  hardwareConcurrency?: number;
  gpuRenderer?: string;
  graphicsPreset?: number;
  terrainDetail?: number;
  foliageDensity?: number;
  effectsQuality?: number;
  shadowQuality?: number;
}

export interface GfxSettings {
  readonly graphicsConfigVersion: number;
  readonly tier: GfxTier;
  readonly bucketBands: GfxBucketBands;
  readonly bucketBaselines: GfxBucketLevels;
  readonly budget: GfxRuntimeBudget;
  readonly autoGovernor: boolean;
  /** post-processing chain (N8AO + bloom + grade) */
  readonly composer: boolean;
  /** N8AO screen-space ambient occlusion pass */
  readonly ao: boolean;
  /** MSAA samples on the composer's HalfFloat target (WebGL2) */
  readonly msaaSamples: number;
  /** devicePixelRatio is capped here — 2.5 everywhere is a silent perf killer */
  readonly pixelRatioCap: number;
  readonly shadowMap: number;
  /** PBR MeshStandardMaterial; low keeps Lambert */
  readonly standardMaterials: boolean;
  /** Art-directed low-cost profile: richer cheap-path visuals without PBR/splat shaders. */
  readonly lowPlus: boolean;
  /** Use the cheaper low-foliage density/LOD policy while keeping the rest of the tier. */
  readonly leanFoliage: boolean;
  readonly grassRadius: number;
  readonly grassStep: number;
  readonly terrainSplat: boolean;
  readonly windSway: boolean;
  readonly maxPointLights: number;
  /** Texture anisotropy cap (desktop 8; mobile tiers drop it: anisotropic filtering is costly). */
  readonly anisotropy: number;
  /** Build ONE shared IBL cubemap instead of one per biome (mobile VRAM + boot win). */
  readonly singleIbl: boolean;
  /** Cheap radial-gradient ground discs under characters on tiers with no shadow map. */
  readonly blobShadows: boolean;
  /** Pooled vfx particle capacity (desktop 4096; phones shrink the pool + its per-frame uploads). */
  readonly vfxPoolSize: number;
  /** Max overhead nameplates rendered at once; 0 = unlimited (phones cap at the nearest few). */
  readonly nameplateMax: number;
  /** Throttle non-critical per-frame HUD DOM work (aura rows, etc.) to the 10Hz cadence. */
  readonly hudThrottled: boolean;
}

export interface GfxRuntimeBudget {
  readonly targetFps: number;
  readonly minRenderScaleDesktop: number;
  readonly minRenderScaleMobile: number;
  readonly maxRenderScale: number;
  readonly dropFrameMs: number;
  readonly urgentFrameMs: number;
  readonly recoverFrameMs: number;
  readonly dropStep: number;
  readonly urgentDropStep: number;
  readonly recoverStep: number;
  readonly recoverStableSeconds: number;
  readonly cooldownSeconds: number;
}

const PRESET_LOW = 1;
const PRESET_MEDIUM = 2;
const PRESET_HIGH = 3;
const PRESET_ULTRA = 4;
const PRESET_ADVANCED = 5;
const DEFAULT_PRESET = PRESET_ULTRA;

export const GFX_BUDGETS: Record<GfxTier, GfxRuntimeBudget> = {
  low: {
    targetFps: 60,
    minRenderScaleDesktop: 0.65,
    minRenderScaleMobile: 0.55,
    maxRenderScale: 1,
    dropFrameMs: 22,
    urgentFrameMs: 34,
    recoverFrameMs: 17.5,
    dropStep: 0.08,
    urgentDropStep: 0.12,
    recoverStep: 0.06,
    recoverStableSeconds: 6,
    cooldownSeconds: 1.1,
  },
  medium: {
    targetFps: 60,
    minRenderScaleDesktop: 0.72,
    minRenderScaleMobile: 0.55,
    maxRenderScale: 1,
    dropFrameMs: 24,
    urgentFrameMs: 34,
    recoverFrameMs: 17,
    dropStep: 0.1,
    urgentDropStep: 0.15,
    recoverStep: 0.05,
    recoverStableSeconds: 7,
    cooldownSeconds: 1.35,
  },
  high: {
    targetFps: 60,
    minRenderScaleDesktop: 0.7,
    minRenderScaleMobile: 0.6,
    maxRenderScale: 1,
    dropFrameMs: 22,
    urgentFrameMs: 32,
    recoverFrameMs: 15,
    dropStep: 0.1,
    urgentDropStep: 0.15,
    recoverStep: 0.05,
    recoverStableSeconds: 3,
    cooldownSeconds: 0.85,
  },
  ultra: {
    targetFps: 60,
    minRenderScaleDesktop: 0.78,
    minRenderScaleMobile: 0.68,
    maxRenderScale: 1,
    dropFrameMs: 24,
    urgentFrameMs: 34,
    recoverFrameMs: 15,
    dropStep: 0.08,
    urgentDropStep: 0.12,
    recoverStep: 0.04,
    recoverStableSeconds: 3,
    cooldownSeconds: 0.85,
  },
};

export const GFX_BUCKET_BANDS: Record<GfxTier, GfxBucketBands> = {
  low: {
    resolution: { min: 0.55, baseline: 1.0, max: 1.0, roi: 0.88, cost: 'gpu', governable: true },
    grass: { min: 0.62, baseline: 0.9, max: 1.0, roi: 0.9, cost: 'gpu', governable: true },
    foliage: { min: 0.68, baseline: 0.9, max: 1.0, roi: 0.84, cost: 'gpu', governable: true },
    props: { min: 0.35, baseline: 0.5, max: 0.62, roi: 0.58, cost: 'mixed', governable: false },
    lighting: { min: 0.78, baseline: 1.0, max: 1.0, roi: 0.72, cost: 'gpu', governable: true },
    materials: { min: 0.3, baseline: 0.45, max: 0.58, roi: 0.78, cost: 'gpu', governable: false },
    waterSky: { min: 0.35, baseline: 0.7, max: 0.8, roi: 0.82, cost: 'gpu', governable: false },
    vfx: { min: 0.84, baseline: 1.0, max: 1.0, roi: 0.9, cost: 'mixed', governable: true },
    characters: { min: 1.0, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    weapons: { min: 1.0, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    worldStreaming: { min: 0.25, baseline: 0.5, max: 0.68, roi: 0.62, cost: 'cpu', governable: true },
    ui: { min: 0.75, baseline: 0.9, max: 1.0, roi: 0.86, cost: 'cpu', governable: false },
  },
  medium: {
    resolution: { min: 0.55, baseline: 1.0, max: 1.0, roi: 0.88, cost: 'gpu', governable: true },
    grass: { min: 0.5, baseline: 0.78, max: 0.9, roi: 0.86, cost: 'gpu', governable: true },
    foliage: { min: 0.5, baseline: 0.74, max: 0.86, roi: 0.64, cost: 'gpu', governable: true },
    props: { min: 0.55, baseline: 0.7, max: 0.82, roi: 0.58, cost: 'mixed', governable: false },
    lighting: { min: 0.45, baseline: 0.72, max: 0.82, roi: 0.7, cost: 'gpu', governable: true },
    materials: { min: 0.62, baseline: 0.78, max: 0.9, roi: 0.78, cost: 'gpu', governable: false },
    waterSky: { min: 0.55, baseline: 0.78, max: 0.9, roi: 0.82, cost: 'gpu', governable: false },
    vfx: { min: 0.58, baseline: 0.8, max: 0.9, roi: 0.7, cost: 'mixed', governable: true },
    characters: { min: 0.86, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    weapons: { min: 1.0, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    worldStreaming: { min: 0.42, baseline: 0.7, max: 0.82, roi: 0.62, cost: 'cpu', governable: true },
    ui: { min: 0.82, baseline: 1.0, max: 1.0, roi: 0.86, cost: 'cpu', governable: false },
  },
  high: {
    resolution: { min: 0.6, baseline: 1.0, max: 1.0, roi: 0.88, cost: 'gpu', governable: true },
    grass: { min: 0.6, baseline: 0.88, max: 1.0, roi: 0.86, cost: 'gpu', governable: true },
    foliage: { min: 0.6, baseline: 0.9, max: 1.0, roi: 0.72, cost: 'gpu', governable: true },
    props: { min: 0.7, baseline: 0.88, max: 1.0, roi: 0.58, cost: 'mixed', governable: false },
    lighting: { min: 0.62, baseline: 0.9, max: 1.0, roi: 0.7, cost: 'gpu', governable: true },
    materials: { min: 0.75, baseline: 0.92, max: 1.0, roi: 0.78, cost: 'gpu', governable: false },
    waterSky: { min: 0.72, baseline: 0.92, max: 1.0, roi: 0.82, cost: 'gpu', governable: false },
    vfx: { min: 0.68, baseline: 0.92, max: 1.0, roi: 0.7, cost: 'mixed', governable: true },
    characters: { min: 0.9, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    weapons: { min: 1.0, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    worldStreaming: { min: 0.55, baseline: 0.88, max: 1.0, roi: 0.62, cost: 'cpu', governable: true },
    ui: { min: 0.86, baseline: 1.0, max: 1.0, roi: 0.86, cost: 'cpu', governable: false },
  },
  ultra: {
    resolution: { min: 0.68, baseline: 1.0, max: 1.0, roi: 0.88, cost: 'gpu', governable: true },
    grass: { min: 0.78, baseline: 1.0, max: 1.0, roi: 0.86, cost: 'gpu', governable: true },
    foliage: { min: 0.78, baseline: 1.0, max: 1.0, roi: 0.72, cost: 'gpu', governable: true },
    props: { min: 0.86, baseline: 1.0, max: 1.0, roi: 0.58, cost: 'mixed', governable: false },
    lighting: { min: 0.78, baseline: 1.0, max: 1.0, roi: 0.7, cost: 'gpu', governable: true },
    materials: { min: 0.86, baseline: 1.0, max: 1.0, roi: 0.78, cost: 'gpu', governable: false },
    waterSky: { min: 0.86, baseline: 1.0, max: 1.0, roi: 0.82, cost: 'gpu', governable: false },
    vfx: { min: 0.86, baseline: 1.0, max: 1.0, roi: 0.7, cost: 'mixed', governable: true },
    characters: { min: 0.94, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    weapons: { min: 1.0, baseline: 1.0, max: 1.0, roi: 1.0, cost: 'mixed', governable: false },
    worldStreaming: { min: 0.7, baseline: 1.0, max: 1.0, roi: 0.62, cost: 'cpu', governable: true },
    ui: { min: 0.9, baseline: 1.0, max: 1.0, roi: 0.86, cost: 'cpu', governable: false },
  },
};

function bucketBaselines(bands: GfxBucketBands): GfxBucketLevels {
  return {
    resolution: bands.resolution.baseline,
    grass: bands.grass.baseline,
    foliage: bands.foliage.baseline,
    props: bands.props.baseline,
    lighting: bands.lighting.baseline,
    materials: bands.materials.baseline,
    waterSky: bands.waterSky.baseline,
    vfx: bands.vfx.baseline,
    characters: bands.characters.baseline,
    weapons: bands.weapons.baseline,
    worldStreaming: bands.worldStreaming.baseline,
    ui: bands.ui.baseline,
  };
}

export function graphicsPresetLabel(value: number | undefined): 'low' | 'medium' | 'high' | 'ultra' | 'advanced' {
  switch (Math.round(value ?? DEFAULT_PRESET)) {
    case PRESET_LOW: return 'low';
    case PRESET_MEDIUM: return 'medium';
    case PRESET_HIGH: return 'high';
    case PRESET_ULTRA: return 'ultra';
    case PRESET_ADVANCED: return 'advanced';
    default: return 'low';
  }
}

export function shouldUseAutoGovernor(tier: GfxTier, search: string): boolean {
  const params = new URLSearchParams(search);
  const override = params.get('governor') ?? params.get('autoGovernor');
  if (override === '1' || override === 'true' || override === 'on') return true;
  if (override === '0' || override === 'false' || override === 'off') return false;
  // The runtime governor adapts every non-ultra tier; ultra opts out (the player explicitly maxed
  // it, or a recognized strong desktop auto-resolved there). Keying off the RESOLVED tier, not the
  // raw preset, keeps the governor ON for a first-run inconclusive device (the medium fallback) so
  // it can step quality down, instead of being silently opted out by an unset-preset -> ultra label.
  return tier !== 'ultra';
}

export function configureMaskedDoubleSidedVegetationMaterial<T extends THREE.Material>(mat: T): T {
  mat.side = THREE.DoubleSide;
  mat.transparent = false;
  mat.alphaHash = false;
  mat.forceSinglePass = true;
  mat.depthTest = true;
  mat.depthWrite = true;
  return mat;
}

function settingsFor(
  tier: GfxTier,
  hints?: Partial<Pick<GfxRuntimeHints, 'search' | 'graphicsPreset' | 'terrainDetail' | 'foliageDensity' | 'effectsQuality' | 'shadowQuality' | 'gpuRenderer' | 'maxTouchPoints' | 'coarsePointer' | 'narrowViewport' | 'deviceMemory'>>,
): GfxSettings {
  const bucketBands = GFX_BUCKET_BANDS[tier];
  const weakIntegratedGpu = isWeakIntegratedGpu(hints?.gpuRenderer);
  // Same touch+coarse/narrow signal isConstrainedBrowser uses: phone-class devices get
  // tighter pixel caps below. A 1080x2400 panel at DPR 3 is ~2.6M CSS-to-device pixels;
  // no phone GPU we target should shade more than ~1M of them (Krunker ships a 0.6
  // default render scale on DESKTOP; RuneScape mobile exposes render scaling as one of
  // its three core knobs).
  const mobileHints =
    (hints?.maxTouchPoints ?? 0) > 0 && ((hints?.coarsePointer ?? false) || (hints?.narrowViewport ?? false));
  let settings: GfxSettings = {
    graphicsConfigVersion: GFX_CONFIG_VERSION,
    tier,
    bucketBands,
    bucketBaselines: bucketBaselines(bucketBands),
    budget: GFX_BUDGETS[tier],
    autoGovernor: shouldUseAutoGovernor(tier, hints?.search ?? ''),
    composer: tier === 'high' || tier === 'ultra',
    // N8AO runs on both composer tiers: half-res + Low quality on high keeps
    // it ~1ms-class on real GPUs; ultra gets full-res Medium
    ao: tier === 'high' || tier === 'ultra',
    msaaSamples: tier === 'high' || tier === 'ultra' ? 4 : 0,
    pixelRatioCap: mobileHints
      ? tier === 'low' ? 1.2 : tier === 'medium' ? 1.4 : tier === 'high' ? 1.6 : 2.0
      : tier === 'low' ? 1.48 : tier === 'medium' ? 1.48 : tier === 'high' ? 1.75 : 2.5,
    shadowMap: tier === 'low' ? 2048 : tier === 'medium' ? 2560 : 4096,
    standardMaterials: tier === 'medium' || tier === 'high' || tier === 'ultra',
    lowPlus: tier === 'low',
    leanFoliage: tier === 'low' || (tier === 'medium' && weakIntegratedGpu),
    // Phone low tier: no grass ring at all. It is a DoubleSide alpha-tested instanced
    // field, the single worst overdraw source on a mobile tiler GPU, and the games that
    // hold 30fps on budget Androids ship without one.
    grassRadius: mobileHints && tier === 'low' ? 0 : tier === 'low' ? 80 : tier === 'medium' ? 76 : 82,
    grassStep: tier === 'low' ? 2.05 : tier === 'medium' ? 2.0 : 1.8,
    terrainSplat: tier === 'medium' || tier === 'high' || tier === 'ultra',
    windSway: true,
    maxPointLights: mobileHints && tier === 'low' ? 3 : 6,
    anisotropy: tier === 'low' ? 1 : tier === 'medium' ? 2 : 8,
    singleIbl: tier === 'low' || tier === 'medium',
    // Grounding shadows for the tier that has no shadow map: a shared radial-gradient
    // disc per character (one material, near-zero cost) so characters do not float.
    blobShadows: tier === 'low',
    vfxPoolSize: mobileHints ? 512 : 4096,
    nameplateMax: mobileHints ? 8 : 0,
    hudThrottled: mobileHints,
  };
  if (hints?.graphicsPreset === PRESET_ADVANCED) {
    if ((hints.terrainDetail ?? 1) < 0.5) settings = { ...settings, terrainSplat: false };
    if ((hints.foliageDensity ?? 1) < 0.5) settings = { ...settings, grassRadius: 34, grassStep: 3.8 };
    if ((hints.effectsQuality ?? 1) < 0.5) settings = { ...settings, composer: false, ao: false, msaaSamples: 0, maxPointLights: 3 };
    if ((hints.shadowQuality ?? 1) < 0.5) settings = { ...settings, shadowMap: 1024 };
  }
  return settings;
}

export function forcedTierFromSearch(search: string): GfxTier | null {
  const params = new URLSearchParams(search);
  if (params.has('lowgfx')) return 'low';
  const g = params.get('gfx');
  return g === 'low' || g === 'medium' || g === 'high' || g === 'ultra' ? g : null;
}

function storedNumericSetting(key: string): number | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = JSON.parse(localStorage.getItem('woc_settings') ?? 'null') as Record<string, unknown> | null;
    const value = raw && typeof raw === 'object' ? raw[key] : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

// Corroborating-signal thresholds for resolveDefaultGraphicsPreset. Chromium clamps
// navigator.deviceMemory to a max of 8 (GiB) and WebKit caps hardwareConcurrency at 8 on
// macOS, so 8 is the practical "ample" ceiling on both axes; these only ever RAISE a tier or
// break a tie, never demote (see resolveDefaultGraphicsPreset).
const AMPLE_DEVICE_MEMORY_GIB = 8;
const AMPLE_LOGICAL_CORES = 8;

// The session's GPU renderer string never changes, so probe it at most once and
// release the throwaway context immediately. runtimeHints() is called several
// times during boot (the module-load GFX best-guess, firstRunGraphicsPreset, and
// initGfxTier), and a fresh canvas context per call would ORPHAN one WebGL context
// each: browsers cap live contexts near 16, and exhausting them is exactly what
// starved the world models before the PR901 release-on-teardown fix. One probe,
// one context, lost the moment its renderer string is read, cached thereafter.
let gpuRendererProbed = false;
let probedGpuRenderer: string | undefined;

function probeGpuRenderer(): string | undefined {
  if (gpuRendererProbed) return probedGpuRenderer;
  gpuRendererProbed = true;
  probedGpuRenderer = readGpuRendererString();
  return probedGpuRenderer;
}

function readGpuRendererString(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return undefined;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return undefined;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Tier explicitly requested via URL, or null when it should be auto-detected. */
export function urlForcedTier(): GfxTier | null {
  if (typeof location === 'undefined') return null;
  return forcedTierFromSearch(location.search);
}

function runtimeHints(): GfxRuntimeHints {
  const nav = typeof navigator !== 'undefined'
    ? navigator as Navigator & { deviceMemory?: number }
    : null;
  return {
    search: typeof location !== 'undefined' ? location.search : '',
    deviceMemory: nav?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    coarsePointer: typeof matchMedia !== 'undefined' ? matchMedia('(pointer: coarse)').matches : false,
    narrowViewport: typeof matchMedia !== 'undefined'
      ? (matchMedia('(max-width: 940px)').matches || matchMedia('(max-height: 760px)').matches)
      : false,
    gpuRenderer: probeGpuRenderer(),
    graphicsPreset: storedNumericSetting('graphicsPreset'),
    terrainDetail: storedNumericSetting('terrainDetail'),
    foliageDensity: storedNumericSetting('foliageDensity'),
    effectsQuality: storedNumericSetting('effectsQuality'),
    shadowQuality: storedNumericSetting('shadowQuality'),
  };
}

export function isConstrainedBrowser(hints: GfxRuntimeHints): boolean {
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) return true;
  return hints.maxTouchPoints > 0 && (hints.coarsePointer || hints.narrowViewport);
}

/**
 * Coarse GPU class from the UNMASKED_RENDERER_WEBGL string, the single most reliable static
 * capability signal (RAM/cores are only weak tie-breakers, see resolveDefaultGraphicsPreset).
 * Conservative on purpose: a masked/unplaced name returns 'unknown' so the resolver falls back
 * to MEDIUM rather than guessing. Mirrors the detect-gpu name->class model (pmndrs/detect-gpu,
 * which reads UNMASKED_RENDERER_WEBGL and looks it up in an fps-per-GPU blob; we drop the blob
 * and bucket by family) plus the mobile-GPU generation ladders (Adreno 3xx-4xx/Mali-T weak ->
 * 5xx-6xx mid -> 7xx/8xx flagship; Apple A rises A14+). Test order matters: software first, then
 * the codebase's named weak-integrated parts, then strong/flagship, then mid, then old/low.
 */
export type GpuClass =
  | 'software'
  | 'strongDesktop'
  | 'flagshipMobile'
  | 'midIntegrated'
  | 'midMobile'
  | 'weak'
  | 'unknown';

export function classifyGpuRenderer(name: string | undefined): GpuClass {
  const n = (name ?? '').toLowerCase();
  if (!n) return 'unknown';
  // Software rasterizers (no real GPU): always the lowest tier. The bare "software" token is kept
  // in lockstep with isSoftwareGL below so the two software detectors never disagree.
  if (/swiftshader|llvmpipe|basic render|softpipe|microsoft basic|software/.test(n)) return 'software';
  // The older Intel integrated parts the codebase already names as weak (kept AHEAD of the
  // mid-integrated bucket so an Iris Plus 6xx / UHD 6xx / HD 5xx-6xx stays weak, consistent with
  // the existing leanFoliage treatment in settingsFor).
  if (isWeakIntegratedGpu(name)) return 'weak';
  // Strong desktop discrete + Apple Silicon.
  if (/\b(rtx|gtx)\b|geforce|radeon(\(tm\))?\s?(rx|pro|vii)|\barc\b|\bnvidia\b|apple\s?m[1-9]/.test(n))
    return 'strongDesktop';
  // Recent flagship mobile.
  if (
    /apple a(1[4-9]|[2-9]\d)|adreno \(tm\) (6[6-9]\d|7\d\d|8\d\d)|immortalis|mali-g7\d\d|xclipse/.test(n)
  )
    return 'flagshipMobile';
  // Mid integrated (newer Intel Xe / AMD Vega-and-RDNA iGPUs / modern desktop UHD 7xx). The
  // `radeon(\(tm\))? ?` form matches Chrome's ANGLE strings and Mesa form; strongDesktop already
  // claimed the discrete RX/Pro/VII families, so this only catches integrated Radeons.
  if (/iris xe|iris plus|radeon(\(tm\))? ?(vega|graphics)|uhd graphics 7\d\d|intel.*xe/.test(n))
    return 'midIntegrated';
  // Mid mobile. The Mali clause excludes G50-G52 (entry-level Valhall parts the weak ladder
  // below claims) so they fall through to LOW; G53+ stay mid. The Adreno clause excludes
  // the 60x/61x budget family (SD 439-750: Adreno 605-619, the dominant Brazilian budget
  // fleet), which the weak ladder below claims; 62x+ stay mid.
  if (
    /apple a1[1-3]|adreno \(tm\) (5\d\d|6[2-5]\d)|mali-g(5[3-9]|6\d|7[0-8])|powervr (gt|gm|b)/.test(n)
  )
    return 'midMobile';
  // Old / low mobile + old integrated. PowerVR Rogue GE8xxx (Helio A22/G35 phones) was
  // previously unmatched and fell through to unknown -> medium, a desktop-PBR profile on
  // a 2-3GB phone.
  if (
    /adreno \(tm\) [34]\d\d|adreno \(tm\) 6[01]\d|mali-t|mali-4\d\d|mali-g(31|51|52)\b|powervr (sgx|g6|ge|rogue)|apple a([5-9]|10)\b|(hd|uhd) graphics (\d{3}\b|[45]\d{2})|intel.*gma/.test(n)
  )
    return 'weak';
  return 'unknown';
}

/**
 * The device-appropriate graphics preset (1 low .. 4 ultra) for a player who has NOT chosen one.
 * MEDIUM (2) is the deliberate fallback whenever the signals are inconclusive. Pure function of
 * static device hints only; reads NO FPS governor and runs ONCE on first boot.
 * CRITICAL: deviceMemory + hardwareConcurrency may only RAISE a tier or break a tie, NEVER
 * pull one down. Safari caps hardwareConcurrency (2 on iOS) and omits deviceMemory entirely,
 * so a flagship iPhone reports cores=2 / mem=undefined: a low-count down-rank would wrongly
 * bucket it low. The recognized GPU class sets the floor; a masked/unknown name lands on MEDIUM.
 */
export function resolveDefaultGraphicsPreset(hints: GfxRuntimeHints): number {
  const gpu = classifyGpuRenderer(hints.gpuRenderer);
  const mem = hints.deviceMemory;
  const cores = hints.hardwareConcurrency;
  const isMobile = hints.maxTouchPoints > 0 && (hints.coarsePointer || hints.narrowViewport);
  const ampleOrUnknownMem =
    mem === undefined ||
    mem >= AMPLE_DEVICE_MEMORY_GIB ||
    (cores !== undefined && cores >= AMPLE_LOGICAL_CORES);

  if (gpu === 'software' || gpu === 'weak') return PRESET_LOW;
  if (gpu === 'strongDesktop' && !isMobile)
    return ampleOrUnknownMem ? PRESET_ULTRA : PRESET_HIGH;
  // PHONES: the baseline is LOW, not medium. Our medium is a desktop PBR profile
  // (IBL + PCFSoft shadow maps + splat terrain) that budget phone GPUs cannot hold at
  // 30fps; the games that run well on phones (AQ3D, Hordes, Albion mobile) all treat
  // the weak-Android tier as the design baseline and scale UP from it. A recognized
  // flagship gets medium; everything else mobile gets low, and a phone reporting <=4GB
  // is demoted regardless of its GPU class (deviceMemory is clamped to 8 by Chromium,
  // and iOS omits it entirely, so this only ever fires on real low-RAM Androids).
  if (isMobile) {
    if (mem !== undefined && mem <= 4) return PRESET_LOW;
    if (gpu === 'flagshipMobile' || gpu === 'strongDesktop') return PRESET_MEDIUM;
    return PRESET_LOW;
  }
  if (gpu === 'midIntegrated' || gpu === 'midMobile') return PRESET_MEDIUM;
  if (
    gpu === 'unknown' &&
    mem !== undefined &&
    mem >= AMPLE_DEVICE_MEMORY_GIB &&
    cores !== undefined &&
    cores >= AMPLE_LOGICAL_CORES
  )
    return PRESET_HIGH;
  return PRESET_MEDIUM;
}

/**
 * The device-aware preset to persist on a player's FIRST run, or null when no default should be
 * written. The caller passes a dedicated `defaultAlreadyApplied` marker rather than checking
 * graphicsPreset presence, because Settings.save() persists the whole values object the first
 * time ANY unrelated setting is stored, defeating a key-presence check.
 * A masked/inconclusive device resolves to MEDIUM and returns null so it re-detects on later boots.
 */
export function firstRunGraphicsPreset(defaultAlreadyApplied: boolean): number | null {
  if (defaultAlreadyApplied) return null;
  const detected = resolveDefaultGraphicsPreset(runtimeHints());
  return detected === PRESET_MEDIUM ? null : detected;
}

function tierFromPreset(preset: number): GfxTier {
  switch (Math.round(preset)) {
    case PRESET_LOW: return 'low';
    case PRESET_MEDIUM: return 'medium';
    case PRESET_HIGH: return 'high';
    case PRESET_ULTRA: return 'ultra';
    case PRESET_ADVANCED: return 'high';
  }
  return 'low';
}

export function tierFromHints(hints: GfxRuntimeHints, softwareGl: boolean): GfxTier {
  const forced = forcedTierFromSearch(hints.search);
  if (forced) return forced;
  // Software GL (SwiftShader in a blocklisted WebView, llvmpipe in a VM) outranks even an
  // explicit preset: no persisted choice makes a software rasterizer able to run medium+,
  // and the preset check used to come first, which let phones whose WebView fell back to
  // software render a persisted tier at DPR-capped resolution entirely on the CPU. The
  // URL force above stays authoritative for headless screenshot verification.
  if (softwareGl) return tierFromPreset(PRESET_LOW);
  // An explicit Options choice is authoritative on every real GPU.
  if (hints.graphicsPreset !== undefined) return tierFromPreset(hints.graphicsPreset);
  return tierFromPreset(resolveDefaultGraphicsPreset(hints));
}

// Bumped whenever the tier ladder above changes enough that previously-persisted
// DEFAULTS are wrong (the June 2026 window even persisted ultra as the default on
// phones). Settings.save() def-fills graphicsPreset the first time ANY setting is
// stored, so almost every install carries a persisted preset the player never chose;
// main.ts re-detects those on boot when its stored migration marker is behind this,
// and leaves anyone whose graphicsPresetChosen flag proves a deliberate Options pick.
export const GFX_MIGRATION_VERSION = 1;

export function migratedGraphicsPreset(
  migrationApplied: number,
  presetChosen: boolean,
): number | null {
  if (presetChosen) return null;
  if (migrationApplied >= GFX_MIGRATION_VERSION) return null;
  return resolveDefaultGraphicsPreset(runtimeHints());
}

// Software GL (SwiftShader/llvmpipe — headless test runners, VMs) can't take
// the full pipeline at speed; drop to the lowgfx path automatically unless the
// URL forces a tier.
function rendererName(webgl: THREE.WebGLRenderer): string {
  try {
    const gl = webgl.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return '';
  }
}

export function isSoftwareGL(webgl: THREE.WebGLRenderer): boolean {
  return /swiftshader|llvmpipe|software/i.test(rendererName(webgl));
}

export function isWeakIntegratedGpu(name: string | undefined): boolean {
  const n = name ?? '';
  return /intel/i.test(n) && /(iris\(tm\) plus graphics 6|iris plus graphics 6|uhd graphics 6|hd graphics 5|hd graphics 6)/i.test(n);
}

// Best-guess settings from the URL alone (so module-load consumers see sane
// values); initGfxTier() re-resolves once the GL context exists. The renderer
// MUST call initGfxTier() right after creating its WebGLRenderer and before
// building any scene content.
export let GFX: GfxSettings = settingsFor(tierFromHints(runtimeHints(), false), runtimeHints());

export function initGfxTier(webgl: THREE.WebGLRenderer): GfxTier {
  const hints = { ...runtimeHints(), gpuRenderer: rendererName(webgl) };
  const tier = tierFromHints(hints, isSoftwareGL(webgl));
  GFX = settingsFor(tier, hints);
  return tier;
}

export const gfxInternalsForTest = {
  settingsFor,
  probeGpuRenderer,
  resetGpuRendererProbe: () => {
    gpuRendererProbed = false;
    probedGpuRenderer = undefined;
  },
};

// One clock uniform shared by every onBeforeCompile shader (wind, water,
// grade grain). The renderer ticks it once per frame in sync(). uRimBoost
// scales the character rim glow (raised inside dungeons so silhouettes
// separate from the murk).
export const sharedUniforms = {
  uTime: { value: 0 },
  uRimBoost: { value: 1 },
};

// The one sun. Everything that needs the sun's position/direction (key light,
// shadow frustum offset, sky glow lobe, water glints, god rays) reads these —
// editing one consumer used to silently desync the others.
export const SUN_ANCHOR = new THREE.Vector3(90, 140, 50);
export const SUN_DIR = SUN_ANCHOR.clone().normalize();

export interface SurfaceMatOpts {
  color?: number;
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  /** PBR roughness map (high/ultra only; ignored on the Lambert tier) */
  roughnessMap?: THREE.Texture;
  /** baked AO map — needs uv2 on the geometry (high/ultra only) */
  aoMap?: THREE.Texture;
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  side?: THREE.Side;
  /** subtle cool fresnel rim glow — sells silhouettes against dark ground */
  rim?: boolean;
}

// Shared fresnel rim emissive for character rigs (high/ultra only; Lambert on
// low has no per-fragment view vector worth paying for). uRimBoost lets the
// renderer crank the rim inside dungeons.
export function addRimGlow(mat: THREE.Material): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimBoost = sharedUniforms.uRimBoost;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform float uRimBoost;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.5, 0.6, 0.8) * 0.12 * uRimBoost *
        pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);`,
      );
  };
}

// Material factory: dedupes by (color|maps|flags) so hundreds of small box
// meshes share a few dozen programs/uniform sets. Standard on high/ultra,
// Lambert on low.
const matCache = new Map<string, THREE.Material>();

export function surfaceMat(opts: SurfaceMatOpts): THREE.Material {
  const key = JSON.stringify({
    ...opts,
    map: opts.map?.uuid,
    normalMap: opts.normalMap?.uuid,
    roughnessMap: opts.roughnessMap?.uuid,
    aoMap: opts.aoMap?.uuid,
    std: GFX.standardMaterials,
  });
  const cached = matCache.get(key);
  if (cached) return cached;
  const mat = GFX.standardMaterials
    ? new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      normalMap: opts.normalMap ?? null,
      roughnessMap: opts.roughnessMap ?? null,
      aoMap: opts.aoMap ?? null,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      flatShading: opts.flatShading ?? false,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    })
    : new THREE.MeshLambertMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map ?? null,
      flatShading: opts.flatShading ?? false,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
  if (opts.rim && GFX.standardMaterials) addRimGlow(mat);
  matCache.set(key, mat);
  return mat;
}
