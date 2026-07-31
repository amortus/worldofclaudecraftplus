import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIM_REPAIR_FRAMES,
  type AnimState,
  POSE_DRIVE_MIN_WEIGHT,
} from '../src/render/characters/anim_state';
import type { CharacterVisual } from '../src/render/characters/visual';

// A three.js SkinnedMesh blends toward BIND POSE (arms out, the T-pose) in
// proportion to how far the summed effective weight of the mixer's scheduled
// actions falls short of 1: the PropertyMixer blends the deficit back toward
// the bind transform. Every case below drives a REAL CharacterVisual through a
// real AnimationMixer and asserts that the sum stays at ~1, which is exactly
// the quantity players see as a T-pose when it drops.
//
// GLTFLoader does not run in Node, so the asset loader is mocked out and the
// rig is a minimally real stub GLTF. That is enough: the mixer, the actions and
// the state machine under test are all real; only the geometry is fake.

const FRAME = 1 / 60;

/** A creature rig on the `animal()` ClipMap (see manifest.ts). */
const VISUAL_KEY = 'mob_stag';
const CLIP_NAMES = [
  'Idle',
  'Walk',
  'Gallop',
  'Attack_Headbutt',
  'Attack_Kick',
  'Idle_HitReact_Left',
  'Idle_HitReact_Right',
  'Death',
];

const anim = (over: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  moving: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  sitting: false,
  ...over,
});

function stubGltf() {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
  mesh.name = 'body';
  scene.add(mesh);
  return { scene, animations: CLIP_NAMES.map((name) => new THREE.AnimationClip(name, 1, [])) };
}

/** The mixer state the visual keeps private; reading it is the only way to
 *  measure the bind-pose deficit that the bug renders as a T-pose. */
type MixerPeek = { actions: Map<string, THREE.AnimationAction> };

function actionsOf(visual: CharacterVisual): Map<string, THREE.AnimationAction> {
  return (visual as unknown as MixerPeek).actions;
}

function poseWeight(visual: CharacterVisual): number {
  let total = 0;
  for (const action of actionsOf(visual).values()) {
    if (action.isScheduled()) total += action.getEffectiveWeight();
  }
  return total;
}

async function makeVisual(): Promise<CharacterVisual> {
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => Promise.resolve(stubGltf())),
    loadHdr: vi.fn(() => new Promise(() => undefined)),
    loadTexture: vi.fn(() => Promise.resolve({ flipY: true, needsUpdate: false })),
    releaseGltf: vi.fn(),
  }));
  const { CharacterVisual: Ctor } = await import('../src/render/characters/visual');
  const { assetsReady } = await import('../src/render/assets/preload');
  await assetsReady();
  return new Ctor(VISUAL_KEY, 0xffffff);
}

describe('CharacterVisual keeps something driving the rig', () => {
  let visual: CharacterVisual;

  beforeEach(async () => {
    visual = await makeVisual();
    visual.update(FRAME, anim(), true);
  });

  it('starts and stays driven while a held state runs', () => {
    for (let i = 0; i < 10; i++) visual.update(FRAME, anim({ moving: true, speed: 2 }), true);
    expect(poseWeight(visual)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('re-drives a rig that was left with no action at all, within the debounce window', () => {
    // The whole bug class in one shape: something stopped every action while a
    // HELD state (strafe/cast/walk) was running, so no base-state edge is ever
    // coming to repair it. Nothing else in the machine can recover from this.
    for (const action of actionsOf(visual).values()) action.stop();
    expect(poseWeight(visual)).toBe(0);

    for (let i = 0; i < ANIM_REPAIR_FRAMES; i++) {
      visual.update(FRAME, anim({ moving: true, speed: 2 }), true);
    }
    expect(poseWeight(visual)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('does not wait for the mixer to catch up when the rig is distance-throttled', () => {
    for (const action of actionsOf(visual).values()) action.stop();
    for (let i = 0; i < ANIM_REPAIR_FRAMES; i++) visual.update(FRAME, anim(), false);
    expect(poseWeight(visual)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('does not fire the watchdog during a legitimate crossfade', () => {
    // Walking, then stopping, crossfades walk -> idle over FADE seconds. The
    // two halves sum to ~1 the whole way, so the repair must never trip and
    // snap the blend away.
    for (let i = 0; i < 20; i++) visual.update(FRAME, anim({ moving: true, speed: 2 }), true);
    const weights: number[] = [];
    for (let i = 0; i < 30; i++) {
      visual.update(FRAME, anim(), true);
      weights.push(poseWeight(visual));
    }
    expect(Math.min(...weights)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('never blends toward bind pose across death and respawn (the rez T-pose)', () => {
    const weights: number[] = [];
    for (let i = 0; i < 6; i++) {
      visual.update(FRAME, anim({ dead: true }), true);
      weights.push(poseWeight(visual));
    }
    // ...and back up, standing still: with no base-state edge on the revive
    // frame, revive()'s own hand-off is the only thing driving the rig, and it
    // must hand the incoming clip an outgoing partner (the clamped death pose).
    for (let i = 0; i < 6; i++) {
      visual.update(FRAME, anim(), true);
      weights.push(poseWeight(visual));
    }
    expect(Math.min(...weights)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('never blends toward bind pose across an attack rotation', () => {
    const weights: number[] = [];
    for (let swing = 0; swing < 4; swing++) {
      visual.playAttack();
      for (let i = 0; i < 4; i++) {
        visual.update(FRAME, anim(), true);
        weights.push(poseWeight(visual));
      }
    }
    expect(Math.min(...weights)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('never blends toward bind pose when the SAME one-shot clip re-triggers', () => {
    // A single-attack rig, a re-fired emote, or a swing that lands twice inside
    // the fade all hand playOneShot the clip that is already `current`. Stopping
    // it and fading it back in from zero, with no outgoing partner, T-poses the
    // rig for the whole fade every single time.
    const playOneShot = (
      visual as unknown as {
        playOneShot(name: string, timeScale: number): void;
      }
    ).playOneShot.bind(visual);
    const weights: number[] = [];
    for (let swing = 0; swing < 4; swing++) {
      playOneShot('Attack_Headbutt', 1);
      for (let i = 0; i < 4; i++) {
        visual.update(FRAME, anim(), true);
        weights.push(poseWeight(visual));
      }
    }
    expect(Math.min(...weights)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('leaves a dead rig on a real pose when its rig ships no death clip', () => {
    // dead-lock freezes the watchdog, so enterDeath is the only repair there is.
    actionsOf(visual).delete('Death');
    for (const action of actionsOf(visual).values()) action.stop();
    visual.update(FRAME, anim({ dead: true }), true);
    expect(poseWeight(visual)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('freezes the corpse of a rig with no death clip instead of jogging in place', () => {
    actionsOf(visual).delete('Death');
    // Die mid-run: the run loop is what is driving the rig.
    for (let i = 0; i < 10; i++) visual.update(FRAME, anim({ moving: true, speed: 7 }), true);
    const run = actionsOf(visual).get('Gallop');
    if (!run) throw new Error('test harness lost the run action');
    expect(run.isScheduled() && run.getEffectiveWeight() > 0.5).toBe(true);

    visual.update(FRAME, anim({ dead: true }), true);
    expect(run.paused).toBe(true);
    const frozenAt = run.time;
    for (let i = 0; i < 10; i++) visual.update(FRAME, anim({ dead: true }), true);
    expect(run.time).toBe(frozenAt); // a corpse does not keep running
    expect(poseWeight(visual)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });

  it('un-freezes that corpse on revive, even when the base action never changes', () => {
    // The trap in the freeze above: revive() routes through fadeTo, which early
    // returns when the incoming base action IS the current one, so the rig would
    // stay paused forever after dying and reviving on the spot.
    actionsOf(visual).delete('Death');
    visual.update(FRAME, anim(), true); // idle is current
    const idle = actionsOf(visual).get('Idle');
    if (!idle) throw new Error('test harness lost the idle action');

    visual.update(FRAME, anim({ dead: true }), true);
    expect(idle.paused).toBe(true);

    visual.update(FRAME, anim(), true); // revive, still standing still
    expect(idle.paused).toBe(false);
    const resumedAt = idle.time;
    for (let i = 0; i < 5; i++) visual.update(FRAME, anim(), true);
    expect(idle.time).toBeGreaterThan(resumedAt);
    expect(poseWeight(visual)).toBeGreaterThan(1 - POSE_DRIVE_MIN_WEIGHT);
  });
});
