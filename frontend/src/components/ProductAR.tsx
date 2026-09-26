import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  DefaultXRHand,
  XR,
  XRDomOverlay,
  XROrigin,
  XRSpace,
  createXRStore,
  useXRInputSourceStateContext,
  useXRInputSourceStates,
} from '@react-three/xr';
import { applyProductMaterials } from '../lib/modelMaterials';
import type { Material, ModelAlignment, ModelMaterial } from '../lib/types';
import { toWristAlignment, WRIST_WIDTH_METRES, type WristAlignment } from '../lib/wristAlignment';

interface ProductARProps {
  modelUrl: string;
  material?: Material;
  modelMaterials?: ModelMaterial[];
  alignment?: ModelAlignment | null;
  revision?: string | number;
  onExit: () => void;
}

interface ArShared {
  fetchUrl: string;
  material?: Material;
  modelMaterials?: ModelMaterial[];
  alignment: WristAlignment;
  scale: { current: number };
}

const WATCH_TARGET_METERS = 0.1;
const FLOAT_POSITION: [number, number, number] = [0, -0.18, -0.55];

// Maps the canonical wrist frame onto the WebXR `wrist` space, so that an
// alignment saved on the align page means the same thing here as it does in the
// camera-overlay try-on.
//
// This is the one line in the feature that has not been confirmed against a real
// device, because the MediaPipe frame this codebase is built around is not the
// same convention as the WebXR one and neither can be derived from the other
// without hardware. It is left as identity, which assumes the two agree, and
// isolated here so that correcting it is a one-line change rather than a hunt.
//
// To check it: align a model on the align page, open native AR, wear it, and turn
// your wrist. The watch should stay seated exactly as the align page showed it. If
// it is rotated by a fixed amount whatever the wrist does, that fixed amount is
// this constant.
const CANONICAL_TO_WRIST_SPACE = new THREE.Quaternion();

const arShared: ArShared = {
  fetchUrl: '',
  alignment: toWristAlignment(null),
  scale: { current: 1 },
};

export function ProductAR({ modelUrl, material, modelMaterials, alignment, revision, onExit }: ProductARProps) {
  arShared.fetchUrl = revision ? `${modelUrl}?v=${revision}` : modelUrl;
  arShared.material = material;
  arShared.modelMaterials = modelMaterials;
  arShared.alignment = toWristAlignment(alignment);

  const store = useMemo(
    () =>
      createXRStore({
        foveation: 0,
        frameRate: 'high',
        hand: WristHand,
      }),
    [],
  );

  const getState = useMemo(() => store.getState.bind(store), [store]);
  const xrState = useSyncExternalStore(store.subscribe, getState, getState);
  const inSession = xrState.session != null;
  const hasHands = xrState.inputSourceStates.some((state) => state.type === 'hand');

  const [hasEntered, setHasEntered] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    if (inSession) setHasEntered(true);
  }, [inSession]);

  useEffect(() => {
    let cancelled = false;
    store
      .enterAR()
      .then(() => undefined)
      .catch(() => {
        if (!cancelled) setEnterError('AR is not available on this device.');
      });
    return () => {
      cancelled = true;
      void store.getState().session?.end();
    };
  }, [store]);

  return (
    <div className="ar-layer">
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <XR store={store}>
          <XROrigin>
            <ambientLight intensity={0.7} />
            <directionalLight position={[1, 2, 1]} intensity={1.6} color="#ffffff" />
            <directionalLight position={[-1, 0, -1]} intensity={0.5} color="#c9a227" />
            <FloatingOrAnchored />
          </XROrigin>
          <XRDomOverlay className="ar-overlay" style={{ pointerEvents: 'none' }}>
            <div className="ar-scale-row">
              <label className="field">
                <span>Size</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={scaleFactor}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    arShared.scale.current = v;
                    setScaleFactor(v);
                  }}
                />
              </label>
              <output>{Math.round(scaleFactor * 100)}%</output>
            </div>
          </XRDomOverlay>
        </XR>
      </Canvas>
      <div className="ar-controls">
        {inSession ? (
          <>
            <p className="ar-hint">{hasHands ? 'Hold out your hand — the watch sits on your wrist.' : 'No hand tracked — the watch floats in front. Raise your hand to wear it.'}</p>
            <button type="button" className="ar-exit" onClick={() => void store.getState().session?.end()}>
              Exit AR
            </button>
          </>
        ) : (
          <div className="ar-start-panel">
            {enterError ? (
              <p className="ar-error" role="alert">{enterError}</p>
            ) : hasEntered ? (
              <p>AR session ended.</p>
            ) : (
              <p>Starting AR…</p>
            )}
            <button type="button" className="btn btn-primary" onClick={() => void store.enterAR()}>
              Start AR
            </button>
            <button type="button" className="btn btn-ghost" onClick={onExit}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WatchModel() {
  const { scene, materials } = useGLTF(arShared.fetchUrl);
  const scaled = useRef<THREE.Group>(null);
  const fit = useRef({ scale: 1 });

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    fit.current.scale = WATCH_TARGET_METERS / (maxDim || 1);
    scene.position.set(-center.x, -center.y, -center.z);
  }, [scene]);

  useFrame(() => {
    applyProductMaterials(scene, materials, arShared.material, arShared.modelMaterials);
    if (scaled.current) {
      // The seller's scale is the baseline, so the slider is a viewer trim on top
      // of a size somebody actually chose, not a replacement for one.
      scaled.current.scale.setScalar(fit.current.scale * arShared.alignment.scale * arShared.scale.current);
    }
  });

  return (
    <group ref={scaled}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Seats the watch in the WebXR wrist space using the seller's saved alignment,
 * which is stated in wrist widths, so the offset is converted to the metres this
 * tracker works in.
 *
 * This deliberately does not billboard. It used to, which meant the watch always
 * turned to face the lens and so never visibly got the orientation wrong, but it
 * also meant the wrist was not being tracked at all and a seller's alignment
 * would have been discarded without anyone noticing. A seated watch that is
 * subtly off is the thing this page is built to remove.
 */
function WristPlacement({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const align = arShared.alignment;

  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.quaternion.copy(CANONICAL_TO_WRIST_SPACE).multiply(align.quat);
    g.position.copy(align.offset).multiplyScalar(WRIST_WIDTH_METRES);
  }, [align]);

  return <group ref={ref}>{children}</group>;
}

function WristHand() {
  const state = useXRInputSourceStateContext();
  const isLeft = state.inputSource.handedness === 'left';
  return (
    <>
      <DefaultXRHand model={{ colorWrite: false }} />
      {isLeft && (
        <XRSpace space="wrist">
          <group position={[0, 0.015, 0]}>
            <WristPlacement>
              <WatchModel />
            </WristPlacement>
          </group>
        </XRSpace>
      )}
    </>
  );
}

function FloatingOrAnchored() {
  const inputs = useXRInputSourceStates();
  if (inputs.some((state) => state.type === 'hand')) return null;
  // No wrist to sit on, so there is nothing to align to. Here billboarding is not
  // a shortcut, it is the correct thing to do: the watch faces whoever is looking.
  return (
    <group position={FLOAT_POSITION}>
      <Billboard>
        <WatchModel />
      </Billboard>
    </group>
  );
}