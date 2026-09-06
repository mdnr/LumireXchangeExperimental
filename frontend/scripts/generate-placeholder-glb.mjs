// Generates placeholder GLB models for the seed products into the server's wwwroot/models/.
// Re-run anytime:  node scripts/generate-placeholder-glb.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// GLTFExporter uses browser-only FileReader/Blob; polyfill the bits we need in Node.
globalThis.FileReader = class FileReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../AgoraXchangeExperimental.Server/wwwroot/models');

const mat = (color, name) => new THREE.MeshStandardMaterial({
  color: new THREE.Color(color),
  metalness: 0.3,
  roughness: 0.45,
  name,
});

// palette: [hex, variantName] — one material per colour variant
const HEADPHONE_MATS = [mat('#2a2a2a', 'Onyx'), mat('#d4d4d4', 'Pearl'), mat('#8b5e3c', 'Walnut')];
const WATCH_MATS = [mat('#1a1a1a', 'Onyx'), mat('#e5e5e5', 'Pearl'), mat('#c9a227', 'Gold')];
const SPEAKER_MATS = [mat('#2b2b2b', 'Onyx'), mat('#e8e8e8', 'Pearl'), mat('#bcd0d8', 'Mist')];
const LAMP_MATS = [mat('#e8e8e8', 'Pearl'), mat('#1a1a1a', 'Onyx')];

function headphones() {
  const g = new THREE.Group();
  const [onyx, pearl, walnut] = HEADPHONE_MATS;

  const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 16, 48, Math.PI), onyx);
  band.position.set(0, 0.55, 0);
  band.rotation.z = Math.PI;

  const lCup = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.28), onyx);
  lCup.position.set(-0.7, -0.25, 0);
  lCup.rotation.y = 0.25;

  const rCup = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.28), pearl);
  rCup.position.set(0.7, -0.25, 0);
  rCup.rotation.y = -0.25;

  const lPad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 24), walnut);
  lPad.position.set(-1.0, -0.25, 0);
  lPad.rotation.z = -0.25;

  const rPad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 24), walnut);
  rPad.position.set(1.0, -0.25, 0);
  rPad.rotation.z = 0.25;

  g.add(band, lCup, rCup, lPad, rPad);
  return g;
}

function watch() {
  const g = new THREE.Group();
  const [onyx, pearl, gold] = WATCH_MATS;

  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 0.32), onyx);
  caseMesh.position.set(0, 0.2, 0);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.05), pearl);
  screen.position.set(0, 0.2, 0.2);

  const topBand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.2), onyx);
  topBand.position.set(0, 1.05, 0);

  const bottomBand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.2), gold);
  bottomBand.position.set(0, -0.58, 0);

  g.add(caseMesh, screen, topBand, bottomBand);
  g.rotation.x = -0.18;
  return g;
}

function speaker() {
  const g = new THREE.Group();
  const [onyx, pearl, mist] = SPEAKER_MATS;

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.4, 48), onyx);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.3, 48), mist);
  cap.position.set(0, 0.9, 0);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.12, 48), pearl);
  base.position.set(0, -0.76, 0);

  g.add(tube, cap, base);
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const [pearl, onyx] = LAMP_MATS;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.6, 0.16, 48), pearl);
  base.position.set(0, -0.72, 0);

  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), pearl);
  stem.position.set(0, -0.1, 0);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.9), onyx);
  blade.position.set(0, 0.5, 0.65);
  blade.rotation.x = -0.2;

  const shadeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.4, 32, 1, true), onyx);
  shadeMesh.position.set(0, 0.5, 1.15);
  shadeMesh.rotation.x = -0.2;

  g.add(base, stem, blade, shadeMesh);
  return g;
}

const models = [
  ['aurora-headphones', headphones()],
  ['pulse-smartwatch', watch()],
  ['echo-speaker', speaker()],
  ['lumen-table-lamp', lamp()],
];

const exporter = new GLTFExporter();

for (const [slug, scene] of models) {
  const data = await new Promise((resolve, reject) =>
    exporter.parse(
      scene,
      (gltf) => resolve(gltf),
      (err) => reject(err),
      { binary: true },
    ),
  );
  const file = path.join(outDir, `${slug}.glb`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, new Uint8Array(data));
  const bytes = data instanceof ArrayBuffer ? data.byteLength : data.length;
  console.log(`wrote ${path.relative(process.cwd(), file)} (${bytes} bytes)`);
}

console.log(`Done -> ${outDir}`);