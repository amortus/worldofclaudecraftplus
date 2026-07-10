// Free orbit/fly camera math for the 3D editor. PURE: no THREE, no DOM, so the
// orbit geometry and the fly/pan target moves are unit-testable in Node. The 3D
// view (view.ts) owns the THREE.PerspectiveCamera and applies `orbitEye` each frame.
//
// Unlike the gameplay camera (renderer.ts, hard-locked to lookAt(player)), this one
// orbits a FREE target point the operator can fly anywhere, so you can inspect any
// slope, cliff, or camp from any angle.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// The whole camera state: a target the camera looks at, plus a spherical offset
// (yaw around Y, pitch above the horizon, distance) that places the eye.
export interface OrbitState {
  tx: number;
  ty: number;
  tz: number;
  yaw: number; // radians, 0 looks toward +z, increases toward +x (matches sim/view convention)
  pitch: number; // radians above the horizon, clamped away from straight down/up
  dist: number; // yards from target to eye
}

export const MIN_PITCH = 0.05;
export const MAX_PITCH = 1.5; // ~86deg: near top-down but never gimbal-flipped
export const MIN_DIST = 4;
export const MAX_DIST = 700; // the world strip is ~360 wide, so this frames all of it

export const clampPitch = (p: number): number => Math.max(MIN_PITCH, Math.min(MAX_PITCH, p));
export const clampDist = (d: number): number => Math.max(MIN_DIST, Math.min(MAX_DIST, d));

// Eye position for the current state. Spherical offset from the target:
//   x = tx + dist*cos(pitch)*sin(yaw)
//   y = ty + dist*sin(pitch)
//   z = tz + dist*cos(pitch)*cos(yaw)
export function orbitEye(s: OrbitState): Vec3 {
  const cp = Math.cos(s.pitch);
  return {
    x: s.tx + s.dist * cp * Math.sin(s.yaw),
    y: s.ty + s.dist * Math.sin(s.pitch),
    z: s.tz + s.dist * cp * Math.cos(s.yaw),
  };
}

// Move the target across the ground plane along the camera's yaw-oriented axes
// (WASD free-fly). `forward` walks toward/away from where you look (projected flat),
// `right` strafes. Distance is scaled by `speed` (yards).
export function flyTarget(s: OrbitState, forward: number, right: number, speed: number): void {
  // Ground-plane forward is the horizontal projection of the look direction:
  // from eye toward target is -(sin yaw, cos yaw), so "forward" (into the screen)
  // moves the target along -(sin, cos).
  const sinY = Math.sin(s.yaw);
  const cosY = Math.cos(s.yaw);
  s.tx += (-sinY * forward + cosY * right) * speed;
  s.tz += (-cosY * forward - sinY * right) * speed;
}

// Raise/lower the target (vertical fly, e.g. Q/E). Kept separate from flyTarget so
// vertical never couples to yaw.
export function liftTarget(s: OrbitState, up: number, speed: number): void {
  s.ty += up * speed;
}

// Pan the target parallel to the screen (right/middle-drag). `dxYards`/`dyYards` are
// already converted to world yards by the caller (from pixels via the current dist).
// Screen-right maps to the camera's right axis; screen-up maps to the ground-plane
// forward axis so a drag "pushes" the world under the cursor.
export function panTarget(s: OrbitState, dxYards: number, dyYards: number): void {
  const sinY = Math.sin(s.yaw);
  const cosY = Math.cos(s.yaw);
  // right axis on the ground = (cos yaw, -sin yaw); forward axis = -(sin yaw, cos yaw)
  s.tx += cosY * dxYards - sinY * dyYards;
  s.tz += -sinY * dxYards - cosY * dyYards;
}

// Orbit by a pointer drag: yaw follows horizontal motion, pitch vertical.
export function orbitBy(s: OrbitState, dYaw: number, dPitch: number): void {
  s.yaw += dYaw;
  s.pitch = clampPitch(s.pitch + dPitch);
}

// Zoom the orbit distance by a wheel notch (multiplicative so it feels even across
// the range). `factor` > 1 zooms out, < 1 zooms in.
export function zoomDist(s: OrbitState, factor: number): void {
  s.dist = clampDist(s.dist * factor);
}
