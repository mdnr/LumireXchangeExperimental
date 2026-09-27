// Where the bundled reference hand sits in the wrist frame.
//
// The align page needs a hand that a seller can read at a glance: which way is
// up the forearm, and which face of the hand the dial should look out of. A
// capsule hand can show a direction but not a hand, and recognising it is the
// whole judgement the page exists to support, so the reference is a real
// anatomical hand instead.
//
// The catch is that a downloaded hand arrives in whatever orientation its
// author exported it in, and a page whose entire purpose is orientation is
// worthless if its reference is quietly sideways. So the transform below is
// measured out of the file rather than eyeballed, and the measurements are
// recorded here so the next person can check them instead of re-deriving them.
//
// Measured from the rig's own joint hierarchy and mesh vertices, in the file's
// own units (1 unit is roughly 6.4cm, putting the hand at a life-size 19cm from
// the wrist crease to the middle fingertip):
//
//   HandMain        x = +1.166   the arm end
//   MiddleF_tip     x = -1.211   the fingertip end
//   => +X runs from the fingertips toward the elbow, matching the frame's +X.
//
//   finger tips across the hand, model Z:
//     index  -0.336   middle  -0.018   ring  +0.377   pinky  +0.648
//     thumb  -0.679
//   => the thumb sits on -Z, and the frame wants the thumb on +Y.
//
// Those two facts fix the third axis without any guesswork, because the frame is
// right handed and X cross Y has to be Z. Canonical +X is model +X and canonical
// +Y is model -Z, so canonical +Z is forced to be model +Y. All three axes
// falling out of two measurements and a handedness rule is the reason this is a
// constant rather than something tuned by eye.
//
// A half turn about X is what takes model +Y to canonical +Z and model -Z to
// canonical +Y, so the rotation below is exactly that.

import * as THREE from 'three';

/** Credit for the CC BY asset, shown on the align page as that licence requires. */
export const REFERENCE_HAND_CREDIT = {
  title: 'Rigged Hand',
  author: 'J-Toastie',
  url: 'https://poly.pizza/m/BEy8jbxm6A',
  licence: 'CC BY',
} as const;

/** Served from `public/`, so a plain root-relative path with no bundler import. */
export const REFERENCE_HAND_URL = '/reference-hand.glb';

/** Model +Y to canonical +Z, model -Z to canonical +Y. Derived above. */
export const REFERENCE_HAND_ROTATION_X = Math.PI / 2;

/**
 * The wrist centre in the file's own units, and how wide the wrist is there.
 *
 * Found by sweeping mesh vertices along the forearm and watching the cross
 * section change shape: out in the hand it is wide and flat (breadth over
 * thickness around 4), up the forearm it is round (around 1.2). The wrist is
 * the transition, a window at x 0.40 to 0.52.
 *
 * Two independent checks agree that window is the wrist rather than the distal
 * forearm or the palm:
 *
 *   - breadth over thickness there is 0.906 / 0.480 = 1.89, so it is a wrist and
 *     not yet a palm, which is much closer to round;
 *   - wrist breadth over palm breadth is 0.906 / 1.362 = 0.665, and the
 *     anatomical figure for an adult hand is 0.64 to 0.70.
 *
 * A window a little either side of this one gives a ratio still inside that
 * range, so the exact edges are not load bearing.
 */
export const WRIST_CENTRE_MODEL = new THREE.Vector3(0.4549, 0.0235, -0.0557);
export const WRIST_BREADTH_MODEL = 0.9061;

/** Breadth across the MCP knuckle line, from the same style of sweep. */
export const PALM_BREADTH_MODEL = 1.362;

/**
 * How many wrist breadths wide the palm is, 0.906 / 1.362 = 0.665.
 *
 * The align page's unit is the wrist, so a camera that wants to reproduce a saved
 * alignment has to convert its own pixel measurement into wrist breadths before
 * it multiplies anything by it. A tracker can measure the palm breadth directly,
 * across the knuckle line, and this is the factor that turns that into a wrist.
 */
export const WRIST_BREADTH_OVER_PALM_BREADTH =
  WRIST_BREADTH_MODEL / PALM_BREADTH_MODEL;

/**
 * The align page measures everything in wrist widths, the wrist being exactly
 * 1.0 across, so the model is scaled until its wrist is 1.0 wide too. That is
 * what lets a saved alignment fit any hand without rescaling.
 */
export const REFERENCE_HAND_SCALE = 1 / WRIST_BREADTH_MODEL;

/**
 * Bones the fingernails are hung off.
 *
 * The GLB is untextured and has no nails, and the nails are not decoration: they
 * are the one unambiguous way to tell the back of the hand from the palm at a
 * glance, which is the single judgement this page exists to support. A real hand
 * shape gives that away too, but only to someone who already knows, so the nails
 * go back on.
 *
 * Each nail is measured off its own bone rather than placed at a fixed point, so
 * the sizes and positions follow the hand if the asset is ever re-exported or
 * swapped for a differently sized one:
 *
 *   `back`  how far back from the fingertip the nail's centre sits, as a
 *           fraction of that phalanx's length.
 *   `lift`  how far the nail stands off the bone's axis, also as a fraction of
 *           phalanx length, which is what puts it on the skin rather than in it.
 *   `reach` how much of the phalanx the nail covers along its length.
 *   `wide`  nail width as a fraction of nail length. A fingernail is a little
 *           under two thirds as wide as it is long, on all five fingers.
 */
export const NAIL_PLACEMENT = [
  { bone: 'IndexF_tip', back: 0.3, lift: 0.24, reach: 0.55, wide: 0.62 },
  { bone: 'MiddleF_tip', back: 0.3, lift: 0.24, reach: 0.55, wide: 0.62 },
  { bone: 'RingF_tip', back: 0.3, lift: 0.24, reach: 0.55, wide: 0.62 },
  { bone: 'PinkyF_tip', back: 0.3, lift: 0.26, reach: 0.55, wide: 0.66 },
  // The thumb nail is broader and sits flatter, and its distal phalanx is short,
  // so it gets its own numbers rather than sharing the fingers'.
  { bone: 'ThumbTop', back: 0.3, lift: 0.22, reach: 0.5, wide: 0.78 },
] as const;

export interface NailPlacement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Half-extents, so the nail is a flattened dome rather than a blob. */
  half: THREE.Vector3;
}

/**
 * Lays a nail on the back of a distal phalanx.
 *
 * `dir` is the phalanx direction and becomes the nail's long axis. `dorsal` is
 * the direction the back of the hand faces, which is the face the nail has to lie
 * on; it is projected perpendicular to `dir` to get the nail's own up. Building
 * the frame from both, rather than spinning a default ellipsoid into place, is
 * what keeps the flat face flat against the finger instead of rolling off at an
 * angle. It is passed in rather than assumed because this runs in the asset's
 * own space, where the back of the hand is +Y, not in the wrist frame's +Z.
 */
export function nailPlacement(
  dir: THREE.Vector3,
  dorsal: THREE.Vector3,
  { back, lift, reach, wide }: (typeof NAIL_PLACEMENT)[number],
  phalanxLength: number,
): NailPlacement {
  const x = dir.clone().normalize();
  const z = dorsal.clone().addScaledVector(x, -dorsal.dot(x));
  // Guard the degenerate case of a phalanx pointing straight out of the back of
  // the hand, where projecting the dorsal axis would collapse to nothing.
  if (z.lengthSq() < 1e-12) {
    z.set(0, 1, 0).addScaledVector(x, -x.y);
    if (z.lengthSq() < 1e-12) z.set(0, 0, 1).addScaledVector(x, -x.z);
  }
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();

  const length = phalanxLength * reach;
  const width = length * wide;
  const position = x
    .clone()
    .multiplyScalar(-phalanxLength * back)
    .addScaledVector(z, phalanxLength * lift);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
  return {
    position,
    quaternion,
    half: new THREE.Vector3(length / 2, length * 0.11, width / 2),
  };
}
