import * as THREE from 'three';
import type { Material, ModelMaterial } from './types';

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

/** Paint every mesh in the scene with the base material. */
export function applyMaterialToScene(root: THREE.Object3D, material?: Material): void {
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

/**
 * Paint individual GLB parts with their saved looks. Matches by the immutable
 * GLB material name (glbName) so renaming a part label never breaks recolouring.
 * Falls back to the label only for records written before glbName existed, then
 * to the GLB position as a last resort.
 */
export function applyMaterialPresets(materialMap: Record<string, THREE.Material>, presets?: ModelMaterial[]): void {
  if (!presets || presets.length === 0) return;
  const slots = Object.values(materialMap);
  for (const preset of presets) {
    let target: THREE.Material | undefined;
    const matcher = preset.glbName?.trim() || preset.label?.trim();
    if (matcher) target = slots.find((m) => m.name === matcher);
    if (!target && preset.index != null) target = slots[preset.index];
    if (target) {
      applyToMaterialInstance(target, preset.material);
    }
  }
}

/** Base paint, then per-part looks — the same order the regular 3D viewer uses. */
export function applyProductMaterials(
  scene: THREE.Object3D,
  materialMap: Record<string, THREE.Material>,
  material?: Material,
  modelMaterials?: ModelMaterial[],
): void {
  applyMaterialToScene(scene, material);
  applyMaterialPresets(materialMap, modelMaterials);
}