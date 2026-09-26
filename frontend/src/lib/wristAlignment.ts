import * as THREE from 'three';
import type { ModelAlignment } from './types';

// The one place the wrist frame is defined, shared by the seller align page and
// both try-on renderers. It is a contract, so it lives on its own and is imported
// rather than restated, because a seller who aligns a model against one copy of
// this frame and then sees it rendered against a different copy gets no useful
// result from either.
//
//   +X  up the forearm, toward the elbow
//   +Y  around the wrist
//   +Z  out of the back of the hand
//
// The tracker genuinely knows all three. The seller's alignment maps their model
// into that frame, so orientation is exact by construction and there is nothing
// left in a renderer to tune.
//
// A watch's placement used to be inferred from the model's bounding box, which
// says which axis is thinnest and not which one a dial looks out of, and then
// patched with quarter-turn trims. That took several rounds of guessing to land
// and was still wrong. The frame replaces all of it.

/**
 * How many wrist widths wide the watch model is allowed to be, as a fraction of
 * the wrist itself. 1.0 means the model's largest dimension is rendered exactly
 * as wide as the wrist, which is how a real watch is sized, and it is the unit the
 * align page's nominal model width is measured in.
 */
export const WATCH_WIDTH_FACTOR = 1.0;

/**
 * A wrist's width in metres. Only the native WebXR path needs it, because that
 * tracker's wrist space is in real metres rather than in measured wrist widths.
 * A 60mm wrist is a large adult wrist, so a watch aligned to this reads slightly
 * conservative on smaller arms.
 */
export const WRIST_WIDTH_METRES = 0.06;

export interface WristAlignment {
  /** Maps the model into the canonical wrist frame above. */
  quat: THREE.Quaternion;
  /** Translation in wrist widths, so one alignment fits any hand. */
  offset: THREE.Vector3;
  scale: number;
}

export const UNALIGNED: WristAlignment = {
  quat: new THREE.Quaternion(),
  offset: new THREE.Vector3(0, 0, 0),
  scale: 1,
};

/**
 * Reads a saved alignment off a product, defensively. A product that has never
 * been aligned, and a product whose stored value is unusable, both resolve to
 * no rotation at all: the watch then renders plainly unrotated, which is obvious
 * and reports itself, rather than sheared, which is not.
 */
export function toWristAlignment(saved?: ModelAlignment | null): WristAlignment {
  if (!saved) return UNALIGNED;
  const quat = new THREE.Quaternion(saved.quatX, saved.quatY, saved.quatZ, saved.quatW);
  if (quat.length() < 0.5) return UNALIGNED;
  const scale = Number.isFinite(saved.scale) && saved.scale > 0 ? saved.scale : 1;
  const offset = new THREE.Vector3(saved.offsetX, saved.offsetY, saved.offsetZ);
  if (![offset.x, offset.y, offset.z].every(Number.isFinite)) return UNALIGNED;
  return { quat: quat.normalize(), offset, scale };
}

/**
 * Degrees are only ever a view onto a quaternion. They are what a person can read
 * and adjust; the quaternion is what gets stored, so no axis order is baked into
 * anything that has to survive a round trip.
 */
export function eulerDegFromQuat(q: THREE.Quaternion): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [
    THREE.MathUtils.radToDeg(e.x),
    THREE.MathUtils.radToDeg(e.y),
    THREE.MathUtils.radToDeg(e.z),
  ];
}

export function quatFromEulerDeg(d: [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(d[0]),
      THREE.MathUtils.degToRad(d[1]),
      THREE.MathUtils.degToRad(d[2]),
      'XYZ',
    ),
  );
}
