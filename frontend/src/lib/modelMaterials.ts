import * as THREE from 'three';
import type { Material, ModelMaterial } from './types';

function applyToMaterialInstance(m: THREE.Material, material?: Material): void {
  if (!material) return;
  const mat = m as THREE.MeshStandardMaterial;
  mat.color.set(material.color);
  if (material.finish === 'chrome') {
    // Chrome is a pair, not a switch. Metalness alone is a brushed metal, and
    // the roughness was the half that mattered and the half that was missing:
    // 0.85 metal at roughness 0.45 is satin, which is why picking Chrome used
    // to produce no visible change even where the branch did run.
    mat.metalness = Math.max(material.metalness, 0.95);
    mat.roughness = Math.min(material.roughness, 0.08);
  } else {
    mat.metalness = material.metalness;
    mat.roughness = material.roughness;
  }
  // `isMeshPhysicalMaterial` rather than `clearcoat !== undefined`. The old
  // check was a duck-typed test for a property that only MeshPhysicalMaterial
  // has, so on every MeshStandardMaterial it was false and the whole block was
  // skipped: the Clear slider did nothing, and so did Chrome, because Chrome's
  // metalness lived inside the same skipped block. A model exported without
  // KHR_materials_clearcoat has no MeshPhysicalMaterial anywhere, so *every*
  // finish control was dead on it. pulse-smartwatch.glb is exactly that case,
  // which is how this stayed invisible for so long.
  const physical = mat as THREE.MeshPhysicalMaterial;
  if (physical.isMeshPhysicalMaterial) {
    physical.clearcoat =
      material.finish === 'chrome' ? Math.max(material.clearcoat, 0.6) : material.clearcoat;
    if (material.finish === 'chrome') physical.clearcoatRoughness = 0.05;
  }
  mat.needsUpdate = true;
}

/** Does this look ask for anything only a clear-coated material can do? */
function wantsClearcoat(material?: Material): boolean {
  return !!material && (material.clearcoat > 0 || material.finish === 'chrome');
}

/** Copy a standard material into a physical one, carrying the maps with it. */
function toPhysicalMaterial(src: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const dst = new THREE.MeshPhysicalMaterial();
  dst.name = src.name;
  dst.color.copy(src.color);
  dst.metalness = src.metalness;
  dst.roughness = src.roughness;
  dst.map = src.map;
  dst.normalMap = src.normalMap;
  dst.normalScale.copy(src.normalScale);
  dst.roughnessMap = src.roughnessMap;
  dst.metalnessMap = src.metalnessMap;
  dst.aoMap = src.aoMap;
  dst.lightMap = src.lightMap;
  dst.emissive.copy(src.emissive);
  dst.emissiveMap = src.emissiveMap;
  dst.emissiveIntensity = src.emissiveIntensity;
  dst.alphaMap = src.alphaMap;
  dst.envMap = src.envMap;
  dst.envMapIntensity = src.envMapIntensity;
  dst.transparent = src.transparent;
  dst.opacity = src.opacity;
  dst.side = src.side;
  dst.flatShading = src.flatShading;
  dst.vertexColors = src.vertexColors;
  dst.depthWrite = src.depthWrite;
  dst.toneMapped = src.toneMapped;
  return dst;
}

/**
 * Give the scene's materials a clear-coat capable class, when the seller has
 * asked for one.
 *
 * A clear coat is a second specular lobe with its own roughness, and there is no
 * way to fake it by moving metalness and roughness about on a MeshStandardMaterial.
 * So the only honest option is to swap the class. It is done here, once, keyed on
 * the original material so a material shared by several meshes is promoted once
 * and stays shared, and it is idempotent because an already-physical material is
 * left alone.
 *
 * The scene graph rather than `materialMap` is what gets walked, for the same
 * reason the preset matching reads it: the map is empty (see above) and these
 * are the instances actually being drawn.
 */
function promoteClearcoatMaterials(scene: THREE.Object3D, wanted: boolean): void {
  if (!wanted) return;
  const swaps = new Map<THREE.Material, THREE.Material>();
  const swap = (m: THREE.Material): THREE.Material => {
    const existing = swaps.get(m);
    if (existing) return existing;
    const std = m as THREE.MeshStandardMaterial;
    // isMeshStandardMaterial is true for MeshPhysicalMaterial too, so the
    // physical case has to be excluded explicitly or every pass would clone the
    // material again and throw the clear coat away. The two flags live on
    // different sides of the class hierarchy, so they are read off one type that
    // can carry both.
    const flags = m as THREE.Material & {
      isMeshStandardMaterial?: boolean;
      isMeshPhysicalMaterial?: boolean;
    };
    const promoted =
      flags.isMeshStandardMaterial && !flags.isMeshPhysicalMaterial ? toPhysicalMaterial(std) : m;
    swaps.set(m, promoted);
    return promoted;
  };
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(swap)
      : swap(mesh.material);
  });
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
  // Before the paint, and before the scene is read back for matching, because it
  // replaces the material objects and everything downstream has to see the new
  // ones rather than the ones that were there when the effect started.
  promoteClearcoatMaterials(
    scene,
    wantsClearcoat(material) || (modelMaterials ?? []).some((p) => wantsClearcoat(p.material)),
  );
  applyMaterialToScene(scene, material);
  // Dict first so its ordering still drives the index fallback, scene second to
  // pick up anything the dict missed.
  applyMaterialPresets({ ...materialMap, ...materialsFromScene(scene) }, modelMaterials);
}