import * as THREE from 'three';

// The procedural hand.
//
// This started life as five boxes, which is enough to show a direction but not
// enough to recognise as a hand, and recognising it matters here: the seller is
// using it to decide which way up their model goes, so the silhouette has to
// carry real information rather than just being a wrist-shaped blob.
//
// It is built from capsules and spheres, which is what gives joints instead of
// corners. The fingernails are the load-bearing detail, not decoration: they are
// the one unambiguous way to tell the back of the hand from the palm at a glance,
// which is the single judgement this page exists to support.
//
// It survives as the thing that renders while the real hand model loads, and
// permanently as the fallback if that model ever fails to, because an align page
// with no wrist on it is worse than one with a simple wrist.
//
// Proportions are in wrist widths, the same unit the rest of the page uses. An
// adult hand is roughly 3.4 wrist widths from the wrist crease to the middle
// fingertip, and a wrist is distinctly wider than it is deep, so the hand is
// built elliptical rather than round on the Z axis.
//
// The thumb sits on +Y, matching the bundled hand in `lib/referenceHand.ts`, so
// swapping one for the other does not silently change which side the thumb is on,
// which would quietly invalidate every alignment a seller had already saved.

const SKIN = { color: '#d9b193', roughness: 0.74, metalness: 0 } as const;
const NAIL = { color: '#f0dcd0', roughness: 0.28, metalness: 0 } as const;
// How deep the hand is relative to its width. A wrist is about 1.25 times wider
// than it is thick, and the same roughly holds through the palm. The wrist is
// 1.0 across, which is what makes the rest of the page's numbers wrist widths.
const HAND_DEPTH = 0.78;
const UP = new THREE.Vector3(0, 1, 0);

/** Places a capsule so it spans two points, with the rounded caps at the ends. */
function segment(a: [number, number, number], b: [number, number, number], r: number) {
  const va = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(va);
  const length = dir.length();
  return {
    position: va.add(dir.multiplyScalar(0.5)).toArray() as [number, number, number],
    quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
    // CapsuleGeometry's middle section, so that middle + 2 * radius spans exactly
    // the distance from a to b and the caps land on the endpoints.
    middle: Math.max(0.001, length - 2 * r),
  };
}

function Limb({
  a,
  b,
  r,
  depth = HAND_DEPTH,
  material = SKIN,
}: {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  depth?: number;
  material?: { color: string; roughness: number; metalness: number };
}) {
  const { position, quaternion, middle } = segment(a, b, r);
  return (
    <mesh position={position} quaternion={quaternion} scale={[1, 1, depth]} castShadow receiveShadow>
      <capsuleGeometry args={[r, middle, 6, 18]} />
      <meshStandardMaterial {...material} />
    </mesh>
  );
}

/**
 * A point on the back (+Z) side of a limb segment: `back` along the segment from
 * its far end, and `out` away from it.
 *
 * Fingernails are placed with this rather than by adding a fixed +Z, because the
 * fingers curl toward the palm. A constant offset follows the fingertip round to
 * the palm side, which is both where a nail does not belong and where it would
 * tell the seller the wrong thing about which face of the hand they are looking
 * at, which is the one job the nails are here to do.
 */
function dorsalPoint(
  a: [number, number, number],
  b: [number, number, number],
  { out, back }: { out: number; back: number },
) {
  const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  // Perpendicular to the segment, in the plane the limb bends in, kept on the side
  // away from the bend so it always points out of the back of the hand.
  const p = new THREE.Vector3(-d.z, 0, d.x);
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1);
  if (p.z < 0) p.negate();
  return new THREE.Vector3(...b)
    .addScaledVector(d, -back)
    .addScaledVector(p.normalize(), out)
    .toArray() as [number, number, number];
}

function Blob({
  at,
  r,
  scale = [1, 1, 1],
  material = SKIN,
}: {
  at: [number, number, number];
  r: number;
  scale?: [number, number, number];
  material?: { color: string; roughness: number; metalness: number };
}) {
  return (
    <mesh position={at} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[r, 22, 16]} />
      <meshStandardMaterial {...material} />
    </mesh>
  );
}

// Knuckle position and phalanx lengths per finger, index finger first. The index
// leads because the thumb is on +Y and the index sits next to it.
//
// Measured off an adult hand against a wrist width: the hand runs about 3.35
// wrist widths from the wrist crease to the middle fingertip, and the four fingers
// span about 1.1 of them across the knuckles. Getting these right matters more
// than it looks, because a hand drawn noticeably the wrong size makes a correctly
// aligned model read as slightly wrong.
const FINGERS = [
  { y: 0.33, knuckle: -1.7, lens: [0.65, 0.48, 0.35], r: [0.112, 0.098, 0.086], splay: 0.1 },
  { y: 0.01, knuckle: -1.76, lens: [0.72, 0.53, 0.38], r: [0.116, 0.101, 0.089], splay: 0.03 },
  { y: -0.3, knuckle: -1.72, lens: [0.65, 0.46, 0.34], r: [0.11, 0.095, 0.084], splay: -0.05 },
  { y: -0.58, knuckle: -1.63, lens: [0.52, 0.37, 0.3], r: [0.098, 0.084, 0.075], splay: -0.13 },
];

function Finger({ y, knuckle, lens, r, splay }: (typeof FINGERS)[number]) {
  // Each phalanx curls a little further toward the palm, which is -Z because +Z
  // is the back of the hand. A perfectly straight finger reads as a glove.
  const curls = [-0.16, -0.3, -0.42];
  const spread = [-0.03, 0.03, -0.05];
  const at: [number, number, number] = [knuckle, y, 0];
  const nodes: [number, number, number][] = [at];

  return (
    <group>
      {lens.map((len, i) => {
        const prev = nodes[i];
        const next: [number, number, number] = [
          prev[0] - len,
          prev[1] + (spread[i] ?? 0) + splay * (i === 0 ? 1 : 0.3),
          prev[2] + curls[i] * len,
        ];
        nodes.push(next);
        return <Limb key={i} a={prev} b={next} r={r[i]} />;
      })}
      {/* Knuckle, so the finger joins the palm as a joint rather than a seam. */}
      <Blob at={at} r={r[0] * 1.04} />
      {/* Joint swellings, which is what stops a finger reading as three sticks. */}
      {nodes.slice(1, -1).map((n, i) => (
        <Blob key={i} at={n} r={r[i + 1] * 1.02} />
      ))}
      {/* The nail, on the back of the distal phalanx. This is the detail that
          tells the seller which face of the hand they are looking at. */}
      <Blob
        at={dorsalPoint(nodes[2], nodes[3], { out: 0.05, back: 0.085 })}
        r={0.072}
        scale={[1.05, 0.72, 0.3]}
        material={NAIL}
      />
    </group>
  );
}

function Thumb() {
  // Out along +Y and forward along -X from the carpometacarpal joint, angled off
  // the palm the way a relaxed thumb sits rather than tucked in. The tip comes
  // back in slightly on the last phalanx, which is what stops the thumb reading
  // as a straight spike and is roughly where a relaxed thumb tip lands: past
  // the index knuckle, short of its middle joint.
  const cmc: [number, number, number] = [-0.34, 0.36, 0.02];
  const shaft: [number, number, number] = [-0.86, 0.68, 0.05];
  const prox: [number, number, number] = [-1.4, 0.86, 0.02];
  const dist: [number, number, number] = [-1.96, 0.8, -0.06];
  return (
    <group>
      <Limb a={cmc} b={shaft} r={0.145} />
      <Limb a={shaft} b={prox} r={0.122} />
      <Limb a={prox} b={dist} r={0.1} />
      <Blob at={cmc} r={0.15} />
      <Blob at={shaft} r={0.126} />
      <Blob at={prox} r={0.104} />
      <Blob at={dist} r={0.085} />
      <Blob at={dorsalPoint(prox, dist, { out: 0.046, back: 0.05 })} r={0.068} scale={[1.05, 0.72, 0.3]} material={NAIL} />
    </group>
  );
}

export function ReferenceHand() {
  return (
    <group>
      {/* Forearm, running off toward +X toward the elbow and swelling as it goes,
          because a forearm is wider at the elbow than at the wrist. */}
      <Limb a={[0.1, 0, 0]} b={[2.6, 0, 0]} r={0.5} depth={HAND_DEPTH} />
      {/* Wrist, very slightly narrower than the forearm above it. */}
      <Blob at={[0.02, 0, 0]} r={0.47} scale={[1, 1, HAND_DEPTH]} />

      {/* Palm, a flattened capsule so it has rounded sides and a slightly domed
          back rather than the flat faces a box would give. */}
      <Limb a={[-0.1, 0, 0]} b={[-1.64, 0, 0]} r={0.47} depth={HAND_DEPTH} />
      {/* Thenar eminence, the muscle at the base of the thumb, and the smaller
          hypothenar opposite it. Without these the palm reads as a slab. */}
      <Blob at={[-0.44, 0.33, 0.01]} r={0.3} scale={[1.15, 0.95, 0.72]} />
      <Blob at={[-0.48, -0.38, 0]} r={0.25} scale={[1.1, 0.9, 0.7]} />

      {FINGERS.map((f) => (
        <Finger key={f.y} {...f} />
      ))}
      <Thumb />
    </group>
  );
}
