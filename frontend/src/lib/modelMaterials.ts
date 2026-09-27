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
 * The materials the renderer will actually draw, read off the scene graph.
 *
 * `gltf.materials` is a convenience dictionary that GLTFLoader keys by material
 * name, and it is only a convenience. If it is missing, the per-part pass below
 * has nothing to match against and quietly recolours nothing while the base
 * paint still lands, which shows up as "AR ignores the colour I picked" and
 * nothing else: no error, no warning, just the wrong colour. Keying by name also
 * collapses two parts that share a name into a single entry, and the survivor is
 * then no longer at the GLB index its preset records. The scene graph has neither
 * problem, since it holds the exact instances being rendered.
 */
function materialsFromScene(scene: THREE.Object3D): Record<string, THREE.Material> {
  const found: Record<string, THREE.Material> = {};
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && m.name) found[m.name] = m;
    }
  });
  return found;
}

/**
 * Paint individual GLB parts with their saved looks. Matches by the immutable
 * GLB material name (glbName) so renaming a part label never breaks recolouring.
 * Falls back to the label only for records written before glbName existed, then
 * to the GLB position as a last resort.
 */
export function applyMaterialPresets(materialMap: Record<string, THREE.Material>, presets?: ModelMaterial[]): void {
  if (!presets || presets.length === 0) return;
  // Defensive: this used to be `Object.values(materialMap)`, which threw a
  // TypeError on a missing map. The throw happened *after* the base paint had
  // already landed, so the effect died half-applied and the product silently
  // rendered in the base colour. An unmatched part is recoverable; a thrown
  // exception in the middle of a paint is not.
  const slots = Object.values(materialMap ?? {});
  const unmatched: string[] = [];
  for (const preset of presets) {
    let target: THREE.Material | undefined;
    const matcher = preset.glbName?.trim() || preset.label?.trim();
    if (matcher) target = slots.find((m) => m.name === matcher);
    if (!target && preset.index != null) target = slots[preset.index];
    if (target) {
      applyToMaterialInstance(target, preset.material);
    } else {
      unmatched.push(matcher || `#${preset.index}`);
    }
  }
  // A part that matched nothing used to be indistinguishable from one that
  // matched and painted the right colour, which is how a broken per-part pass
  // stays invisible until someone looks at a phone screen.
  if (unmatched.length && import.meta.env.DEV) {
    console.warn(
      `[modelMaterials] ${unmatched.length}/${presets.length} per-part materials matched nothing: ` +
        unmatched.slice(0, 8).join(', ') + (unmatched.length > 8 ? ', ...' : '')
    );
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
  // Dict first so its ordering still drives the index fallback, scene second to
  // pick up anything the dict missed.
  applyMaterialPresets({ ...materialMap, ...materialsFromScene(scene) }, modelMaterials);
}