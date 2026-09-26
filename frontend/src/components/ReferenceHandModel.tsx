import { useLayoutEffect, useMemo, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  NAIL_PLACEMENT,
  REFERENCE_HAND_ROTATION_X,
  REFERENCE_HAND_SCALE,
  REFERENCE_HAND_URL,
  WRIST_CENTRE_MODEL,
  nailPlacement,
  type NailPlacement,
} from '../lib/referenceHand';

// The reference hand, from a real anatomical model.
//
// Everything about placing it in the wrist frame is derived in
// `lib/referenceHand.ts` from measurements of the file, so nothing here is
// tuned by eye. What this component does is the mechanical part: put the model
// in the frame at the right size and origin, give it a skin, and hang the
// fingernails off the rig's own bones.

const SKIN = { color: '#d8b193', roughness: 0.72, metalness: 0 } as const;
const NAIL = { color: '#f2e0d4', roughness: 0.3, metalness: 0 } as const;

/** The back of the hand in the asset's own space, before the frame rotation. */
const DORSAL_IN_MODEL_SPACE = new THREE.Vector3(0, 1, 0);

interface Nail {
  key: string;
  placement: NailPlacement;
}

function useNails(scene: THREE.Object3D): Nail[] {
  // Reading the bones' world matrices has to happen before this component adds
  // its own transform on top, because the placement is done in the asset's space
  // and then carried through the same rotation and scale as the hand. Reading
  // them after would mean undoing that transform again, and the numbers below
  // are only correct in the asset's own units.
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    const nails: Nail[] = [];
    for (const spec of NAIL_PLACEMENT) {
      const bone = scene.getObjectByName(spec.bone);
      const parent = bone?.parent;
      if (!bone || !parent) continue;
      const tip = bone.getWorldPosition(new THREE.Vector3());
      const joint = parent.getWorldPosition(new THREE.Vector3());
      const dir = tip.clone().sub(joint);
      const phalanxLength = dir.length();
      if (phalanxLength < 1e-6) continue;
      nails.push({
        key: spec.bone,
        placement: nailPlacement(dir, DORSAL_IN_MODEL_SPACE, spec, phalanxLength),
      });
    }
    return nails;
  }, [scene]);
}

export function ReferenceHandModel() {
  const { scene } = useGLTF(REFERENCE_HAND_URL);
  const nails = useNails(scene);
  const [skin, setSkin] = useState<THREE.Material | null>(null);
  const [nailMat, setNailMat] = useState<THREE.Material | null>(null);

  // The asset ships an untextured default material, which renders as bare grey
  // and makes a hand look like a mannequin. One shared skin material is built
  // here and pushed onto every mesh rather than declared in JSX, because the
  // meshes come from the loader and are not ours to render.
  useLayoutEffect(() => {
    const material = new THREE.MeshStandardMaterial(SKIN);
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material;
    });
    setSkin(material);
    return () => material.dispose();
  }, [scene]);

  useLayoutEffect(() => {
    if (!skin) return;
    const material = new THREE.MeshStandardMaterial(NAIL);
    setNailMat(material);
    return () => material.dispose();
  }, [skin]);

  // The scale is uniform and the rotation is a half turn about X, so the group
  // carries both and the inner group carries only the shift that puts the wrist
  // centre on the origin. The page measures everything in wrist widths, so the
  // wrist sitting exactly on the origin is what makes a number typed here mean
  // the same thing on any hand.
  const inner = useMemo(
    () => WRIST_CENTRE_MODEL.clone().multiplyScalar(-1),
    [],
  );

  return (
    <group rotation={[REFERENCE_HAND_ROTATION_X, 0, 0]} scale={REFERENCE_HAND_SCALE}>
      <group position={inner.toArray()}>
        <primitive object={scene} />
        {nails.map(({ key, placement }) => (
          <mesh
            key={key}
            position={placement.position}
            quaternion={placement.quaternion}
            scale={placement.half}
            material={nailMat ?? undefined}
            castShadow
          >
            <sphereGeometry args={[1, 20, 14]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
