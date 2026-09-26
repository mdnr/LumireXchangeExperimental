import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { api } from '../lib/api';
import { applyProductMaterials } from '../lib/modelMaterials';
import { REFERENCE_HAND_CREDIT } from '../lib/referenceHand';
import type { Material, ModelAlignment, ModelMaterial, Product } from '../lib/types';
import {
  eulerDegFromQuat,
  quatFromEulerDeg,
  WATCH_WIDTH_FACTOR,
  type WristAlignment,
} from '../lib/wristAlignment';
import { ReferenceHand } from '../components/ReferenceHand';
import { ReferenceHandModel } from '../components/ReferenceHandModel';

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

// The wrist is exactly 1.0 across, which is what makes this page's numbers wrist
// widths. The bundled hand is scaled into that same unit in `lib/referenceHand.ts`,
// so the wrist on screen and the wrist the numbers describe are one and the same.
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

// Half turns, precomputed because the quick buttons use them as constants.
const QUARTER_TURN_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const QUARTER_TURN_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);


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
            Turn the model until it sits on the hand the way a watch should: dial out of the back of the
            hand, band around the wrist, running down the forearm. Drag the model to turn it, then save.
          </p>
          <ol className="align-steps">
            <li>Look at the watch on your own wrist. Note which way up the numbers are.</li>
            <li>Drag the model until the numbers read the same way round here.</li>
            <li>
              Still wrong side up? <strong>Flip 180&deg;</strong> fixes upside-down numbers.{' '}
              <strong>Turn over</strong> moves the dial to the other side of the wrist.
            </li>
            <li>Save, then check it on the product page with the AR button, on the rear camera.</li>
          </ol>
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

            <Suspense fallback={<ReferenceHand />}>
              <ReferenceHandModel />
            </Suspense>
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
          <p className="align-credit muted small">
            Reference hand: <strong>{REFERENCE_HAND_CREDIT.title}</strong> by {REFERENCE_HAND_CREDIT.author},{' '}
            <a href={REFERENCE_HAND_CREDIT.url} target="_blank" rel="noreferrer">
              {REFERENCE_HAND_CREDIT.licence}
            </a>
            . Shown to sellers only, to line a model up against a wrist.
          </p>
        </div>

        <aside className="align-panel">
          <section className="card">
            <div className="card-head">
              <h2>Turn</h2>
            </div>
            <p className="muted small">
              Dragging is the quickest way. These are the same three angles in degrees, for nudging a
              model that is nearly right or dialling in an exact value.
            </p>
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <label key={axis} className="align-slider">
                <span>
                  {axis} <span className="muted small">{round3(deg[i])}&deg;</span>
                </span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={deg[i]}
                  onChange={(e) => setRotationAxis(i as 0 | 1 | 2, Number(e.target.value))}
                />
              </label>
            ))}
            {/*
              Quarter-turn snaps. Most models that need turning at all need a clean
              quarter or half turn, because that is how watch dials are authored, so
              the common answers are one tap instead of dragging a slider to a number
              that is nearly always round.
            */}
            <div className="align-quick-row">
              {[-180, -90, 0, 90, 180].map((snap) => (
                <button
                  key={snap}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRotationAxis(1, snap)}
                  title={`Turn to ${snap} degrees about Y`}
                >
                  {snap}&deg;
                </button>
              ))}
            </div>
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
