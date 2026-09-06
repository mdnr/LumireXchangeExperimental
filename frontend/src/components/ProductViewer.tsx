import { Component, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { Material, ModelMaterial } from '../lib/types';

interface ProductViewerProps {
  modelUrl?: string | null;
  material?: Material;
  modelMaterials?: ModelMaterial[];
  variant?: { material?: Material; modelMaterials?: ModelMaterial[] } | null;
  revision?: string | number;
  category?: string;
  autoRotate?: boolean;
  className?: string;
}

const PLACEHOLDER_SCALE = 1.4;

export function ProductViewer({ modelUrl, material, modelMaterials, variant, revision, category = 'audio', autoRotate = true, className }: ProductViewerProps) {
  const activeMaterial = variant?.material ?? material;
  const activeModelMaterials = variant?.modelMaterials ?? modelMaterials;
  const [rotating, setRotating] = useState(autoRotate);
  return (
    <div className={className}>
      <Canvas dpr={[1, 2]} camera={{ position: [3, 2.2, 3], fov: 40 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} />
        <directionalLight position={[-4, 2, -4]} intensity={0.4} color="#c9a227" />
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2} position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
          <Lightformer intensity={1.2} position={[5, 1, 0]} scale={[6, 3, 1]} />
          <Lightformer intensity={0.6} position={[-5, 0, 0]} scale={[6, 3, 1]} />
        </Environment>

        <Suspense fallback={<LoadingFallback />}>
          <ModelErrorBoundary fallback={<PlaceholderModel category={category} material={activeMaterial} />}>
            {modelUrl ? (
              <LoadedModel url={modelUrl} material={activeMaterial} modelMaterials={activeModelMaterials} revision={revision} />
            ) : (
              <PlaceholderModel category={category} material={activeMaterial} />
            )}
          </ModelErrorBoundary>
        </Suspense>

        <ContactShadows position={[0, -PLACEHOLDER_SCALE - 0.05, 0]} opacity={0.35} scale={6} blur={2.4} far={4} />
        <OrbitControls
          autoRotate={rotating}
          autoRotateSpeed={1.6}
          enablePan={false}
          minDistance={2}
          maxDistance={8}
          target={[0, 0, 0]}
        />
      </Canvas>
      <button type="button" className="viewer-rotate-btn" onClick={() => setRotating((r) => !r)} aria-pressed={rotating}>
        {rotating ? '⏸ Pause spin' : '▶ Spin'}
      </button>
    </div>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="viewer-loading" role="status">Loading model…</div>
    </Html>
  );
}

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function LoadedModel({ url, material, modelMaterials, revision }: { url: string; material?: Material; modelMaterials?: ModelMaterial[]; revision?: string | number }) {
  // three.js caches by URL; replacing a file reuses the same /models/{slug}.glb URL,
  // so a revision query busts the cache and shows the new upload immediately.
  const fetchUrl = revision ? `${url}?v=${revision}` : url;
  const { scene, materials } = useGLTF(fetchUrl);

  useLayoutEffect(() => {
    recenter(scene);
  }, [scene]);

  useEffect(() => {
    applyMaterial(scene, material);
    applyMaterialPresets(materials, modelMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, material?.surfaceType, material?.color, material?.finish, material?.metalness, material?.roughness, material?.clearcoat, JSON.stringify(modelMaterials)]);

  return <primitive object={scene} />;
}

function recenter(obj: THREE.Object3D): void {
  // Reset first so the step is idempotent (StrictMode re-runs effects).
  obj.scale.set(1, 1, 1);
  obj.position.set(0, 0, 0);
  obj.rotation.set(0, 0, 0);

  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = PLACEHOLDER_SCALE / maxDim;
  obj.scale.setScalar(scale);
  obj.position.copy(center).multiplyScalar(-scale);
  obj.rotation.y = Math.PI / 4;
}

function applyMaterial(root: THREE.Object3D, material?: Material): void {
  if (!material) return;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        applyToMaterialInstance(m, material);
      }
    }
  });
}

function applyMaterialPresets(materialMap: Record<string, THREE.Material>, presets?: ModelMaterial[]): void {
  if (!presets || presets.length === 0) return;
  // Object.values preserves the GLB material order, matching the server's part indices.
  // Match by the GLB material name (so renaming a part label never breaks recolouring),
  // then fall back to position so unrenamed/older parts still land on the right slot.
  const slots = Object.values(materialMap);
  for (const preset of presets) {
    let target: THREE.Material | undefined;
    if (preset.label) target = slots.find((m) => m.name === preset.label);
    if (!target && preset.index != null) target = slots[preset.index];
    if (target) {
      applyToMaterialInstance(target, preset.material);
    }
  }
}

function applyToMaterialInstance(m: THREE.Material, material?: Material): void {
  if (!material) return;
  const mat = m as THREE.MeshStandardMaterial;
  mat.color.set(material.color);
  mat.metalness = material.metalness;
  mat.roughness = material.roughness;
  const physical = mat as THREE.MeshPhysicalMaterial;
  if (physical.clearcoat !== undefined) {
    physical.clearcoat = material.finish === 'chrome' ? 1 : material.clearcoat;
    if (material.finish === 'chrome') physical.metalness = Math.max(mat.metalness, 0.85);
  }
  mat.needsUpdate = true;
}

function applyMaterialToMaterial(material?: Material): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: material?.color ?? '#e8e8e8' });
  mat.metalness = material?.metalness ?? 0.2;
  mat.roughness = material?.roughness ?? 0.55;
  return mat;
}

function categoryToShape(category?: string): ShapeKind {
  switch ((category ?? '').toLowerCase()) {
    case 'wearables':
    case 'wearable':
    case 'watch':
      return 'wearable';
    case 'home':
    case 'lamp':
      return 'lamp';
    case 'speaker':
      return 'speaker';
    default:
      return 'audio';
  }
}

function PlaceholderModel({ category, material }: { category?: string; material?: Material }) {
  const [shape] = useState<ShapeKind>(() => categoryToShape(category));

  return (
    <group scale={PLACEHOLDER_SCALE} rotation-y={Math.PI / 4}>
      <PlaceholderGeometry shape={shape} material={material} />
    </group>
  );
}

type ShapeKind = 'audio' | 'wearable' | 'speaker' | 'lamp';

function PlaceholderGeometry({ shape, material }: { shape: ShapeKind; material?: Material }) {
  const [mat] = useState(() => applyMaterialToMaterial(material));
  const materialKey = JSON.stringify([
    material?.surfaceType,
    material?.color,
    material?.finish,
    material?.metalness,
    material?.roughness,
    material?.clearcoat,
  ]);

  useEffect(() => {
    const next = applyMaterialToMaterial(material);
    mat.color.copy(next.color);
    mat.metalness = next.metalness;
    mat.roughness = next.roughness;
    mat.needsUpdate = true;
  }, [materialKey]); // eslint-disable-line react-hooks/exhaustive-deps

  switch (shape) {
    case 'wearable':
      return (
        <group>
          <RoundedBox args={[1, 1, 0.34]} radius={0.12} smoothness={4} material={mat} position={[0, 0.35, 0]} />
          <mesh material={mat} position={[0, 1.15, 0]}>
            <boxGeometry args={[0.82, 1.2, 0.3]} />
          </mesh>
          <mesh material={mat} position={[0, -0.65, 0]}>
            <boxGeometry args={[0.82, 1.2, 0.3]} />
          </mesh>
        </group>
      );
    case 'speaker':
      return (
        <group>
          <mesh material={mat} position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.75, 0.75, 1.5, 48]} />
          </mesh>
          <mesh material={mat} position={[0, 0.98, 0]}>
            <cylinderGeometry args={[0.35, 0.5, 0.28, 48]} />
          </mesh>
        </group>
      );
    case 'lamp':
      return (
        <group>
          <mesh material={mat} position={[0, -0.65, 0]}>
            <cylinderGeometry args={[0.55, 0.62, 0.18, 48]} />
          </mesh>
          <mesh material={mat} position={[0, -0.1, 0]}>
            <boxGeometry args={[0.16, 1.1, 0.16]} />
          </mesh>
          <mesh material={mat} position={[0, 0.45, 0.65]}>
            <boxGeometry args={[0.6, 0.16, 0.85]} />
          </mesh>
        </group>
      );
    case 'audio':
    default:
      return (
        <group>
          <mesh material={mat} position={[0, 0.35, 0]}>
            <torusGeometry args={[1, 0.11, 16, 48, Math.PI]} />
          </mesh>
          <mesh material={mat} position={[-0.72, -0.25, 0]}>
            <boxGeometry args={[0.52, 0.9, 0.28]} />
          </mesh>
          <mesh material={mat} position={[0.72, -0.25, 0]}>
            <boxGeometry args={[0.52, 0.9, 0.28]} />
          </mesh>
        </group>
      );
  }
}