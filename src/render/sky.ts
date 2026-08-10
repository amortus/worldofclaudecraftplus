import * as THREE from 'three';
import { columnBlendAt, COLUMN_ZONES, STRIP_ZONES, WORLD_MAX_Z, WORLD_MIN_Z } from '../sim/data';
import type { BiomeId } from '../sim/types';
import { loadHdr, loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';
import { cloudTexture, skyTexture } from './textures';

// HDRI sky dome + cloud sprites.
//
// High tier: the dome fragment shader samples real Poly Haven equirect HDRIs
// (one per biome) by view direction, cross-fading two maps across the same
// zone-boundary windows the terrain palette uses. Each HDRI's sample is
// rotated in azimuth so its real sun sits at SUN_ANCHOR's azimuth — the one
// canonical sun that shadows, god rays and water glints all share. Procedural
// warm sun-glow lobes stay layered on top so the anchor direction always
// carries the glow even where the HDRI sun's elevation differs.
//
// The dome rides with the camera (the renderer sets its position every
// frame) and exposes the raw equirects for PMREM IBL (see envTexture below
// and docs/design/lookdev-hookup.md).
//
// Low tier keeps the legacy 4x256 canvas-gradient dome.

const DOME_RADIUS = 560;

// The photographic HDRIs run hot next to the old procedural dome (sky bands
// 0.5-2.5 radiance, sun texels ~60000): unscaled they shove most of the sky
// past the 0.85 bloom threshold and the whole frame hazes out. Per-biome
// gain brings the open sky back under the bloom economy; the clamp leaves
// just enough headroom for the sun region to bloom like the old glow lobes
// did. The dawn HDRI carries a huge horizon-level sun glow, so the peaks get
// reined in harder or half the sky white-outs. The renderer's PMREM capture
// samples the same shader, so IBL stays in step.
// Upstream ships one project-generated HDRI per realm; we do not take that art
// (an AAB-size decision of its own), so every new biome REUSES one of the three
// skies already on disk, picked by mood, and its gain/clamp does the grading:
//   vale_day       bright blue day  -> fen, jungle, garden
//   marsh_overcast flat grey murk   -> ember, night, haunt (and blight already)
//   peaks_dawn     cold low sun     -> dusk, frost, amber, gale
// A biome's HDRI_SUN_U row MUST match the file it reuses, or the dome rotates
// the wrong sun onto SUN_ANCHOR.
const HDRI_TUNE: Record<BiomeId, { gain: number; clamp: number }> = {
  vale: { gain: 0.6, clamp: 2.6 },
  marsh: { gain: 0.6, clamp: 2.2 },
  peaks: { gain: 0.48, clamp: 1.7 },
  blight: { gain: 0.34, clamp: 1.6 },
  dusk: { gain: 0.42, clamp: 1.6 }, // permanent rose-mauve dusk, dimmer than dawn
  ember: { gain: 0.44, clamp: 1.8 }, // storm-dark over the scorched waste
  frost: { gain: 0.52, clamp: 1.9 }, // cold, bright, low-contrast snow light
  amber: { gain: 0.55, clamp: 2.0 }, // rich late-afternoon gold
  fen: { gain: 0.6, clamp: 2.6 }, // clear airy morning
  night: { gain: 0.3, clamp: 1.5 }, // the darkest sky in the world
  haunt: { gain: 0.34, clamp: 1.6 }, // dead grey gloom
  jungle: { gain: 0.62, clamp: 2.6 }, // bright humid tropical day
  garden: { gain: 0.6, clamp: 2.6 }, // crystal parkland day
  gale: { gain: 0.5, clamp: 1.9 }, // scrubbed dawn-lit salt air
};

const BIOME_HDRI_2K: Record<BiomeId, string> = {
  vale: '/env/vale_day_2k.hdr',
  marsh: '/env/marsh_overcast_2k.hdr',
  peaks: '/env/peaks_dawn_2k.hdr',
  blight: '/env/marsh_overcast_2k.hdr',
  dusk: '/env/peaks_dawn_2k.hdr',
  ember: '/env/marsh_overcast_2k.hdr',
  frost: '/env/peaks_dawn_2k.hdr',
  amber: '/env/peaks_dawn_2k.hdr',
  fen: '/env/vale_day_2k.hdr',
  night: '/env/marsh_overcast_2k.hdr',
  haunt: '/env/marsh_overcast_2k.hdr',
  jungle: '/env/vale_day_2k.hdr',
  garden: '/env/vale_day_2k.hdr',
  gale: '/env/peaks_dawn_2k.hdr',
};

const BIOME_HDRI_1K: Record<BiomeId, string> = {
  vale: '/env/vale_day_1k.hdr',
  marsh: '/env/marsh_overcast_1k.hdr',
  peaks: '/env/peaks_dawn_1k.hdr',
  blight: '/env/marsh_overcast_1k.hdr',
  dusk: '/env/peaks_dawn_1k.hdr',
  ember: '/env/marsh_overcast_1k.hdr',
  frost: '/env/peaks_dawn_1k.hdr',
  amber: '/env/peaks_dawn_1k.hdr',
  fen: '/env/vale_day_1k.hdr',
  night: '/env/marsh_overcast_1k.hdr',
  haunt: '/env/marsh_overcast_1k.hdr',
  jungle: '/env/vale_day_1k.hdr',
  garden: '/env/vale_day_1k.hdr',
  gale: '/env/peaks_dawn_1k.hdr',
};

function shouldUseLiteHdri(): boolean {
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search);
    const forced = params.get('gfx');
    if (params.has('lowgfx') || forced === 'low') return true;
    if (forced === 'high' || forced === 'ultra') return false;
  }
  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return true;
    if (nav.maxTouchPoints > 0 && typeof matchMedia !== 'undefined') {
      if (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 900px)').matches) return true;
    }
  }
  return false;
}

const BIOME_HDRI = shouldUseLiteHdri() ? BIOME_HDRI_1K : BIOME_HDRI_2K;

// Painted horizon panoramas, reused on the same rule as the HDRIs: a biome
// ringed by mountains takes the peaks panorama, an open-country biome the
// vale's, a murky one the marsh's.
const BIOME_BACKDROP_8K: Record<BiomeId, string> = {
  vale: '/env/vale_backdrop.webp',
  marsh: '/env/marsh_backdrop.webp',
  peaks: '/env/peaks_backdrop.webp',
  blight: '/env/marsh_backdrop.webp',
  dusk: '/env/peaks_backdrop.webp',
  ember: '/env/peaks_backdrop.webp',
  frost: '/env/peaks_backdrop.webp',
  amber: '/env/peaks_backdrop.webp',
  fen: '/env/vale_backdrop.webp',
  night: '/env/marsh_backdrop.webp',
  haunt: '/env/marsh_backdrop.webp',
  jungle: '/env/vale_backdrop.webp',
  garden: '/env/vale_backdrop.webp',
  gale: '/env/peaks_backdrop.webp',
};

const BIOME_BACKDROP_4K: Record<BiomeId, string> = {
  vale: '/env/vale_backdrop_4k.webp',
  marsh: '/env/marsh_backdrop_4k.webp',
  peaks: '/env/peaks_backdrop_4k.webp',
  blight: '/env/marsh_backdrop_4k.webp',
  dusk: '/env/peaks_backdrop_4k.webp',
  ember: '/env/peaks_backdrop_4k.webp',
  frost: '/env/peaks_backdrop_4k.webp',
  amber: '/env/peaks_backdrop_4k.webp',
  fen: '/env/vale_backdrop_4k.webp',
  night: '/env/marsh_backdrop_4k.webp',
  haunt: '/env/marsh_backdrop_4k.webp',
  jungle: '/env/vale_backdrop_4k.webp',
  garden: '/env/vale_backdrop_4k.webp',
  gale: '/env/peaks_backdrop_4k.webp',
};

const BACKDROP_Y_BIAS: Record<BiomeId, number> = {
  vale: 0,
  marsh: 0,
  peaks: 0,
  blight: 0,
  dusk: 0,
  ember: 0,
  frost: 0,
  amber: 0,
  fen: 0,
  night: 0,
  haunt: 0,
  jungle: 0,
  garden: 0,
  gale: 0,
};

interface NetworkInformationLike {
  readonly effectiveType?: string;
  readonly saveData?: boolean;
}

type NavigatorWithBackdropHints = Navigator & {
  readonly connection?: NetworkInformationLike;
  readonly deviceMemory?: number;
  readonly mozConnection?: NetworkInformationLike;
  readonly webkitConnection?: NetworkInformationLike;
};

/** Typed read of the Save-Data client hint (the user asked to conserve data). */
export function navigatorSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorWithBackdropHints;
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  return !!connection?.saveData;
}

function shouldUseLiteBackdrop(): boolean {
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search);
    const forced = params.get('backdrop') ?? params.get('skybox');
    if (forced === '4k' || forced === 'lite') return true;
    // 8K only when explicitly requested or ultra gfx — default is 4K
    if (forced === '8k' || forced === 'high' || params.get('gfx') === 'ultra') return false;
  }
  if (typeof navigator !== 'undefined') {
    const nav = navigator as NavigatorWithBackdropHints;
    const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
    if (connection?.saveData) return true;
    if (connection?.effectiveType && ['slow-2g', '2g', '3g'].includes(connection.effectiveType)) return true;
    if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return true;
    if (nav.maxTouchPoints > 0 && typeof matchMedia !== 'undefined') {
      if (matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 900px)').matches) return true;
    }
  }
  // Default to 4K — 8K requires explicit opt-in (?backdrop=8k or ?gfx=ultra)
  return true;
}

const BIOME_BACKDROP = shouldUseLiteBackdrop() ? BIOME_BACKDROP_4K : BIOME_BACKDROP_8K;

// Measured brightest-texel u (sun azimuth in equirect space) per HDRI — see
// tmp/analyze_hdr.mjs. Used to rotate each map so its sun matches SUN_ANCHOR.
// One row per biome, but only three distinct values: a reused HDRI keeps the
// sun u of the file it reuses (see BIOME_HDRI_2K above).
const HDRI_SUN_U: Record<BiomeId, number> = {
  vale: 0.595, marsh: 0.657, peaks: 0.631, blight: 0.657,
  dusk: 0.631, // peaks_dawn
  ember: 0.657, // marsh_overcast
  frost: 0.631, // peaks_dawn
  amber: 0.631, // peaks_dawn
  fen: 0.595, // vale_day
  night: 0.657, // marsh_overcast
  haunt: 0.657, // marsh_overcast
  jungle: 0.595, // vale_day
  garden: 0.595, // vale_day
  gale: 0.631, // peaks_dawn
};

const hdriStore: Partial<Record<BiomeId, THREE.DataTexture>> = {};
const backdropStore: Partial<Record<BiomeId, THREE.Texture>> = {};
// 2K HDRs are ~17MB on disk; 1K is ~4MB. Pick the lighter set for phone /
// low-memory browser sessions before preload starts, and skip entirely when
// the URL already forces the gradient-dome tier. An auto-detected software-GL
// low tier can only be known after WebGL context creation, which happens after
// preload, so this best-effort device gate keeps mobile out of the worst path.
// Grouped BY URL, not by biome: fourteen biomes share three HDRIs and three
// backdrops, and the loader caches per URL anyway, so a per-biome loop would
// register eleven redundant entries with the preload gate (which counts them
// for the loading bar) for files already in flight. Each unique file is loaded
// once and its resolved texture fanned out to every biome that reuses it, so
// nothing extra is fetched, decoded or held on the GPU.
function byUrl(table: Record<BiomeId, string>): Map<string, BiomeId[]> {
  const out = new Map<string, BiomeId[]>();
  for (const biome of Object.keys(table) as BiomeId[]) {
    const url = table[biome];
    const list = out.get(url);
    if (list) list.push(biome);
    else out.set(url, [biome]);
  }
  return out;
}

if (GFX.standardMaterials) {
  for (const [url, biomes] of byUrl(BIOME_HDRI)) {
    registerPreload(loadHdr(url).then((tex) => {
      tex.wrapS = THREE.RepeatWrapping; // azimuth rotation needs u to wrap
      for (const biome of biomes) hdriStore[biome] = tex;
      return tex;
    }));
  }
  for (const [url, biomes] of byUrl(BIOME_BACKDROP)) {
    registerPreload(loadTexture(url, { srgb: true }).then((tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      // Phone render profile: a mip chain adds a third on top of each decoded 4K
      // backdrop, and three biomes are resident at once; the dome is mostly
      // magnified at phone resolutions, so trading mips for slight distant-sky
      // shimmer keeps ~44MB of GPU memory out of the world-entry allocation spike.
      const mips = !GFX.mobileProfile;
      tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = mips;
      for (const biome of biomes) backdropStore[biome] = tex;
      return tex;
    }).catch(() => undefined));
  }
}

export function hasSkyHdriAssets(): boolean {
  return Boolean(hdriStore.vale && hdriStore.marsh && hdriStore.peaks);
}

export function hasBackdropAssets(): boolean {
  return Boolean(backdropStore.vale && backdropStore.marsh && backdropStore.peaks);
}

export interface SkyView {
  dome: THREE.Mesh;
  /** cross-fades the HDRI pair toward the biome the camera is over */
  setCameraPos(x: number, z: number, dt: number): void;
  /** Raw equirect HDR (unclamped) for PMREM IBL; null on the low tier. */
  envTexture(biome: BiomeId): THREE.DataTexture | null;
  /** scene.environmentRotation.y that aligns the IBL sun with the dome's */
  envRotationY(biome: BiomeId): number;
  /** biome cross-fade state at a camera position (from -> to by t in [0,1]) */
  biomeAt(x: number, z: number): BiomeBlend;
}

export interface BiomeBlend {
  from: BiomeId;
  to: BiomeId;
  t: number;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position; // dome is camera-centred; object space = view direction
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform sampler2D uSkyA;
  uniform sampler2D uSkyB;
  uniform float uMix;
  uniform float uOffA; // equirect u offset aligning the HDRI sun azimuth
  uniform float uOffB;
  uniform vec2 uTuneA; // x: radiance gain, y: clamp (bloom economy)
  uniform vec2 uTuneB;
  uniform vec3 uSunDir;
  uniform sampler2D uBackdropA;
  uniform sampler2D uBackdropB;
  uniform float uBackdropStrength;
  uniform float uBackdropBiasA;
  uniform float uBackdropBiasB;
  varying vec3 vDir;

  vec3 sampleSky(sampler2D map, vec3 dir, float uOff, vec2 tune) {
    vec2 uv = vec2(
      atan(dir.z, dir.x) * 0.15915494 + 0.5 + uOff,
      asin(clamp(dir.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    return min(texture2D(map, uv).rgb * tune.x, vec3(tune.y));
  }

  float hash12(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  vec3 sampleBackdrop(sampler2D map, vec3 dir, float yBias) {
    float flatLen = max(length(dir.xz), 0.08);
    vec2 flatDir = dir.xz / flatLen;
    float u = atan(flatDir.y, flatDir.x) * 0.15915494 + 0.5;
    float h = dir.y / flatLen;
    float v = clamp(0.36 + h * 0.32 + yBias, 0.0, 1.0);
    vec3 col = texture2D(map, vec2(u, v)).rgb;
    float skyMask = smoothstep(0.54, 0.9, v);
    float brush = noise2(vec2(u * 22.0, v * 9.0)) * 0.55
      + noise2(vec2(u * 47.0 + 11.0, v * 18.0 + 3.0)) * 0.45;
    float cloudLift = smoothstep(0.58, 0.92, brush) * skyMask * 0.08;
    col += (brush - 0.5) * skyMask * 0.045;
    col = mix(col, col + vec3(0.09, 0.085, 0.075), cloudLift);
    return col;
  }

  void main() {
    vec3 dir = normalize(vDir);
    vec3 c = mix(sampleSky(uSkyA, dir, uOffA, uTuneA), sampleSky(uSkyB, dir, uOffB, uTuneB), uMix);
    vec3 backA = sampleBackdrop(uBackdropA, dir, uBackdropBiasA);
    vec3 backB = sampleBackdrop(uBackdropB, dir, uBackdropBiasB);
    vec3 backdrop = mix(backA, backB, uMix);
    c = mix(c, backdrop, uBackdropStrength);
    float sunAmt = pow(max(dot(dir, uSunDir), 0.0), 8.0);
    c += vec3(1.0, 0.85, 0.6) * sunAmt * 0.3;                        // warm glow around the anchor sun
    float sunCore = pow(max(dot(dir, uSunDir), 0.0), 90.0);
    c += vec3(1.0, 0.92, 0.75) * sunCore * 0.5;                      // tighter bright core
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Cross-fade state across the same ±30/35u zone windows the terrain palette
// uses, keyed by camera z. Boundaries are sequential, so two maps suffice.
// Walks STRIP_ZONES, not ZONES: this is a north-south band cascade, and the
// grid's column zones are appended after the bands and share the vale's z band,
// so walking ZONES would cross-fade the northmost band's sky into a column's
// biome (see STRIP_ZONES in sim/data).
function biomeBlendAt(x: number, z: number): BiomeBlend {
  let from: BiomeId = STRIP_ZONES[0].biome;
  let to: BiomeId = STRIP_ZONES[0].biome;
  let t = 0;
  for (let i = 0; i + 1 < STRIP_ZONES.length; i++) {
    const b = STRIP_ZONES[i].zMax;
    const raw = Math.max(0, Math.min(1, (z - (b - 30)) / 65));
    const tt = raw * raw * (3 - 2 * raw);
    if (tt <= 0) break;
    if (tt >= 1) {
      from = STRIP_ZONES[i + 1].biome;
      to = from;
      t = 0;
    } else {
      to = STRIP_ZONES[i + 1].biome;
      t = tt;
    }
  }
  // ...then sideways, across `columnBlendAt`'s window, exactly as the ground
  // palette and the heightfield's shape blend do. Without this a column zone
  // keeps the sky of whichever band it shares a z with, so its biome could
  // never show overhead. The band mix is collapsed to whichever side already
  // dominates before the column takes over as the `to` end, because the dome
  // only cross-fades two maps.
  for (let i = 0; i < COLUMN_ZONES.length; i++) {
    const w = columnBlendAt(COLUMN_ZONES[i], x, z);
    if (w <= 0) continue;
    from = t < 0.5 ? from : to;
    to = COLUMN_ZONES[i].biome;
    t = w;
  }
  return { from, to, t };
}

// u offset that moves a given HDRI's sun azimuth onto SUN_ANCHOR's azimuth
function sunOffsetU(biome: BiomeId, sunDir: THREE.Vector3): number {
  const sunU = Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5;
  return HDRI_SUN_U[biome] - sunU;
}

export function buildSky(lowGfx: boolean, sunDir: THREE.Vector3): SkyView {
  if (lowGfx || !hasSkyHdriAssets()) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    dome.renderOrder = -10;
    return {
      dome,
      setCameraPos: () => {},
      envTexture: () => null,
      envRotationY: () => 0,
      biomeAt: biomeBlendAt,
    };
  }

  const sun = sunDir.clone().normalize();
  const backdropsReady = hasBackdropAssets();
  const tuneVec = (b: BiomeId): THREE.Vector2 =>
    new THREE.Vector2(HDRI_TUNE[b].gain, HDRI_TUNE[b].clamp);
  const backdropTex = (b: BiomeId): THREE.Texture =>
    (backdropsReady ? backdropStore[b] : hdriStore[b]) as THREE.Texture;
  const start = biomeBlendAt(0, 0);
  const uniforms = {
    uSkyA: { value: hdriStore[start.from] as THREE.Texture },
    uSkyB: { value: hdriStore[start.to] as THREE.Texture },
    uMix: { value: start.t },
    uOffA: { value: sunOffsetU(start.from, sun) },
    uOffB: { value: sunOffsetU(start.to, sun) },
    uTuneA: { value: tuneVec(start.from) },
    uTuneB: { value: tuneVec(start.to) },
    uSunDir: { value: sun },
    uBackdropA: { value: backdropTex(start.from) },
    uBackdropB: { value: backdropTex(start.to) },
    uBackdropStrength: { value: backdropsReady ? 1 : 0 },
    uBackdropBiasA: { value: BACKDROP_Y_BIAS[start.from] },
    uBackdropBiasB: { value: BACKDROP_Y_BIAS[start.to] },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 20), material);
  dome.renderOrder = -10;

  let cur = start;
  return {
    dome,
    setCameraPos(x: number, z: number, dt: number): void {
      const next = biomeBlendAt(x, z);
      if (next.from !== cur.from || next.to !== cur.to) {
        uniforms.uSkyA.value = hdriStore[next.from] as THREE.Texture;
        uniforms.uSkyB.value = hdriStore[next.to] as THREE.Texture;
        uniforms.uOffA.value = sunOffsetU(next.from, sun);
        uniforms.uOffB.value = sunOffsetU(next.to, sun);
        uniforms.uTuneA.value.copy(tuneVec(next.from));
        uniforms.uTuneB.value.copy(tuneVec(next.to));
        uniforms.uBackdropA.value = backdropTex(next.from);
        uniforms.uBackdropB.value = backdropTex(next.to);
        uniforms.uBackdropBiasA.value = BACKDROP_Y_BIAS[next.from];
        uniforms.uBackdropBiasB.value = BACKDROP_Y_BIAS[next.to];
        uniforms.uMix.value = next.t;
        cur = next;
        return;
      }
      // same pair: chase the spatial mix gently so fast travel/teleports
      // still ease over ~a second instead of popping
      const k = 1 - Math.exp(-dt * 3);
      uniforms.uMix.value += (next.t - uniforms.uMix.value) * k;
      cur = next;
    },
    envTexture(biome: BiomeId): THREE.DataTexture | null {
      return hdriStore[biome] ?? null;
    },
    envRotationY(biome: BiomeId): number {
      // dome samples at u + off. three r165 negates environmentRotation
      // before building the PMREM lookup matrix ("accommodate left-handed
      // frame", WebGLMaterials.js), so the effective lookup azimuth is
      // alpha + theta — matching the dome needs theta = +off*2pi. (A negated
      // value lands the env sun 2x the offset away from the dome's.)
      return sunOffsetU(biome, sun) * 2 * Math.PI;
    },
    biomeAt: biomeBlendAt,
  };
}

export interface CloudLayer {
  sprites: THREE.Sprite[];
}

// Cloud sprites. Low tier keeps the full painted layer over its gradient
// dome. High tier: the HDRIs carry photographic cloud cover, so the cumulus
// sprite deck is retired — only a faint, slow cirrus layer remains for
// parallax/motion against the static sky.
export function buildClouds(lowGfx: boolean): CloudLayer {
  const variants = lowGfx
    ? [cloudTexture()]
    : [cloudTexture(14, 0.5), cloudTexture(8, 0.7), cloudTexture(20, 0.42)];
  const sprites: THREE.Sprite[] = [];
  const span = (WORLD_MAX_Z - WORLD_MIN_Z) + 240;

  const spawn = (count: number, yMin: number, yMax: number, baseOpacity: number, drift: number, scaleMin: number, scaleMax: number): void => {
    for (let i = 0; i < count; i++) {
      const y = yMin + Math.random() * (yMax - yMin);
      // higher clouds thin out
      const altFade = 1 - 0.35 * ((y - yMin) / Math.max(1, yMax - yMin));
      const mat = new THREE.SpriteMaterial({
        map: variants[i % variants.length],
        transparent: true,
        opacity: baseOpacity * altFade,
        fog: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const sc = scaleMin + Math.random() * (scaleMax - scaleMin);
      sprite.scale.set(sc, sc * 0.45, 1);
      sprite.position.set(
        (Math.random() - 0.5) * 600,
        y,
        WORLD_MIN_Z - 120 + Math.random() * span,
      );
      sprite.userData.drift = drift;
      sprites.push(sprite);
    }
  };

  if (lowGfx) {
    spawn(14, 95, 150, 0.85, 1.6, 60, 150);
  } else {
    spawn(5, 165, 195, 0.3, 0.55, 140, 240); // high slow cirrus layer only
  }
  return { sprites };
}
