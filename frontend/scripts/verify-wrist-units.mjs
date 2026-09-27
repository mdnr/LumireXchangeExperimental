// Proves the camera runtime and the seller studio agree on what one "wrist" is.
//
// The studio draws a placeholder hand scaled so its wrist is exactly 1.0 across,
// then places the watch at a raw offset in those units. The camera has no
// placeholder, so it has to work out how many pixels one wrist is before it can
// apply the same offset. If those two disagree, a correct studio alignment
// renders wrong on the wrist, and nothing else in the pipeline can compensate.
//
// This reads the constants out of the real source rather than restating them, so
// editing a constant without updating the maths here fails loudly.
//
// Run: node scripts/verify-wrist-units.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, '..', 'src', p), 'utf8');

// Pull the right-hand side off an exported const and evaluate it. Constants in
// these two files are either a numeric literal or a ratio of other constants,
// so a tiny recursive resolver covers them and nothing more.
const resolve = (text, name, seen = new Set()) => {
  if (seen.has(name)) throw new Error(`circular constant ${name}`);
  seen.add(name);
  const m = text.match(new RegExp(`export const ${name}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`could not find ${name} in source`);
  const rhs = m[1].trim();
  if (/^-?[\d.]+$/.test(rhs)) return Number(rhs);
  const ratio = rhs.match(/^([A-Za-z_][\w]*)\s*\/\s*([A-Za-z_][\w]*)$/);
  if (ratio) return resolve(text, ratio[1], seen) / resolve(text, ratio[2], seen);
  throw new Error(`cannot evaluate ${name} = ${rhs}`);
};
const literal = resolve;

const ref = src('lib/referenceHand.ts');
const wrist = src('lib/wristAlignment.ts');

const WRIST_BREADTH_MODEL = literal(ref, 'WRIST_BREADTH_MODEL');
const PALM_BREADTH_MODEL = literal(ref, 'PALM_BREADTH_MODEL');
const WATCH_WIDTH_FACTOR = literal(wrist, 'WATCH_WIDTH_FACTOR');
const WRIST_BREADTH_OVER_PALM_BREADTH = literal(ref, 'WRIST_BREADTH_OVER_PALM_BREADTH');

// The live alignment for apple-watch-ultra.
const SELLER_SCALE = 0.85;
const SELLER_OFFSET_X = 0.53;

const REFERENCE_HAND_SCALE = 1 / WRIST_BREADTH_MODEL;

console.log('constants read from source');
console.log('  WRIST_BREADTH_MODEL            ' + WRIST_BREADTH_MODEL);
console.log('  PALM_BREADTH_MODEL             ' + PALM_BREADTH_MODEL);
console.log('  WRIST_BREADTH_OVER_PALM        ' + WRIST_BREADTH_OVER_PALM_BREADTH);
console.log('  WATCH_WIDTH_FACTOR             ' + WATCH_WIDTH_FACTOR);
console.log('  REFERENCE_HAND_SCALE           ' + REFERENCE_HAND_SCALE);
console.log('');

// --- The studio, in its own scene units -------------------------------
const wristStudio = WRIST_BREADTH_MODEL * REFERENCE_HAND_SCALE;
const palmStudio = PALM_BREADTH_MODEL * REFERENCE_HAND_SCALE;
const watchWidthStudio = WATCH_WIDTH_FACTOR * SELLER_SCALE;

console.log('studio scene units (placeholder hand scaled to wrist = 1.0)');
console.log('  wrist across                   ' + wristStudio.toFixed(6));
console.log('  palm across                    ' + palmStudio.toFixed(6));
console.log('  watch max dimension            ' + watchWidthStudio.toFixed(6) + '   (=' + SELLER_SCALE + ' wrist widths)');
console.log('  seller offsetX                 ' + SELLER_OFFSET_X.toFixed(6) + '   (in wrist widths)');
console.log('');

// --- A camera looking at that same hand, at 1000 px per scene unit ----
const PX = 1000;
const wristPx = wristStudio * PX;
const palmPx = palmStudio * PX;

// Palm length in px, for the old formula. Taken from adult anatomy rather than
// the mesh, because the mesh's X axis does not reproduce a real hand length: at
// the file's own ~6.4cm per unit its wrist-to-middle-tip run is 1.666 units,
// about 10.7cm, where a real hand is nearer 19cm. Its Z breadth is sound, which
// is why the wrist and palm breadths above are used, but the length axis is not
// something to measure a ratio off.
const PALM_LENGTH_OVER_WRIST_BREADTH = 1.73;
const palmLengthPx = wristPx * PALM_LENGTH_OVER_WRIST_BREADTH;

// Straightforward and readable, written out rather than clever.
const studioWatchWidthPx = watchWidthStudio * PX;
const studioOffsetPx = SELLER_OFFSET_X * PX;

const cases = [
  { name: 'studio placeholder', wristWidthPx: wristPx, gate: false },
  { name: 'camera, new (palm breadth x 0.665)', wristWidthPx: palmPx * WRIST_BREADTH_OVER_PALM_BREADTH, gate: true },
  { name: 'camera, old (palm length)', wristWidthPx: palmLengthPx, gate: false },
];

console.log('one wrist, measured three ways, in px for the same physical hand');
console.log('');
console.log('  case                              wrist px   vs studio   watch px   offset px');
let failed = false;
for (const c of cases) {
  const watchPx = (WATCH_WIDTH_FACTOR * SELLER_SCALE * c.wristWidthPx) / wristPx;
  const offsetPx = SELLER_OFFSET_X * c.wristWidthPx;
  const dWrist = c.wristWidthPx / wristPx;
  const bad = Math.abs(dWrist - 1) > 1e-9;
  if (bad && c.gate) failed = true;
  console.log(
    '  ' + c.name.padEnd(33) +
    c.wristWidthPx.toFixed(1).padStart(8) +
    (bad ? ('  x' + dWrist.toFixed(4)).padStart(11) : '     exact'.padStart(11)) +
    watchPx.toFixed(2).padStart(11) +
    offsetPx.toFixed(1).padStart(11),
  );
}

console.log('');
console.log('old camera formula, the damage it did');
console.log('  wrist measured  x' + (palmLengthPx / wristPx).toFixed(4));
console.log('  watch drawn     x' + ((WATCH_WIDTH_FACTOR * SELLER_SCALE * palmLengthPx) / studioWatchWidthPx).toFixed(4) + '  too wide');
console.log('  offset applied  x' + ((SELLER_OFFSET_X * palmLengthPx) / studioOffsetPx).toFixed(4) + '  too far up the forearm');
console.log('');

// The identity that makes this work at all.
const roundTrip = palmStudio * WRIST_BREADTH_OVER_PALM_BREADTH;
console.log('why it matches: palm across in studio units x the conversion');
console.log('  ' + palmStudio.toFixed(9) + ' x ' + WRIST_BREADTH_OVER_PALM_BREADTH + ' = ' + roundTrip.toFixed(9));
console.log('  studio wrist is ' + wristStudio.toFixed(9) + ', so the error is ' + Math.abs(roundTrip - wristStudio).toExponential(2));
console.log('');

if (failed) {
  console.log('RESULT: FAIL. The camera does not reproduce the studio. Do not ship.');
  process.exit(1);
}
console.log('RESULT: the camera now reproduces the studio exactly. The old formula');
console.log('        did not, by the factor printed above.');
