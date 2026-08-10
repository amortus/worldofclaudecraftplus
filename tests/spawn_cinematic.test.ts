// The first-spawn camera cinematic is pure math with no DOM, so the whole
// contract is testable here: the four eligibility gates, the device carve-out,
// the start/landing poses, continuity along the approach, and the touch skip.

import { describe, expect, it } from 'vitest';
import {
  type CameraPose,
  decideSpawnCinematic,
  platformFromUserAgent,
  recordSkipTap,
  SKIP_TAP_COUNT,
  SKIP_TAP_WINDOW_SEC,
  type SpawnCinematicPolicyInput,
  spawnCinematicFor,
  spawnCinematicPose,
} from '../src/game/spawn_cinematic';

// The gameplay pose the approach must land on exactly. Inside the shipped
// clamps: dist 3..22 (Input.zoomBy) and pitch -0.4..1.35 (the look clamps).
const END: CameraPose = { yaw: Math.PI, pitch: 0.32, dist: 12 };

const eligible = (over: Partial<SpawnCinematicPolicyInput> = {}): SpawnCinematicPolicyInput => ({
  requested: true,
  seen: false,
  playerLevel: 1,
  reducedMotion: false,
  native: false,
  platform: 'other',
  engine: 'chromium',
  constrainedMemory: false,
  graphicsPreset: 2,
  ...over,
});

describe('eligibility', () => {
  it('plays for a fresh level 1 character that has not seen it', () => {
    expect(decideSpawnCinematic(eligible())).toEqual({ play: true, reason: 'eligible' });
  });

  it('keeps all four gates', () => {
    for (const over of [
      { requested: false },
      { seen: true },
      { playerLevel: 2 },
      { reducedMotion: true },
    ] as Partial<SpawnCinematicPolicyInput>[]) {
      expect(decideSpawnCinematic(eligible(over))).toEqual({
        play: false,
        reason: 'ineligible',
      });
    }
  });

  it('honours reduced motion even on an otherwise perfect entry', () => {
    // The accessibility rule: this one gate is never traded away for polish.
    expect(decideSpawnCinematic(eligible({ reducedMotion: true })).play).toBe(false);
  });

  it('skips the sweep on constrained native iOS WebKit above Low', () => {
    const ios = {
      native: true,
      platform: 'ios',
      engine: 'webkit',
      constrainedMemory: true,
      graphicsPreset: 2,
    };
    expect(decideSpawnCinematic(eligible(ios))).toEqual({
      play: false,
      reason: 'constrained-ios-webkit',
    });
    // Low keeps the cinematic ...
    expect(decideSpawnCinematic(eligible({ ...ios, graphicsPreset: 1 })).play).toBe(true);
    // ... and so does an unconstrained device, or the browser (non-native) build.
    expect(decideSpawnCinematic(eligible({ ...ios, constrainedMemory: false })).play).toBe(true);
    expect(decideSpawnCinematic(eligible({ ...ios, native: false })).play).toBe(true);
    // A non-WebKit engine on iOS-labelled hardware is not the case being avoided.
    expect(decideSpawnCinematic(eligible({ ...ios, engine: 'chromium' })).play).toBe(true);
  });
});

describe('platform detection', () => {
  it('classifies the iOS family, Android, and everything else', () => {
    expect(platformFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(platformFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('ios');
    expect(platformFromUserAgent('Mozilla/5.0 (iPod touch)')).toBe('ios');
    expect(platformFromUserAgent('Mozilla/5.0 (Linux; Android 13; SM-A146M)')).toBe('android');
    expect(platformFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
  });
});

describe('the approach', () => {
  const c = spawnCinematicFor(END);

  it('opens far out and high above the world', () => {
    const start = spawnCinematicPose(0, c);
    expect(start.dist).toBe(c.startDist);
    expect(start.pitch).toBe(c.startPitch);
    // Deliberately beyond the wheel-zoom range: an establishing shot, not a
    // zoom level the player could have dialled in.
    expect(c.startDist).toBeGreaterThan(22);
    // ...but the pitch stays inside the look clamp, so the hand-off is legal.
    expect(c.startPitch).toBeLessThanOrEqual(1.35);
    expect(c.startPitch).toBeGreaterThanOrEqual(-0.4);
    // It opens partway around from the gameplay yaw and sweeps in, never orbits.
    expect(c.turns).toBeGreaterThan(0);
    expect(c.turns).toBeLessThan(1);
    expect(start.yaw).toBeCloseTo(END.yaw - c.turns * Math.PI * 2, 10);
  });

  it('lands on the gameplay pose EXACTLY, so the hand-off cannot snap', () => {
    const end = spawnCinematicPose(c.durationSec, c);
    expect(end.yaw).toBeCloseTo(END.yaw, 10);
    expect(end.pitch).toBeCloseTo(END.pitch, 10);
    expect(end.dist).toBeCloseTo(END.dist, 10);
    expect(end.done).toBe(true);
  });

  it('reports done only at the end, and clamps past it', () => {
    expect(spawnCinematicPose(0, c).done).toBe(false);
    expect(spawnCinematicPose(c.durationSec - 0.01, c).done).toBe(false);
    const past = spawnCinematicPose(c.durationSec * 3, c);
    expect(past.done).toBe(true);
    expect(past.dist).toBeCloseTo(END.dist, 10);
    // A negative elapsed (a clock that jumped) clamps to the opening frame.
    expect(spawnCinematicPose(-5, c).dist).toBe(c.startDist);
  });

  it('is continuous and monotonic: one glide, no reversals', () => {
    let prevDist = Infinity;
    let prevYaw = -Infinity;
    let prevPitch = Infinity;
    for (let i = 0; i <= 100; i++) {
      const pose = spawnCinematicPose((c.durationSec * i) / 100, c);
      expect(pose.dist).toBeLessThanOrEqual(prevDist + 1e-9);
      expect(pose.yaw).toBeGreaterThanOrEqual(prevYaw - 1e-9);
      expect(pose.pitch).toBeLessThanOrEqual(prevPitch + 1e-9);
      // No step big enough to read as a cut on a 9 second, 100 sample approach.
      if (Number.isFinite(prevDist)) expect(prevDist - pose.dist).toBeLessThan(2);
      prevDist = pose.dist;
      prevYaw = pose.yaw;
      prevPitch = pose.pitch;
    }
  });

  it('eases in and out rather than moving linearly', () => {
    const half = spawnCinematicPose(c.durationSec / 2, c);
    const linearHalf = (c.startDist + END.dist) / 2;
    expect(half.dist).toBeCloseTo(linearHalf, 6); // sine ease is symmetric at the midpoint
    // But the first tenth barely moves, which is what makes it a glide.
    const tenth = spawnCinematicPose(c.durationSec / 10, c);
    expect(c.startDist - tenth.dist).toBeLessThan((c.startDist - END.dist) / 10);
  });
});

describe('the touch skip', () => {
  it('needs a burst, so a lone stray tap never skips', () => {
    const taps: number[] = [];
    for (let i = 1; i < SKIP_TAP_COUNT; i++) {
      expect(recordSkipTap(taps, i * 0.1)).toBe(false);
    }
    expect(recordSkipTap(taps, SKIP_TAP_COUNT * 0.1)).toBe(true);
  });

  it('forgets taps outside the sliding window', () => {
    const taps: number[] = [];
    for (let i = 0; i < SKIP_TAP_COUNT * 3; i++) {
      // One tap per window: never enough to reach the threshold.
      expect(recordSkipTap(taps, i * (SKIP_TAP_WINDOW_SEC + 0.5))).toBe(false);
      expect(taps).toHaveLength(1);
    }
  });
});
