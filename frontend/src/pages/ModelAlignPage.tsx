import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { api } from '../lib/api';
import { applyProductMaterials } from '../lib/modelMaterials';
import type { Material, ModelAlignment, ModelMaterial, Product } from '../lib/types';
import {
  eulerDegFromQuat,
  quatFromEulerDeg,
  WATCH_WIDTH_FACTOR,
  type WristAlignment,
} from '../lib/wristAlignment';

// ---------------------------------------------------------------------------
// The wrist frame. This is the contract between this page and the try-on view,
// and it is the whole reason the guessing could be deleted.
//
//   +X  up the forearm, toward the elbow
//   +Y  around the wrist
//   +Z  out of the back of the hand, where a dial faces
//
// Right handed, so X cross Y is Z. The seller turns their model into this frame
// once, here, and the try-on view then only has to answer "which way is the
// forearm, which way is the back of the hand", which the hand tracker genuinely
// knows. It never has to guess anything about the model again.
//
// Everything on this page is measured in wrist widths, the wrist being exactly
// 1.0 across. That is the unit the tracker measures a real wrist in, so a saved
// alignment fits any hand size without rescaling.
// ---------------------------------------------------------------------------

// The wrist is exactly 1.0 across, which is what makes these numbers wrist
// widths. Held as a named constant because the try-on view measures a real wrist
// in pixels and the two only agree if this stays pinned at 1.
const WRIST_RADIUS = 0.5;
// The largest dimension of a model is drawn this many wrist widths across, which
// is what makes the scale slider here mean the same thing it means on a wrist.
const NOMINAL_MODEL_WIDTH = WATCH_WIDTH_FACTOR;
// Just clear of the skin on a default wrist, so an unrotated model still sits
// somewhere sensible rather than inside the arm.
const DEFAULT_STANDOFF = 0.16;

type WorkTransform = WristAlignment;

function defaultTransform(): WorkTransform {
  return {
    quat: new THREE.Quaternion(),
    offset: new THREE.Vector3(0, 0, DEFAULT_STANDOFF),
    scale: 1,
  };
}

// The align page falls back to a default transform rather than to no transform,
// because it has a wrist in front of it to sit on. A renderer's fallback is the
// opposite, since there the absence of an alignment has to be visible.
function fromAlignment(saved?: ModelAlignment | null): WorkTransform {
  if (!saved) return defaultTransform();
  const quat = new THREE.Quaternion(saved.quatX, saved.quatY, saved.quatZ, saved.quatW);
  // A stored quaternion that lost its length would shear the model, so fall back
  // to no rotation rather than applying something meaningless.
  if (quat.length() < 0.5) return defaultTransform();
  return {
    quat: quat.normalize(),
    offset: new THREE.Vector3(saved.offsetX, saved.offsetY, saved.offsetZ),
    scale: saved.scale || 1,
  };
}

function toAlignment(t: WorkTransform): ModelAlignment {
  const q = t.quat.clone().normalize();
  return {
    quatX: q.x,
    quatY: q.y,
    quatZ: q.z,
    quatW: q.w,
    offsetX: t.offset.x,
    offsetY: t.offset.y,
    offsetZ: t.offset.z,
    scale: t.scale,
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Reference hand. Deliberately a plain stand-in rather than a realistic hand:
// its only job is to make "which way is the forearm" and "which way is the back
// of the hand" unmistakable at a glance.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The reference hand.
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
// Proportions are in wrist widths, the same unit the rest of the page uses. An
// adult hand is roughly 3.4 wrist widths from the wrist crease to the middle
// fingertip, and a wrist is distinctly wider than it is deep, so the hand is
// built elliptical rather than round on the Z axis.
//
// The thumb sits on +Y. That is the same handedness the previous box hand used,
// so this change makes the hand more realistic without silently swapping which
// side the thumb is on, which would quietly invalidate every alignment a seller
// had already saved against the old placeholder.
// ---------------------------------------------------------------------------

const SKIN = { color: '#d9b193', roughness: 0.74, metalness: 0 } as const;
const NAIL = { color: '#f0dcd0', roughness: 0.28, metalness: 0 } as const;
// How deep the hand is relative to its width. A wrist is about 1.25 times wider
// than it is thick, and the same roughly holds through the palm.
const HAND_DEPTH = 0.78;
const UP = new THREE.Vector3(0, 1, 0);
// Half turns, precomputed because the quick buttons use them as constants.
const QUARTER_TURN_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const QUARTER_TURN_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

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

function ReferenceHand() {
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

      {/* The watch band circle, sitting in the wrist. A torus lies in the XY plane
          with its hole along Z, so it is turned to encircle the forearm. */}
      <mesh position={[0.12, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[WRIST_RADIUS * 0.99, 0.022, 12, 64]} />
        <meshStandardMaterial color="#c99700" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

// The three frame axes, drawn and labelled in words rather than left as colours.
// The try-on view learned that lesson the hard way: red against green is the one
// pair a person cannot reliably tell apart.
function FrameAxes() {
  const arrows = useMemo(
    () =>
      ([
        ['X', 'up the forearm', new THREE.Vector3(1, 0, 0), '#ff453a', 2.1],
        ['Y', 'around the wrist', new THREE.Vector3(0, 1, 0), '#32d74b', 1.05],
        ['Z', 'out of the back of the hand', new THREE.Vector3(0, 0, 1), '#0a84ff', 0.95],
      ] as const).map(([axis, meaning, dir, color, reach]) => ({
        axis,
        meaning,
        color,
        tip: dir.clone().multiplyScalar(reach),
        helper: new THREE.ArrowHelper(dir, new THREE.Vector3(), reach * 0.82, color, 0.2, 0.11),
      })),
    []
  );

  return (
    <group>
      {arrows.map((a) => (
        <group key={a.axis}>
          <primitive object={a.helper} />
          <Html position={a.tip} center distanceFactor={6} zIndexRange={[20, 0]}>
            <span className="align-axis-tag" style={{ borderColor: a.color, color: a.color }}>
              {a.axis} &middot; {a.meaning}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// The seller's model, on the reference hand, turned by hand.
// ---------------------------------------------------------------------------

interface AlignedModelProps {
  url: string;
  revision?: string;
  material?: Material;
  modelMaterials?: ModelMaterial[];
  transform: WorkTransform;
  onTransform: (t: WorkTransform) => void;
  onDragChange: (dragging: boolean) => void;
}

function AlignedModel({ url, revision, material, modelMaterials, transform, onTransform, onDragChange }: AlignedModelProps) {
  const fetchUrl = revision ? `${url}?v=${revision}` : url;
  const { scene, materials } = useGLTF(fetchUrl);
  const group = useRef<THREE.Group>(null);
  const drag = useRef({ active: false, x: 0, y: 0 });
  const [nominalScale, setNominalScale] = useState(1);

  // Centre the model on its own bounding box and work out its size, the same
  // normalisation the try-on view does, so what is aligned here is what is worn.
  useLayoutEffect(() => {
    scene.position.set(0, 0, 0);
    scene.quaternion.identity();
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    scene.position.set(-center.x, -center.y, -center.z);
    setNominalScale(NOMINAL_MODEL_WIDTH / maxDim);
  }, [scene]);

  useEffect(() => {
    applyProductMaterials(scene, materials, material, modelMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, material, JSON.stringify(modelMaterials)]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.quaternion.copy(transform.quat);
    g.position.copy(transform.offset);
    g.scale.setScalar(nominalScale * transform.scale);
  }, [transform, nominalScale]);

  // Drag to turn. The rotation is applied in screen space, so the model follows
  // the cursor rather than the cursor sliding across its own axes, and the orbit
  // camera is held still for the duration so the two do not fight.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    drag.current = { active: true, x: e.clientX, y: e.clientY };
    onDragChange(true);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active || !group.current) return;
    e.stopPropagation();
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    const turn = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(dy * 0.012, dx * 0.012, 0, 'XYZ')
    );
    group.current.quaternion.premultiply(turn).normalize();
    onTransform({ ...transform, quat: group.current.quaternion.clone() });
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active) return;
    e.stopPropagation();
    drag.current.active = false;
    onDragChange(false);
  };

  return (
    <group ref={group}>
      <primitive object={scene} />
      {/* Generous invisible sphere so there is always something to grab, even when
          the model is small or edge-on. */}
      <mesh
        visible={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <sphereGeometry args={[0.75, 24, 16]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="viewer-loading" role="status">
        Loading model&hellip;
      </div>
    </Html>
  );
}

function NoModelFallback() {
  return (
    <Html center>
      <div className="align-empty">
        <p>
          <strong>No 3D model uploaded yet.</strong>
        </p>
        <p className="muted small">Upload a .glb on the product&rsquo;s edit page first, then come back here to align it.</p>
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ModelAlignPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [transform, setTransform] = useState<WorkTransform>(defaultTransform);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api
      .getProduct(slug)
      .then((res) => {
        setProduct(res.product);
        setTransform(fromAlignment(res.product.modelAlignment));
        setDirty(false);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const update = useCallback((t: WorkTransform) => {
    setTransform(t);
    setDirty(true);
    setNotice(null);
  }, []);

  const setRotationAxis = (index: 0 | 1 | 2, degrees: number) => {
    const deg = eulerDegFromQuat(transform.quat);
    deg[index] = degrees;
    update({ ...transform, quat: quatFromEulerDeg(deg) });
  };

  const setOffsetAxis = (index: 0 | 1 | 2, value: number) => {
    const offset = transform.offset.clone();
    offset.setComponent(index, value);
    update({ ...transform, offset });
  };

  // Both quick corrections multiply the alignment on the right, so they act in the
  // wrist frame rather than in screen space. A half turn about +Z spins the watch
  // within its own dial plane, which is what corrects dial text reading upside
  // down. A half turn about +X, the forearm axis, swings the dial onto the
  // opposite side of the wrist.
  const spinInDialPlane = () =>
    update({
      ...transform,
      quat: transform.quat.clone().multiply(QUARTER_TURN_Z).normalize(),
    });

  const turnOver = () =>
    update({
      ...transform,
      quat: transform.quat.clone().multiply(QUARTER_TURN_X).normalize(),
    });

  const save = async () => {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveModelAlignment(slug, toAlignment(transform));
      setProduct((p) => (p ? { ...p, modelAlignment: res.alignment } : p));
      setTransform(fromAlignment(res.alignment));
      setDirty(false);
      setNotice('Alignment saved. Buyers will see the model sitting exactly like this.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the alignment.');
    } finally {
      setSaving(false);
    }
  };

  const clearAlignment = async () => {
    if (!slug) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveModelAlignment(slug, null);
      setProduct((p) => (p ? { ...p, modelAlignment: res.alignment } : p));
      setTransform(fromAlignment(res.alignment));
      setDirty(false);
      setNotice('Alignment cleared. The model is back in its authored orientation.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear the alignment.');
    } finally {
      setSaving(false);
    }
  };

  const deg = eulerDegFromQuat(transform.quat);
  const hasSaved = Boolean(product?.modelAlignment);
  const aligned = hasSaved && !dirty;

  return (
    <div className="page container align-page">
      <nav className="breadcrumb">
        <Link to="/seller">Seller studio</Link>
        <span>/</span>
        {product ? (
          <>
            <Link to={`/seller/products/${product.slug}/edit`}>{product.name}</Link>
            <span>/</span>
            <span>Align on wrist</span>
          </>
        ) : (
          <span>Align on wrist</span>
        )}
      </nav>

      <header className="align-head">
        <div>
          <h1>Align on wrist</h1>
          <p className="muted">
            Turn the model until it sits on the hand the way a watch should: dial out of the back of the hand,
            band around the wrist, running down the forearm. Drag the model to turn it, then save.
          </p>
        </div>
        <div className="align-status">
          {aligned ? (
            <span className="align-badge is-saved">Saved</span>
          ) : hasSaved ? (
            <span className="align-badge is-dirty">Unsaved changes</span>
          ) : (
            <span className="align-badge">Never aligned</span>
          )}
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}

      <div className="align-layout">
        <div className="align-stage card">
          <Canvas dpr={[1, 2]} camera={{ position: [1.4, -3.3, 2.5], fov: 38 }} gl={{ antialias: true, alpha: true }}>
            <ambientLight intensity={0.55} />
            <directionalLight position={[3, 5, 4]} intensity={1.1} />
            <directionalLight position={[-4, -2, -3]} intensity={0.35} />
            <hemisphereLight args={['#ffffff', '#8a7a68', 0.4]} />

            <ReferenceHand />
            <FrameAxes />

            <Suspense fallback={loading ? null : <LoadingFallback />}>
              {product?.modelUrl ? (
                <AlignedModel
                  url={product.modelUrl}
                  revision={product.updatedAt}
                  material={product.material}
                  modelMaterials={product.modelMaterials}
                  transform={transform}
                  onTransform={update}
                  onDragChange={setDragging}
                />
              ) : (
                <NoModelFallback />
              )}
            </Suspense>

            <OrbitControls
              enabled={!dragging}
              enablePan={false}
              minDistance={1.4}
              maxDistance={9}
              target={[-0.25, 0, 0]}
            />
          </Canvas>

          <p className="align-stage-hint muted small">
            {dragging
              ? 'Turning the model. Release to let go.'
              : 'Drag the model to turn it. Drag the background to orbit the view.'}
          </p>
        </div>

        <aside className="align-panel">
          <section className="card">
            <div className="card-head">
              <h2>Turn</h2>
            </div>
            <p className="muted small">Dragging is the quickest way. These are the same three angles in degrees, for when you want to be exact.</p>
            <div className="align-field-grid">
              {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                <label key={axis} className="field">
                  <span>
                    {axis} <span className="muted small">deg</span>
                  </span>
                  <input
                    type="number"
                    step={1}
                    value={round3(deg[i])}
                    onChange={(e) => setRotationAxis(i as 0 | 1 | 2, Number(e.target.value) || 0)}
                  />
                </label>
              ))}
            </div>
            <div className="align-quick-row">
              {/*
                Two different corrections that are easy to confuse, so both are here
                and both say what they do.

                "Flip" spins the watch in its own dial plane, about the axis the
                dial looks out of. That is the one that fixes upside-down text: the
                dial is already facing the right way, the printing is just the
                wrong way round, and spinning it in place is the whole fix.

                "Turn over" moves the dial to the opposite side of the wrist, which
                is a different problem and a different axis entirely.

                Both rotate on the right of the alignment, so they act in the wrist
                frame rather than in screen space, which is what makes "spin it in
                place" mean the same thing no matter how the camera is orbited.
                Neither is a mirror. A watch is a real object and nothing about it
                is inside-out, so a negative scale would be the wrong tool: it
                would invert the normals and turn the model inside out with them.
              */}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => spinInDialPlane()}
                title="Spin the watch in its own plane, to make dial text the right way up"
              >
                Flip 180&deg;
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => turnOver()}
                title="Move the dial to the other side of the wrist"
              >
                Turn over
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Position</h2>
            </div>
            <p className="muted small">
              In wrist widths, so it fits any hand. <strong>+Z</strong> lifts the watch off the skin,{' '}
              <strong>+X</strong> slides it toward the elbow.
            </p>
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <label key={axis} className="align-slider">
                <span>
                  {axis} <span className="muted small">{round3(transform.offset.getComponent(i))}</span>
                </span>
                <input
                  type="range"
                  min={-1.5}
                  max={1.5}
                  step={0.01}
                  value={transform.offset.getComponent(i)}
                  onChange={(e) => setOffsetAxis(i as 0 | 1 | 2, Number(e.target.value))}
                />
              </label>
            ))}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Size</h2>
            </div>
            <label className="align-slider">
              <span>
                Scale <span className="muted small">{round3(transform.scale)}&times;</span>
              </span>
              <input
                type="range"
                min={0.4}
                max={2.5}
                step={0.01}
                value={transform.scale}
                onChange={(e) => update({ ...transform, scale: Number(e.target.value) })}
              />
            </label>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Save</h2>
            </div>
            <div className="align-actions">
              <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !product?.modelUrl}>
                {saving ? 'Saving…' : 'Save alignment'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => update(defaultTransform())} disabled={saving}>
                Reset
              </button>
              {hasSaved && (
                <button type="button" className="btn btn-ghost" onClick={clearAlignment} disabled={saving}>
                  Clear saved
                </button>
              )}
            </div>
            {product?.modelUrl && (
              <p className="muted small">
                Then check it on the product page with the AR button, on the rear camera.
              </p>
            )}
          </section>

          <details className="align-stored">
            <summary>Stored values</summary>
            <p className="muted small">What actually gets written, in the order it is stored.</p>
            <pre>
              {JSON.stringify(toAlignment(transform), null, 2)}
            </pre>
          </details>
        </aside>
      </div>
    </div>
  );
}
