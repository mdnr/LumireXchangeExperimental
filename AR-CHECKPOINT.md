# AR Wrist Watch - Checkpoint Notes

## Resume here

State as of `e415df9`, pushed to `origin/dotnet-vite-app`. Live site
https://mdnr.alwaysdata.net, serving `index-DcGFttxE.js` /
`ProductARScan-B4GYs2SA.js` / `ProductViewer-Bzm8dcEn.js` /
`ProductAR-CR-1sGx5.js`. Deployed and verified: the served
`ProductARScan-B4GYs2SA.js` is byte identical to the build, SHA-256
`2B4A744CDD1DA1E29AA7801D8D8E17B55634CBB069BD2FB874779BA1C43354C0`.

The last commit is a verification script only, so the deployed build is the one
produced by `bd0c1c5` and the asset names are unchanged by it.

### Open items, in the order they are worth doing

1. **Ask the user to retest placement.** The wrist-unit fix is live and proved
   against the studio, but nobody has looked at it on a phone. `apple-watch-ultra`,
   rear camera, **left hand**, hard refresh. This is the only thing gating the
   next decision, and every one of the last four sessions was decided on a
   device observation rather than a derivation.
2. **Restart Alwaysdata for Clear.** Admin panel only, not SSH. Then confirm
   `curl -s https://mdnr.alwaysdata.net/api/products/pulse-smartwatch | findstr transparency`
   returns `"transparency":0`.
3. **Register the SSH key** so deploys stop needing a password, and rotate the
   password, which has now been shared in chat more than once.
4. **Occluder check on device.** The proxies were authored in wrist widths and
   the unit they are multiplied by is now correct, so they should be sound, but
   that has never been seen on a wrist.
5. **DeepAR-style hand mesh.** Still not started. The current occluders are
   analytic proxies, not a landmark-driven mesh, so this is the real gap between
   what exists and what the user described wanting.
6. **Native WebXR** `CANONICAL_TO_WRIST_SPACE` remains unverified on hardware
   and is unaffected by all of the above.

Everything below this block is background. The "Repo state right now" section
further down predates the material work and is kept only as history.

### Ask the user to retest placement

Two placement bugs are now fixed and both were unit or basis errors rather than
a wrist frame problem. The frame has been correct since `3326fc4`; three
sessions spent on it were chasing the wrong thing. See "The offset was being
rotated by the seller's own rotation" and "The wrist width was a palm length"
below. Frontend only, no restart.

`apple-watch-ultra`, rear camera, **left hand**. Hard refresh first: every asset
name is new, so a cached bundle is the likeliest way to see a result that is
already fixed.

The watch will also render about **1.75x smaller** than it did, which is correct
and not a second bug: the old build was drawing a wrist width at palm length.
If it lands in the right place but looks the wrong size, that is the seller's
`scale` in the studio, not this constant.

If it is still off, report *which* of these, because they are not
interchangeable and the previous sessions each assumed a different one:

- position wrong, orientation right -> the offset/rotation split, or the unit
  the offset is multiplied by
- position and orientation both wrong -> the wrist frame
- right at first lock, drifts after -> the smoothing on `anchor`/`armDir`
- changes with how the wrist is held at first lock -> a camera-relative sign


### For Clear, there is exactly one thing left to do and it is not a code change

**Restart the site in the Alwaysdata admin panel.** Then the migration runs at
startup, adds `Material_Transparency`, and the Clear slider starts working.

Until that restart the backend on disk is current but the *running process* is
not, so `GET /api/products/pulse-smartwatch` still answers without a
`transparency` key and the API silently drops the field on save. The Clear slider
is therefore inert, not broken. Confirm with:

```
curl -s https://mdnr.alwaysdata.net/api/products/pulse-smartwatch | findstr transparency
```

`JsonSerializerDefaults.Web` omits nulls but **not** zeros, so a working
deployment shows `"transparency":0` even for a product nobody has touched. If
that string is missing, the restart has not happened.

Rollback, should the restart surface a problem: the pre-upload DLL is at
`%TEMP%\opencode\server-dll.bak` (193536 bytes). Put it back and restart again.

### Deploying needs a password, the key is not registered

`upload-alwaysdata.ps1` prefers `~/.ssh/id_ed25519_alwaysdata` whenever that file
exists, and it is **not** registered with Alwaysdata. So the default invocation
fails immediately under `BatchMode=yes` with "Permission denied
(publickey,...)", and it prints the full list of `put` lines *before* it
connects, which makes it look like the upload ran. It did not. Check the live
`index.html` for the new hash before believing any of it.

The working path is `-ForcePassword` with the password in
`%TEMP%\opencode\ad-pass.txt`, which the script deletes afterwards. Ask the
user for it in chat rather than assuming it is cached. The public key to
register instead, which is the better fix, is in
`%USERPROFILE%\.ssh\id_ed25519_alwaysdata.pub`:
`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ4lZ7HTevoicpZ7bJgkmjB9RTsma2psojjZV5RAaiON`

The password has now been shared in chat more than once and should be rotated.


### What is already live and testable without any restart

Two occluders are frontend only, so both are on the site right now. The forearm
capsule hides the back strap inside the watch, and a second broad flat proxy
covers the hand, so the watch reads as worn rather than floating.

Test `apple-watch-ultra` in camera AR before restarting anything, since that is
the only product with a saved alignment.

Two numbers, both in `ProductARScan.tsx`, and neither needs the server:

- `OCCLUDER_R` is `0.47` for the forearm. Too small and the strap leaks, too
  big and the case loses a rim or a bite out of the dial.
- `HAND_BREADTH` is `1.36` and `HAND_THICKNESS` is `0.56` for the hand. Too
  small and the watch draws over the knuckles, too big and the mask eats the
  case.

One number, one redeploy, no server involvement.

### Deploy mechanics that were wrong here and cost real time

`upload-alwaysdata.ps1` uploads **only `publish/wwwroot`**. It is a static-files
uploader. It has never shipped a line of backend code, and the backend on the
server was still the Sep 26 build until this session. A frontend-only deploy
looking perfectly healthy is not evidence that a server change shipped.

When the backend does need to ship:

- The app directory is `/home/mdnr/www/`, and the DLLs sit **directly** in it.
  Only `Server.dll`, `Server.pdb` and
  `Server.staticwebassets.endpoints.json` change for a code-only change; compare
  local and remote sizes before uploading anything.
- Upload as `put` to a dotted temp name then `rename` over the target. `put`
  truncates in place, and a failure there leaves a corrupt DLL that only breaks
  on the *next* restart. The rename is atomic and leaves the running process on
  its old inode.
- Never upload `appsettings*.json` and never upload `app.db`. There is no `app.db`
  in the publish output, so the production database is safe from a publish
  upload, but the config is worth leaving alone deliberately.
- The restart itself can only be done from the admin panel. There is no API for
  it, so every backend deploy ends with asking the user.

### Still unverified, and unfixable from here

- Whether `0.47` is the right radius. Only the user's phone can say.
- Native WebXR `CANONICAL_TO_WRIST_SPACE` in `ProductAR.tsx`. No supported
  hardware here. The camera path and the native path have diverged for a long
  time and only the camera path has been tested.
- Alwaysdata SSH key registration, and rotating the account password, which has
  been exposed in this conversation and in shell history. Both are admin-panel
  jobs.

### Dead code, do not go looking for it in the browser

`MaterialEditor.tsx` is the component that looks like the base-material editor and
nothing imports it. The live material controls are the per-part sliders inside
`ProductFormPage`. It has been kept consistent with the rest rather than deleted.

---

Checkpoint tag: `ar-metric3d-checkpoint` (at commit `2e6c2c2`)
Orientation-fixed tag: `ar-facing-fixed` (at commit `fc564fa`)
Live site: https://mdnr.alwaysdata.net

## Repo state right now

- Branch `master`, published to the remote as `dotnet-vite-app`. The remote's
  `master` is an unrelated Next.js project and must never be pushed to.
  - `ar-alignment-seller-set` -> `205016e`, the seller alignment work
  - `ar-reference-hand` -> `e15aa93`, the rigged reference hand, no bangle,
    rotation sliders. **This is what is live.**
- Deployed: `e15aa93` as `index-C8LPQc_P.js` / `index-BwFrOMB7.css`.
- **Dial faces the camera, confirmed by the user on a real device**, back of
  hand to the lens.
- **Rotation direction confirmed correct on the rear camera.** It only looked
  inverted on the selfie preview, which is mirrored. Do not "fix" this.

### Only one product has a saved alignment, so it is the only valid test subject

Read off the live API, not assumed. `GET /api/products` then `GET
/api/products/{slug}` per product, reading the public `modelAlignment` field:

| product | has a model | saved alignment |
| --- | --- | --- |
| `apple-watch-ultra` | yes | **yes** |
| `pulse-smartwatch` | yes | **no** |
| `lumen-table-lamp` | yes | no |
| `echo-speaker` | yes | no |
| `aurora-headphones` | yes | no |

This matters because **`pulse-smartwatch` has never been aligned**, and it is the
model every axis measurement in this file was taken from. Putting *it* through
the try-on renders the watch in its authored orientation with no alignment
applied at all, which looks broken and has nothing to do with the camera path.
`?ar-debug` says `NONE (seller has not aligned this)` in exactly that case. Test
with `apple-watch-ultra`, and treat "unaligned product looks wrong" as the
expected, already-understood behaviour rather than as a new fault.

The stored `apple-watch-ultra` alignment, for reference:

```
quat    (0.000, 0.216, 0.976, 0.000)   length 0.9997, normalizes
offset  (0.37, -0.10, 0.07)            wrist widths
scale   1.00
```

That is very nearly a half turn about the `(0, 0.216, 0.976)` axis, i.e. mostly
about `+Z`, which is the align page's "Flip 180" applied to a model authored dial
down. It is a plausible value, which is worth stating because it means a wild
result on the device is not explained by a corrupt stored alignment.

### The wrist frame, and why nothing infers orientation any more

`+X` up the forearm, `+Y` around the wrist, `+Z` out of the back of the hand.
Both renderers measure all three, so `watchQuat = wristBasis * savedAlignment` is
exact by construction. The bounding-box axis inference and the spin, facing and
tilt trims are gone and must not come back.

`+Y` is the thumb side. The bundled hand puts its thumb there, and the
fingernails are the one unambiguous way to tell the back of the hand from the
palm, so they are the load-bearing detail of the whole page.

### The reference hand

Bundled from Poly Pizza, CC BY, credited on the align page and in
`frontend/public/ASSETS.md`. It is placed by measurements taken from the file,
not by eye: a half turn about X, scale `1 / 0.9061` for the wrist breadth in the
file, and the wrist centre subtracted so the wrist sits on the origin the page's
numbers are measured from. Those constants live in
`frontend/src/lib/referenceHand.ts` and the reasoning is in the commit message
for `e15aa93`.

Known limitation: the model is 2.88 wrist widths from wrist to middle fingertip
where an adult is nearer 3.4, so it reads slightly small. Every directional cue
is correct, which is what the page needs.

**Reviewed by eye on the live site and accepted by the user.** The hand reads
better than the capsule version it replaced. What has *not* been retested since
this change is the camera path: the align page was checked, but no product has
been put through the rear-camera try-on with the new setup, so treat
`ProductARScan` and `ProductAR` as untested against current sellers' saved
alignments. A seller's alignment saved against the old placeholder hand is still
valid, because the thumb stayed on +Y, but that has not been confirmed on a
device either.

To return to the earlier checkpoint:

```
git checkout ar-metric3d-checkpoint
```

Better: branch off it so the checkpoint stays put.

```
git switch -c ar-facing-fix ar-metric3d-checkpoint
```

## Symptom history, so it is not re-derived

1. Watch never rotated with the wrist, and was pinned facing the camera.
2. First attempt used MediaPipe image landmarks + a fade. Rejected, the user did
   not want transparency.
3. Second attempt used a depth-only forearm proxy to occlude. Rejected, it
   clipped the watch.
4. Rolled the wrist basis off `landmarks[].z`. The watch then sat a quarter turn
   out and clipped into the arm.
5. Replaced the basis with the exact 2D palm normal. The watch rocked oddly and
   still did not rotate in a believable direction.
6. Rolled all of the above back to `1252322`, the last build that was not
   actively wrong.
7. Switched orientation to MediaPipe `multiHandWorldLandmarks` (metric 3D).
8. Dial still faced left. Two quarter-turn controls were added and both failed:
   a forearm turn swung the watch the wrong way, and at 270 degrees the dial
   pointed away from the lens, which is the tell that the dial axis had been
   assumed wrong rather than merely mis-tuned.
9. Drew the model's own axes on screen (`?ar-axes`) and read the dial axis off
   the live render. It is local **Z**, not local X. Remapped the basis.
10. Dial faces the camera. **Resolved at `fc564fa`.**

**Method note.** Steps 8 and 9 are the lesson. Two rounds of tuning controls
failed because the dial axis was inferred from a bounding box, and the box gives
the thinnest axis, not the axis the face looks out of. Measuring the axis on
screen settled it in one round. Do not tune an axis mapping again; measure it.

## Verified facts, with the evidence

**Position tracking is fine.** Not the problem, and should not be touched again.

**The image landmarks cannot support wrist roll.** Their cross product only
recovers `sin(theta)`, which is identical for an equal roll in either direction.
Google's own paper (https://arxiv.org/abs/2006.10214) states the hand landmark
model returns 2.5D coordinates and that relative depth is learned **only from
synthetic images**. Any approach reading `landmarks[].z` is reading a fitted
value. This is the root cause of attempts 1, 2, 4 and 5.

**`multiHandWorldLandmarks` is a genuinely different signal.** A metric 3D
reconstruction in metres, not the synthetic depth above. The legacy `Hands`
solution was already returning it the whole time and it was not being used. A
real orthonormal palm frame built from it gives a signed roll over the full
circle, which is what the 2D signal cannot do.

**Model geometry, measured from the deployed `pulse-smartwatch.glb`:**

```
size          X=0.0443  Y=0.0756  Z=0.0762
thinnest      X
root transform  +90 deg about X   (exporter Z-up -> Y-up conversion)
band axes      Y and Z differ by 0.9%  -> near symmetric
```

**The bbox did not give the dial axis, and this was the root cause of the whole
bug.** X is the thinnest axis, which reads like a case thickness and so looks
like the dial normal, but reading the model's axes off the live render with
`?ar-axes` puts the dial on **local Z**. Confirmed twice over: the dial points
along Z on screen, and a -90 degree turn about the forearm sends Z to -X, which
is away from the lens, exactly as the user reported at forearm 270.

Resolved arrangement, all three now measured on device rather than assumed:

```
local Z (dial)  ->  palm normal, at the camera
local X         ->  along the forearm
local Y         ->  around the wrist circumference
```

**The dial and the band had to be measured separately, and the first attempt got
the band wrong.** The dial sits in the plane of the two candidate axes, so
finding it does not tell you which of the remaining axes is the forearm: the band
and the forearm compete, and the bounding box cannot separate them because those
two extents differ by under 1%. Reading "the band shares the dial's axis, so the
forearm must be Y" was inference wearing a measurement's clothes, and it put the
band on crossways. The forearm is local **X**.

Right handedness is not automatic after a column swap. The middle column has to
be `palmNormal x armDir`; the naive swap of the previous pair yields determinant
**-1**, a mirror, and the quaternion drifts. Verified numerically: determinant
+1, `x cross y == z`, dial at camera-space z 0.92, forearm at z 0.05.

- No node rotations or scales were missed: 76 of 78 nodes use TRS, but all have
  identity rotation and unit scale, so the bbox is unaffected either way.

**The basis must stay right handed.** An earlier attempt used
`faceDir x armDir` and produced determinant **-1**, the same mirror, and the
quaternion derived from it drifted.

**Front camera mirroring is already correct.** `toScreen` mirrors the landmark
x-coordinate when the selfie camera is active, and the video element gets the
same treatment, so overlay and feed agree. Both cameras show the same dial
offset, which confirms mirroring is not the cause.

**A watch is rigidly attached to the wrist, so it must travel the same way as the
hand, never the opposite way.** The user twice reported "it should be inverted".
It should not. Direction is judged on the rear camera only.

## Resolved: the dial faced left instead of at the camera

Fixed at `fc564fa` by remapping the basis to the measured axes. Both quarter-turn
controls sat at zero, which was correct, so the watch oriented itself with no
manual adjustment.

They no longer exist at all. The mapping they were compensating for is gone, so
keeping them would have left two knobs that cannot fix anything and can only
introduce a fault. They went at `5d19a0e` with the rest of the guessing. The
button rows in the AR overlay went with them, which is why that overlay no longer
has any rotation controls on it.

The two failures that pointed at the cause, worth keeping:

- Rotating about the dial axis can only roll the watch in its own plane and can
  never change which way the dial points. The user diagnosed this correctly.
- Forearm 270 degrees produced a dial pointing *away* from the camera. A wrong
  facing, not a mistuned angle.

## Still open

- **The camera path has not been run on a device since the reference hand
  landed.** `ProductARScan` and `ProductAR` both still read the alignment through
  the shared `toWristAlignment` and both still compose it as
  `wristBasis * savedAlignment`, which is the same order the align page implies,
  so the contract holds by inspection. Inspection is not a device test. This is
  the one open item that needs hardware.
- **Residual tilt is no longer a renderer concern.** The dial reads on local Z
  but leans back a little, because the model was authored with the case tipped up
  off the band. That is a real constant angle, and quarter turns cannot express
  one. It is now the seller's to express, as a free angle on the align page,
  which is the right place for it. There is no `?ar-tilt` and there should not be
  one; a trim here would reintroduce exactly the per-model knowledge the frame
  was built to delete.
- **Position is no longer a renderer concern either.** The `armR` standoff that
  used to push the watch out along a palm normal carrying a leftward component
  is gone. The seller sets an offset in wrist widths, and both renderers rotate
  that offset by the final orientation before applying it, because "just off the
  skin" is a statement about the watch rather than about the world.

Both of the above used to be listed here as trims still to be dialled in. They
were closed by deleting them, not by finding a value, and that is the point worth
keeping: a number that only one model needs belongs to that model's seller, and
a per-renderer trim for it is a bug waiting to be rediscovered.

## Method, for the next axis problem

1. Do not infer an axis from a bounding box. The thinnest axis of a watch is not
   the axis its face looks out of; that mistake cost two rounds here.
2. `?ar-axes` draws the model's own labelled axes on the watch. Read the dial
   axis off it.
3. **That reading is not sufficient on its own.** The dial axis leaves two axes
   ambiguous in its own plane. Measure the band separately, as the user did.
4. After any column change, re-verify `det == +1` numerically. A silent mirror
   looks like drift, not like an error.
5. Quarter turns only for mapping errors. Real authored angles need a real
   angle.

## Not yet verified on a real device

- That `multiHandWorldLandmarks` is being delivered, now confirmed indirectly:
  the user read `roll -65deg 3D` rather than `PINNED`, so the metric hand is
  arriving on the test phone.
- **That the camera path honours a seller's saved alignment.** See the procedure
  below. This is the outstanding test.
- **That the camera path shows the colour the buyer selected.** Found and fixed
  on 27 Sep, from the user's report that AR did not match the selected colour.
  The fix is verified by reading the code and the model, **not yet by eye on a
  device**, so it still needs looking at.

## The camera path ignored the selected colour, and every part of the model

`ProductARScan` applied the product's material and then immediately undid it.
The order in the loader was:

```
applyProductMaterials(fresh, materials, material, modelMaterials)   // the buyer's colour
stripScanTextures(fresh)                                            // throws it away
```

`stripScanTextures` nulled `map`, `normalMap`, `roughnessMap`, `metalnessMap`,
`aoMap`, `emissiveMap` and `alphaMap` on every material, then repainted each one
from a colour guessed out of the model's own palette. The guess picked names off
`${mat.name} ${obj.name}` and tested them against `dial|glass|screen|band|strap|
crown|button|...` to decide which colour belonged to which part.

**Those names do not exist in these models.** They are exported with obfuscated
Sketchfab-style names, and in `pulse-smartwatch.glb` **not one** node, mesh or
material name matches any of those patterns, out of 33 materials. Consequences,
all of them verified by parsing the GLB rather than by eye:

- every material fell through to the same fallback, so the whole watch was
  painted one flat colour, `#695947`, a dark brown, taken from the second most
  common colour in the file
- 8 of the 33 materials have a `baseColorTexture`, and all 8 lost it
- the near-black dial colour was never applied, because nothing matched `dial`

So the camera AR view showed a flat brown, untextured lump for **every** product,
whatever colour was selected, while the 3D viewer and the native WebXR view both
showed the correct colour. `ProductViewer` and `ProductAR` never called it, which
is why only the camera path was wrong and why the two AR modes disagreed with each
other.

Removed at `d18b081`'s successor rather than repaired: there is no correct version
of a heuristic that keys off names the exporter does not emit. **Three renderers,
one material path, in `lib/modelMaterials.ts`.** If a look over a camera feed ever
needs changing, change it there so all three change together.

Worth keeping as a method note, because it is the same shape of mistake as the
bounding-box axis inference: a heuristic that reads a name or an extent and
infers a property from it. Both looked reasonable, both were confidently wrong,
and both were only caught by measuring the actual file rather than by looking at
the screen and deciding it looked plausible.

### And then the colour was still wrong, with the data provably right

With the heuristic gone the camera view finally took the buyer's colour, but it
still did not *look* like the 3D viewer, and the two remaining suspects were both
checkable without a phone:

- **Tone mapping.** `ProductViewer` and `ProductAR` are both `<Canvas>` from
  react-three-fiber, whose `Canvas` sets `toneMapping = ACESFilmicToneMapping`
  unless `flat` is passed, and neither passes it. `ProductARScan` builds its
  renderer by hand, where three.js r185 defaults to `NoToneMapping`. Same
  material, different grade, so the identical `#c9a227` read as a flat and more
  saturated gold in the camera view than in the viewer.
- **No environment.** The viewer hangs an `<Environment>` off three Lightformers,
  so every surface there has something to reflect. The camera scene had nothing
  to reflect, and the presets are `metalness 0.3`, `clearcoat 0.15`, both of
  which take their appearance largely from the environment, so the case read
  flatter and darker there than in the viewer. Fixed with a generated
  `RoomEnvironment` through `PMREMGenerator`, which costs no asset and no request.

The lesson is the one worth keeping: **fixing the material pipeline did not make
the two views agree, because "the material" is only half of what the user sees.**
Tone mapping, exposure, environment and the light rig are the other half, and a
hand-built renderer gets none of the defaults a `<Canvas>` sets for free. Any
renderer built by hand in this codebase has to set `toneMapping` and
`outputColorSpace` explicitly or it will quietly disagree with the two that don't.

### The actual cause: the per-part pass was matching against an empty object

The tone-mapping and environment work above was real, but it was treating a
symptom. The colour was wrong because **the per-part pass had never once
applied a single preset**, in any renderer, since it was written.

`applyMaterialPresets(materialMap, presets)` matched presets against
`Object.values(materialMap)`, and every caller got `materialMap` from the parsed
GLTF as `gltf.materials`:

```ts
const g = gltf as typeof gltf & { materials?: Record<string, THREE.Material> };
return { scene: g.scene, materials: (g.materials ?? {}) as Record<string, THREE.Material> };
```

**`GLTFLoader` does not put a `materials` dictionary on its result.** Its
`onLoad` builds exactly this and nothing more:

```js
const result = { scene, scenes, animations, cameras, asset, parser, userData };
```

There is no `materials` key. The `?? {}` quietly turned "this field does not
exist" into "there are no materials", so `slots` was empty, every lookup
returned `undefined`, and all 33 presets were discarded **without an error, a
warning, or a single line of output**. `applyMaterialToScene` had already run
first and painted all 33 materials with the base colour, so the watch rendered in
the base colour and looked exactly like a product whose variants were ignored.

On `apple-watch-ultra` that base colour is `#ff0000` while the swatch is black
`#000000`, so the AR view showed a **red** watch on a black swatch. The user
reporting "the AR ignores the colour I picked" was reporting this precisely; it
took a round trip asking what colour was actually on screen to separate it from
the two rendering differences above, which were real but secondary.

`useGLTF` returns the same parsed object, so `ProductViewer` and `ModelAlignPage`
were affected identically. In the viewer the failure was even quieter, because
`Object.values(undefined)` threw a `TypeError` — but it threw on line 2 of the
effect, *after* the base paint on line 1 had already landed, so the paint stayed
half-applied and the error went to a console nobody was watching.

Three things were wrong at once, and only the third was the actual fault:

1. an optional convenience field on a third-party loader's result was treated as
   a guaranteed part of the contract
2. the failure was silent, so it looked like correct behaviour
3. it failed *after* the first half of a two-step paint, so what remained visible
   was plausible rather than obviously broken

The fix reads the materials off the scene graph instead, which is authoritative
because it holds the exact instances being rendered:

```ts
applyMaterialPresets({ ...materialMap, ...materialsFromScene(scene) }, modelMaterials);
```

Dict first, so its ordering still drives the index fallback; scene second, to pick
up anything the dict missed. Also:

- `applyMaterialPresets` now takes `materialMap ?? {}`, so a missing map can never
  throw in the middle of a paint again
- a preset that matches nothing is collected and logged in dev, because a part
  that quietly failed to recolour is indistinguishable from one that succeeded
- `ProductViewer` was moved off its hand-rolled two-call version onto
  `applyProductMaterials`, so all four call sites now share one path

Verified in the built chunk rather than assumed: the minified output contains the
`isMesh` traversal that builds the name-keyed map. Not yet confirmed by eye on a
device, and the notes say so.

## The camera frame was in a half turn about Z, so a seller's position meant nothing

Symptom, after the colour was finally right: the watch sat at the **top of the back
of the palm**, up by the knuckles, when the seller had placed it correctly in the
studio. Placement, not orientation, which is what made it look like a tuning problem
rather than a contract problem.

There were two independent mismatches, and both had to be wrong for the watch to
land there.

### 1. The arm axis pointed the wrong way

`lib/wristAlignment.ts` states the frame: **+X up the forearm, toward the elbow**.
`lib/referenceHand.ts` backs that with measurements taken out of the bundled hand
rather than by eye, which is what makes it usable as a reference:

```
HandMain        x = +1.166   the arm end
MiddleF_tip     x = -1.211   the fingertip end
=> +X runs from the fingertips toward the elbow, matching the frame's +X.
```

The camera path built that axis the other way round, in **both** the 2D and the
metric branch:

```ts
vUp.set(lx(9) - lx(0), ...);              // middle knuckle minus wrist  -> fingertips
wArm.set(wx(9) - wx(0), ...);             // same
```

Landmark 9 is the middle finger's base knuckle and landmark 0 the wrist crease, so
that subtraction points from the wrist at the fingers: exactly backwards. One
subtraction, in two places.

The consequence is bigger than an offset being mirrored. With X reversed and Z
correct, and `across` derived from the arm axis, the runtime basis came out as
`(−X̂, −Ŷ, Ẑ)` against a canonical `(X̂, Ŷ, Ẑ)` — a **half turn about Z**. So:

- the seller's `offsetX` of `+0.37`, "up the forearm" in the studio, was applied
  *toward the fingers* here, which is the reported symptom exactly
- the seller's rotation was also applied a half turn out, so the crown and band
  were on the wrong sides too, and being a half turn about the wrist normal it is
  not the kind of error that reads as obviously wrong

Only X was wrong, and that is all that had to be fixed: because the frame is right
handed, `across = faceDir × armDir` means a correct X and Z **force** a correct Y.
There was no third axis to go and get right separately.

### 2. The runtime origin did not match the page the number is typed on

`ReferenceHandModel.tsx` seats the reference hand's wrist centre exactly on the
origin, and says why: so that a number typed on the align page means the same thing
on any hand and any device. The camera path instead seated the origin `0.45` wrist
widths further up the forearm than the wrist landmark, on top of the seller's
offset. So even with a correct frame, every seller's number meant something about
`0.45` wrist widths, roughly 2.7cm on a 60mm wrist, different from what they typed.

`WATCH_ARM_OFFSET` is now `0`, and placement belongs to the seller's alignment,
which is stated once and is the same number everywhere.

Its comment was also wrong, and in a way worth recording: it claimed the offset was
measured "from the wrist landmark toward the middle of the palm" while the code
moved the anchor the *other* way, away from the palm and down the forearm. The code
was the anatomically correct one and the comment was stale, and both were wrong
about the thing that mattered — neither matched the page the number is typed on.

### Not verified on a device

Untested by eye, and the notes say so. Two things to expect when it is:

- **`roll.deg` now reads with the opposite sign**, about `+65` where it read `-65`.
  Same measurement, opposite sense, because the sense of rotation about the arm axis
  follows the axis. The `3D` marker is unaffected and still means the metric
  reconstruction is arriving. The `-65deg 3D` quoted above was read under the old
  convention, so it should not be compared against a new reading without allowing
  for the flip.
- The dial orientation should improve rather than change for the worse, since the
  seller's rotation is now applied in the frame it was authored in. If it looks
  rotated, that is now a genuine misalignment to fix in the studio, because the two
  now agree about what the frame is.

The native WebXR path is untouched by this and was not affected: it binds to the
runtime's `wrist` space via `WristHand` rather than deriving a frame from
landmarks, so `CANONICAL_TO_WRIST_SPACE` is a separate and still unverified
question.

### The offset was being rotated by the seller's own rotation (`3860ac3`)

**This was the actual cause of "the watch is on my palm", and it was never a
frame problem.** Three sessions went into the wrist frame. The frame was fine.

`ProductARScan.tsx` rotated the seller's offset by `watchQuat`:

```ts
watchQuat = basisQuat * sellerQuat          // orientation: correct
position  = anchor + offset.applyQuaternion(watchQuat) * wristPx
```

The offset is already expressed in the canonical frame, so the basis is the only
thing that needs applying. Folding `sellerQuat` in as well applied the seller's
*model rotation* to their *model position*. Rotating a model about its own centre
is not a thing that can move it, and this did exactly that.

It stayed invisible for as long as alignments carried small rotations, then landed
on `apple-watch-ultra`, whose saved quaternion is a half turn about
`(0, 0.284, 0.959)`. A half turn about that axis maps canonical `+X` to `-1.000`
on X:

| canonical axis | under the seller's quat | |
| --- | --- | --- |
| `+X` toward the elbow | `(-1.000, 0.000, 0.000)` | **reversed** |
| `+Z` out of the back of the hand | `(0.000, 0.545, 0.839)` | survives, `dot = +0.839` |

So `offsetX 0.53` was applied as `-0.53`: straight back down the forearm onto the
palm. And because Z survived, the dial kept facing the right way. "Off along X,
still on my palm, facing correctly" is the exact fingerprint of this bug, and no
amount of adjusting the wrist frame could ever have cured it.

Fix: `basisQuat` is held separately and the offset uses it alone. The model's
orientation keeps the seller's rotation; the model's position does not.

**Lesson, and the general one:** a symptom that is *position wrong but orientation
right* is not a frame bug. A frame bug moves both, because the frame is what
defines both. Check which half of the transform is wrong before rebuilding the
frame.

### What to check if a placement complaint comes back

Ask which of these it is, and do not change a constant without the answer:

- position wrong, orientation right -> the offset/rotation split, as above
- position and orientation both wrong -> the wrist frame
- correct when first locked, drifts after -> the smoothing on `anchor`/`armDir`
- changes with entry pose -> a camera-relative sign, which no longer exists

## The frame's sign came from the camera, so placement depended on entry pose

`3326fc4`. This is the second half-turn bug, and the reason the first fix did not
stick. The earlier section above got the arm axis pointing the right way. What
was still wrong is that the frame's **sign** was not anatomical at all.

Both paths used to decide the sign once, on the first tracked frame, against
whichever side of the wrist faced the lens:

```ts
roll.sign = wNormal.dot(CAM_DIR) >= 0 ? 1 : -1;   // metric
side.sign = vOut.z > 0 ? 1 : -1;                  // 2D
```

Deciding once was deliberate, to stop the watch spinning as the roll passed
through zero. But it means the frame a seller's alignment is interpreted in
depends on the pose at the moment tracking engaged. Same wrist, different entry
pose, different placement, and nothing on screen to explain it.

### Why the cross product could not just be used as it stood

The metric path built `+Z` as `wArm x wAcross`, where `wAcross` ran index
knuckle to ring knuckle, i.e. *away* from the thumb, i.e. canonical `-Y`. For a
left hand that comes out at `-Z`: the palm, not the back of the hand. Verified
numerically against a synthetic left hand in the studio's own frame, the old
product is exactly `(0, 0, -1)`, dot `-1.000` with the dorsal axis. A camera sign
was therefore not a convenience, it was load-bearing.

The fix is to take `+Y` from the thumb's own landmarks, `1 -> 4`, projected
perpendicular to `+X`. The thumb is the one axis of the palm that is *named*
rather than inferred, so no sign has to be guessed and nothing references the
camera. `+Z` is then `+X x +Y`.

### The handedness, worked out rather than picked

This is the one bit that cannot be read off the code, and it is worth recording
because it was the thing that had to be asked rather than guessed.

From the measured values in `lib/referenceHand.ts` for the bundled hand: elbow
end at `x +1.166`, middle fingertip at `x -1.211`, thumb on model `-Z`, back of
the hand on model `+Y`. So the studio's canonical frame is `+X` toward the elbow,
`+Y` the thumb side, `+Z` out of the back, and it is a right-handed frame.

For a hand held palm down, fingers away from the body, the left hand has its
thumb on the right and the right hand on the left. Working the cross product
through both:

- left hand: `+X x +Y` is the back of the hand
- right hand: `+X x +Y` is the palm

So the construction is only correct for a left hand, and the studio's frame is
therefore a **left hand's** frame. The user confirmed scanning with the left
hand, which is the handedness the reference hand is built for, so no per-session
handedness detection is needed and none was added. A right-handed wearer needs a
negated `+Z`; if that ever has to be supported it is a stored flag, not a
heuristic, and the studio is where it should be set.

Synthetic left hand, expressed directly in the studio frame, run through the new
construction: `+X` `(0.999, 0.050, 0.000)`, `+Y` `(-0.049, 0.987, 0.152)`,
`+Z` `(0.008, -0.152, 0.988)`, worst axis error `0.0129`, the residual being the
thumb's natural lean up the hand.

### Also in that commit

- `+X` now runs from the **middle of the knuckle line** `(5 + 17) / 2` to the
  wrist crease, rather than trusting the middle knuckle alone. Same direction,
  half the jitter, and placement depends on this axis more than any other.
- The 2D and metric paths now run the identical construction, so they cannot
  disagree with each other. Previously they used different "across" vectors
  (index-minus-pinky versus index-minus-ring) and different sign rules.
- `pose.far` reads `pose.normal.z` rather than the 2D vector's `z`, which was
  stale whenever the metric path overwrote the normal.
- `roll.sign`, the `side` object and `vUp` are gone. `roll.decided` stays, but
  only to anchor the on-screen `roll.deg` readout. Nothing about placement reads
  it.

`roll.deg` keeps its old sign convention relative to the reference frame, so a
reading is comparable with earlier ones.

## Matte, Chrome and Clear did nothing, and the model file decided that

All three finish controls were dead, not subtle. In `applyToMaterialInstance`:

```ts
const physical = mat as THREE.MeshPhysicalMaterial;
if (physical.clearcoat !== undefined) {
  physical.clearcoat = material.finish === 'chrome' ? 1 : material.clearcoat;
  if (material.finish === 'chrome') physical.metalness = Math.max(mat.metalness, 0.85);
}
```

That block is a duck-typed test for a property only `MeshPhysicalMaterial` has.
Parsing `pulse-smartwatch.glb` rather than assuming:

```
extensionsUsed:              KHR_materials_emissive_strength
KHR_materials_clearcoat:     absent
all 33 materials:            metallicRoughness
```

`metallicRoughness` with no clearcoat extension means `GLTFLoader` builds every
material as **`MeshStandardMaterial`**, which has no `clearcoat` property. So
`physical.clearcoat !== undefined` was `false`, the block never ran, and:

- the **Clear** slider did nothing
- **Chrome** did nothing either, because its `metalness` line was *inside* the
  same skipped block
- so **Matte and Chrome rendered identically**, on every product whose model was
  exported without `KHR_materials_clearcoat`

Chrome was also wrong on its own terms where it did apply: it raised metalness and
left roughness alone, and 0.85 metal at roughness 0.45 is a brushed satin, not
chrome. Chrome needs both. It now sets `metalness >= 0.95` **and**
`roughness <= 0.08`, plus `clearcoat >= 0.6` and `clearcoatRoughness 0.05`.

A clear coat is a second specular lobe with its own roughness and cannot be faked
by moving metalness and roughness on a standard material, so the honest fix is to
swap the class: `promoteClearcoatMaterials` walks the scene graph and replaces each
`MeshStandardMaterial` with a `MeshPhysicalMaterial` carrying the maps across.
Three details that matter:

- keyed on the **original** material in a `Map`, so a material shared by several
  meshes is promoted once and stays shared rather than being cloned per mesh
- guarded on `isMeshStandardMaterial && !isMeshPhysicalMaterial`, because
  `isMeshStandardMaterial` is **also true** for `MeshPhysicalMaterial`. Without
  the second half, every pass would promote an already-promoted material and
  quietly reset its clear coat to 0
- run **before** the paint and before the scene is read back for preset matching,
  because it replaces the material objects and everything downstream has to see
  the new ones

The scene graph is walked rather than `materialMap`, for the same reason the
preset matching reads it: the map is empty.

The `isMeshStandardMaterial` and `isMeshPhysicalMaterial` flags sit on opposite
sides of the class hierarchy, so `tsc` rejects reading both off
`MeshStandardMaterial`. They are read off an intersection type instead. Worth
remembering rather than rediscovering: `MeshPhysicalMaterial extends
MeshStandardMaterial`, which is why the inherited flag is true for both.

### The studio sliders read 0 to 1 and showed no number

`Metal`, `Rough` and `Clear` were bare sliders over `0..1` with no value displayed,
so `0.15` looked like a third of the way along and there was no way to tell what a
part was set to. They now run `0..100` with the number shown, converting to and
from `0..1` at the boundary, so a stored `1` reads `100` and sits at the end of the
track — which is the complaint that surfaced it, on a part whose clear coat was
already at maximum.

`Metal` and `Rough` are **disabled and read "chrome"** while Chrome is selected,
because Chrome overrides both. Leaving them live would show a number that is not
what renders, which is the same class of bug as a control that lies: this whole
session has been about controls that report something other than what they do.

## Clear is opacity, and it is not the same field as clearcoat

The Clear slider now runs 0 = opaque to 100 = fully transparent, which is opacity
and has nothing to do with the clear-coat lobe. It was tempting to just repoint it
at the existing `clearcoat` column, which is already there, already clamped, and
needs no migration. That would have been a mistake, and the reason is worth
recording: **every `clearcoat` value in the database is a clear-coat value.** It
was written by the seeder (`0.6` on the chrome presets, `0.1` on matte) and by the
old studio slider, both of which meant "how glossy". Reinterpreting the column as
opacity would have made those parts 60% see-through, and the one Apple part stored
at `clearcoat: 1` would have gone completely invisible. The field name is the only
record of that intent, so it keeps its meaning.

Hence a new `Transparency` column on `Material_Transparency`, default `0`, and the
clear-coat lobe is left to the Chrome preset in code where it belongs. The
per-part materials live in `ModelMaterialsJson`, a JSON column, so they pick the
new field up with no migration of their own and every part that predates it
deserialises to `0` = opaque. Verified by applying the migration to a copy of the
live database, not just to a fresh one.

Two things the renderer deliberately does **not** do:

- **0 does not write opacity at all.** Forcing `opacity = 1` on every material
  would quietly undo any transparency in the source file, and watches are full of
  it: sapphire crystal, smoked dial, display back. Only a part the seller has
  actually made see-through gets touched, so 0 means "leave the model as
  authored".
- **It does not read `transparency` unguarded.** Parts saved before the column
  have no value at all, and `undefined` must mean opaque rather than `NaN`.

`depthWrite` is forced off for a blended surface, or the first part drawn punches
a hole through everything behind it and the effect turns inside out. At 100 the
material is set `visible = false` rather than paying for a fragment that blends to
nothing.

`ProductViewer` keys its repaint on a `materialKey`, and `transparency` had to be
added to it or the slider would repaint nothing until something unrelated changed.

## The far side of the band was visible because nothing wrote depth in front of it

Wearing a watch, the far half of the band is behind your wrist. The camera path
had no wrist, so it drew the band straight through: the back strap showed up
*inside* the watch. Native WebXR never had this problem, because it binds to the
runtime's `wrist` space and gets a real hand to hide it with.

The fix is the same one the native path already uses. `ProductAR.tsx` has had

```tsx
<DefaultXRHand model={{ colorWrite: false }} />
```

all along, and that is the whole technique: draw the hand, write depth, paint
nothing. The camera path now builds the equivalent — a forearm capsule with
`colorWrite: false`, `depthWrite` left on, `renderOrder = -1` so depth is laid down
before even a see-through watch sorts against it, and `frustumCulled = false`
because it is rescaled every frame and its bounds mean nothing to that test.

**The radius is the entire argument, and it is not a matter of taste.** Camera on
`+z`, wrist axis through the origin, band looping round at radius `0.5` wrist
widths, case standing on the skin from `0.5` outward. For a proxy of radius `r`:

| part | sits at | hidden only if | so to keep it |
| --- | --- | --- | --- |
| near band | `z = +0.5` | `r > 0.5` | `r < 0.5` |
| case | `z >= 0.5` | `r > 0.5` | `r < 0.5` |
| far band | `z = -0.5` | `r < 0.5` | hidden |

All three agree: any `r` just under the skin radius hides exactly the far band and
nothing else. `0.47` is that value. The earlier attempt was oversized, which is
why it took a visible bite out of the case and the whole idea got written off as
unusable — it was never the idea that was wrong, only the radius.

It is sized from `pose.wristPx` and not from the seller's `scale`, because it
stands in for the wearer's arm, which the watch alignment has no business
resizing, and driven from the same frame and the same `anchor` as the watch in the
same block, so it can never lag by a frame and make the cut crawl along the
silhouette. It is hidden outright when tracking drops, since a left-behind occluder
would go on cutting the watch out of a frame where the hand is already gone.

`MaterialEditor.tsx` is dead code, by the way. It looks like the material editor,
it is the component that would hold the base-material controls, and nothing
imports it — the live UI is the per-part editor inside `ProductFormPage`. It has
been kept consistent with the rest rather than deleted, but do not go looking for
a base-material slider in the browser and conclude the build is broken.




## The camera-path device test

The point of the test is narrow and worth keeping narrow: **does the try-on render
the watch the way the align page shows it?** It is not a test of tracking, which
is already known good, nor of the dial axis, which is already measured and fixed.
It is a test of one composition, `wristBasis * savedAlignment`, across two
renderers that were written at different times and have never both been run.

Run it on the same device, in one sitting, in this order. The order is the test:
the align page is the expected result, so look at it first and do not go back to
re-look afterwards, or the expectation drifts to match the result.

1. Log in as the seller. Open
   `https://mdnr.alwaysdata.net/seller/products/apple-watch-ultra/align`.
   **Use this product.** It is the only one with a saved alignment, and using an
   unaligned product tests nothing while looking like it found something.
2. Orbit the view to roughly match a wrist seen from the back, hand held out.
   Note where the dial points, which way the band runs, and roughly where the
   case sits along the forearm. Do not drag the model and do not save. The page
   is meant to load already showing the saved alignment.
3. Hard refresh, then open
   `https://mdnr.alwaysdata.net/products/apple-watch-ultra?ar-debug`.
   Start the try-on and **switch to the rear camera** with the flip button.
   Direction is only judged on the rear camera; the selfie preview is mirrored
   and will look inverted when it is not.
4. Read the readout before judging anything visual. `align` must say `saved`, and
   `roll` must show a `3D` value rather than `PINNED`. If `align` says `NONE` the
   alignment is not arriving and nothing about the rendering means anything yet.
5. Hold the wrist still, back of hand to the lens. Compare against step 2: dial
   out of the back of the hand, band around the wrist running down the forearm,
   watch sitting on the forearm side the align page put it.
6. Roll the wrist slowly through about 90 degrees. The watch must travel *with*
   the hand. If it rotates the opposite way, or flips end over end, that is the
   `roll.sign` locking in `ProductARScan.tsx` and is a real fault.
7. Turn the hand palm-to-back. The watch should swing around and show its own
   back, rather than staying stuck to the camera.
8. Only then try native WebXR AR if the device offers it, since `ProductAR` is the
   less-tested of the two and has a known unverified constant,
   `CANONICAL_TO_WRIST_SPACE` in `ProductAR.tsx`.

Record the outcome as one of: matches the align page; a fixed offset from it; or
mirror-reversed. Those need different fixes and the distinction is the whole
value of the test, so it is worth saying which one was seen rather than just
"wrong".

## Debug parameters

| param | meaning |
| --- | --- |
| `?ar-debug` | landmark overlay plus a readout of wrist size, roll, palm normal, arm direction, and whether an alignment was found |
| `?ar-axes` | draws the model's own X, Y and Z axes on the watch. **This is how the dial axis was measured.** Use it rather than tuning a mapping |

**That is the whole list.** `?ar-spin`, `?ar-facing`, `?ar-tilt` and `?ar-arm` are
all documented in older revisions of this file and **no longer exist**. They were
removed at `5d19a0e` when the seller-set alignment replaced the renderer's
guessing, along with the on-screen button rows that drove them. Nothing reads
those query parameters any more, so passing one is silently ignored and the
overlay will look as though it did nothing. Do not go looking for a tilt value
to trim: tilt is a real authored angle and the seller's free-angle input on the
align page expresses it, which is the correct place for it.

The `?ar-debug` readout's `align` line is the one to read first on a device. It
says `NONE (seller has not aligned this)` when the product has no saved
alignment, which is a completely different fault from a bad one and is worth
distinguishing before investigating anything else.

## Deploy

Run `deploy.ps1`, then `upload-alwaysdata.ps1`. The second one builds the sftp
batch from `publish/wwwroot` and uploads **explicitly, per file**:

- `publish/wwwroot/index.html`
- every other file in `publish/wwwroot/`, which is not just `index.html` any
  more. `public/` assets land at the root of `wwwroot`, and skipping them is
  how `reference-hand.glb` once failed to load while the page still built
- every file in `publish/wwwroot/assets/`

Never upload recursively, that previously created a wrong nested `wwwroot`.
Static files need no Alwaysdata restart, but users must hard refresh.

`upload-alwaysdata.ps1` uses key auth when the key is present and falls back to
a password file otherwise. It prefers the key, because the private key never
leaves `~/.ssh` and there is no secret to copy around. It is generated but **not
yet registered** on the account, so deploys are still using the password.

**Pass `-ForcePassword` until the key is registered.** The key file exists, so
without that switch the script takes the key path, fails with `BatchMode=yes`,
and never reaches the password. The resulting error names a public-key problem
when the real issue is only that the password path was skipped.

**Every `-o` must come before `-b` in the sftp call.** This cost a deploy and is
worth not re-deriving. `sftp` handles `-b <batchfile>` inline while it is still
parsing arguments, opening the connection there and then, so any `-o` after it
has not taken effect when the connection is made. With `BatchMode=no` placed
after `-b`, the connection is made under the default `BatchMode=yes`, which
suppresses password and askpass prompting completely, and the upload dies with:

```
mdnr@ssh-mdnr.alwaysdata.net: Permission denied (publickey,password,keyboard-interactive).
```

That message reads like a wrong or unregistered credential, and it is not: the
password was correct and the same command with the same batch file succeeded
once the two options were swapped. Confirmed by running both orders against the
same account. The script now builds every `-o` first and appends `-b` last.

The password is read from `%TEMP%\opencode\ad-pass.txt` and deleted afterwards,
so it never sits in a command line or in the repo. Create that file first:

```powershell
Set-Content -LiteralPath "$env:TEMP\opencode\ad-pass.txt" -Value '<password>' -NoNewline
```

`-NoNewline` matters: the askpass helper `type`s the file, and a trailing
newline comes back as part of the password.

**Preserve on the server:** `/home/mdnr/www/app.db`, `wwwroot/models/`, and
remotely uploaded `wwwroot/images/`. Nothing is ever deleted by the upload, which
is what keeps these safe. Stale hashed assets do accumulate on the server; they
are harmless, since `index.html` only references the current ones.

**Take a database backup before deploying**, since a deploy can bring a migration
with it. Pulled with a one-line sftp batch, because the upload script only ever
puts files and cannot be used to fetch:

```
lcd %TEMP%\opencode
get /home/mdnr/www/app.db app.db.predeploy.bak
bye
```

The pre-`ca31d1b` deploy backup is at `%TEMP%/opencode/app.db.predeploy.bak`
(262144 bytes, matching the live file). An older one is at
`%TEMP%/opencode/app.db.backup`.


## Credentials

### Finish key auth, then rotate the password

The account password has been exposed in chat transcripts and shell history. It
is not stored in any file in the repo, which is the right state, and that should
stay true. Rotating it is still outstanding.

Until then, deploys work by creating the password file. After rotation, the file
becomes a fallback that is never needed.

To finish key auth:

1. Add this public key in the Alwaysdata admin panel, under SSH keys:

   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ4lZ7HTevoicpZ7bJgkmjB9RTsma2psojjZV5RAaiON opencode deploy to mdnr@ssh-mdnr.alwaysdata.net
   ```

   Fingerprint of the private key, to match against the panel's own listing:

   ```
   SHA256:+7P6B5n3PS5/LbmGwR7ITv4P6Jy1o2vAwoa+3/aXa6o
   ```

2. Confirm it works, then rotate the password:

   ```powershell
   ssh -i "$env:USERPROFILE\.ssh\id_ed25519_alwaysdata" -o IdentitiesOnly=yes `
       mdnr@ssh-mdnr.alwaysdata.net 'echo connected'
   ```

   Until this prints `connected` the account answers
   `Permission denied (publickey,password,keyboard-interactive)`, which is the
   expected "key not registered yet" result. The server does accept `publickey`,
   so no Alwaysdata-side change is needed beyond adding the key.

3. Delete `%TEMP%\opencode\ad-pass.txt` if one is lying around, and rotate the
   account password in the admin panel.

The host key is already trusted in `known_hosts`, recorded during the first
password deploy. Its ED25519 fingerprint is
`SHA256:5i/vJYokzNsnXAeHkwzEm+3kxPQWwsRzwXFPQ7oOvNI`; check that against
Alwaysdata's published fingerprint if the account is ever rebuilt.

## Last known good builds

| commit | asset | behaviour |
| --- | --- | --- |
| `1252322` | `ProductARScan-Dvlm0uiS.js` | pinned to camera, no rotation. Dull but not wrong. |
| `2e6c2c2` | `ProductARScan-B2exgz03.js` | metric 3D roll plus on-screen spin control. |
| `a8e96b1` | `ProductARScan-DV2W4q9h.js` | adds the `?ar-axes` probe that found the dial axis. |
| `fc564fa` | `ProductARScan-B4dMx8l7.js` | dial faces the camera. Facing fixed, band still crossways. |
| `90d69f6` | `ProductARScan-DMpgw0W8.js` | forearm on local X, band along the arm, adds the tilt trim. |
| `205016e` | `index-*` | seller-set alignment, shared wrist frame, capsule hand, flip controls. |
| `e15aa93` | `index-C8LPQc_P.js` | bundled rigged hand, no bangle, rotation sliders. |
| `e15aa93`..`3326fc4` | see the deploy log | material finish, Clear opacity, forearm and hand occluders, then the anatomical wrist frame. |
| `3326fc4` | `ProductARScan-BdKfeX_w.js` | wrist frame from the thumb, no camera sign. Superseded by the two rows below. |

Verified green locally (lint and build both exit 0) against `3326fc4`.

## Deploy log

| commit | assets | note |
| --- | --- | --- |
| `e15aa93` | `index-C8LPQc_P.js` / `index-BwFrOMB7.css` | was live until 27 Sep |
| `ca31d1b` | `index-CvB__2NS.js` / `index-mcnVgCeH.css` | dead CSS removed, no behaviour change |
| `71c063a` | `index-DrK9ZTUd.js` / `ProductViewer-BOadN-uJ.js` | Matte/Chrome/Clearcoat fixed, finish sliders 0-100 |
| `27501af` | `index-DrK9ZTUd.js` / `ProductARScan-DLYJXtF2.js` | Clear opacity + forearm occluder. **Backend also uploaded by hand; needs the restart.** |
| `d1e1288` | `ProductARScan-DLYJXtF2.js` | second, broad flat occluder for the hand |
| `3326fc4` | `index-2GIQtWpS.js` / `ProductARScan-BdKfeX_w.js` / `ProductViewer-Dmv_-P1y.js` / `ProductAR-DVnOo4nZ.js` | wrist frame from the thumb, no camera sign |
| `3860ac3` | `index-Cmrlhevq.js` / `ProductARScan-CC9nr5mu.js` / `ProductViewer-BjUTZdvq.js` / `ProductAR-V8a3_VqG.js` | offset rotated by the wrist basis only |
| wrist width fix | `index-DcGFttxE.js` / `ProductARScan-B4GYs2SA.js` / `ProductViewer-Bzm8dcEn.js` / `ProductAR-CR-1sGx5.js` | **current, live.** wrist width measured as palm breadth x 0.665, not palm length |

Verified live after each upload, since the notes flag a missing
`reference-hand.glb` as a past failure mode: `index.html` serves the new hashes,
`/reference-hand.glb`, `ProductARScan-*.js`, `ProductAR-*.js` and
`/api/products/apple-watch-ultra` all return 200. Static files only, so no
Alwaysdata restart was needed for any row above.

## The reference hand, measured rather than believed

The measurements in `lib/referenceHand.ts` were re-derived from the mesh, not the
rig bones, because the rig's bone node positions are **not** where the geometry
is. A sweep of joint positions came back degenerate: `pinky - index` was exactly
`(0, 0, 0)` and the chirality `0.000000`, because `IndexRoot`, `MiddleRoot` and
`PinkyRoot` are all co-located at the wrist. The mesh carries a `scale` of `380`
on node `Hand`, and the mesh accessor holds positions of about `+-0.004` in its
own units, so nothing about the hand's real shape is legible without applying
the world transform first.

With the world transform applied, 1134 mesh vertices, and the documented constants
confirmed:

| quantity | documented | measured from mesh |
| --- | --- | --- |
| arm end | `x +1.166` | `x` max `+1.201` |
| fingertip end | `x -1.211` | `x` min `-1.451` |
| wrist breadth | `0.9061` | Z span at `x 0.40..0.55` = `0.906` |
| thumb | `z -0.679` | outermost digit cluster `zMid -0.371`, mesh `z` min `-0.903` |
| finger tips across Z | `-0.336 / -0.018 / +0.377 / +0.648` | clusters `-0.371 / -0.020 / +0.320 / +0.668` |

Dorsal was checked separately, since it is the one axis with no self-evident
sign: fingertips sit **below** their knuckles in model Y by `0.169` to `0.210`
across three Z bands, and fingers curl toward the palm, so palm is `-Y` and the
back of the hand is `+Y`. That is the assumption the whole frame rests on and it
now rests on a measurement.

So canonical `+X` is toward the elbow, confirmed, and the studio is correct. When
the runtime disagreed with the studio, the studio was the one to believe.

### The wrist width was a palm length (`ProductARScan-B4GYs2SA.js`)

With the offset rotating correctly, the direction became right and the amount
became wrong: the watch landed well up the forearm instead of on the wrist. The
seller's `offsetX` of `0.53` had been authored in the studio, where the unit is
explicitly the **wrist**, since `REFERENCE_HAND_SCALE = 1 / WRIST_BREADTH_MODEL`
scales the model until its wrist is exactly 1.0 across.

The runtime multiplied that by `dist(p0, p5)`, which is the distance from the
wrist crease to the index knuckle. That is palm **length**, roughly three
quarters wider than a palm breadth on an adult hand, so every wrist width the
seller asked for came out about 1.75x too big. A `+0.53` offset that should have
moved the watch about 30mm up the arm moved it about 55mm.

`dist(p5, p17)` is the span the studio's unit actually wants, across the MCP
knuckle line, and `lib/referenceHand.ts` already documented the conversion:
`0.906 / 1.362 = 0.665`, which the existing note corroborates against the
anatomical figure of 0.64 to 0.70 for an adult hand. So:

```ts
const trackingPx = dist(p0, p5);   // gate only: is this hand worth tracking?
const wristPx = dist(p5, p17) * WRIST_BREADTH_OVER_PALM_BREADTH;
```

Two spans on purpose. The tracking gate is left on the original measure so the
distance at which tracking is dropped does not move as a side effect of fixing
the unit.

This also retro-justifies the occluder constants, which were already written in
wrist widths: `HAND_BREADTH = 1.36` against the newly named
`PALM_BREADTH_MODEL = 1.362`. Those numbers only mean anything if the thing they
are multiplied by is a wrist, so the occluders and the watch scale together and
their proportions to each other are unchanged. No occluder retuning is needed.

Expect the watch to render **smaller** as well as closer, by the same factor.
That is not a regression: at 1.75x the seller's `scale` of `0.85` was rendering
the watch about a wrist and three quarters wide. If the size is wrong once it
lands in the right place, the fix is `scale` in the studio, not this constant.

`npm run verify:units` settles the "does this match the studio" question rather
than leaving it to a device test. It reads the constants out of the real source
and puts the studio and the camera side by side for one physical hand:

| path | wrist measured | vs studio | offset applied |
| --- | --- | --- | --- |
| studio placeholder | `1.000000` | exact | `530.0px` |
| camera, new | `1.000000` | **exact** | `530.0px` |
| camera, old (palm length) | `1.7300` | x1.7300 | `916.9px` |

The match is an identity, not a fitted number: the palm across the studio's
scaled hand is `1.503145` units, and `1.503145 x 0.665272 = 1.000000`, because
`0.665272` is `0.9061 / 1.362`, the exact inverse of the `1 / 0.9061` the studio
scales the placeholder by. It also shows the old code was wrong about *size*, not
just offset: it drew the watch at `1.73` wrist widths where the studio shows
`0.85`. So the watch getting visibly smaller is the size finally matching, and
if it is still the wrong size after this, the lever is the seller's `scale`.

One number in that script is an estimate and is labelled as one:
`PALM_LENGTH_OVER_WRIST_BREADTH = 1.73` comes from adult anatomy, not the mesh,
because the mesh's X axis does not reproduce a real hand length (at the file's
own ~6.4cm per unit its wrist-to-middle-tip run is 1.666 units, about 10.7cm,
where a real hand is nearer 19cm). Its Z breadth is sound, which is why the
wrist and palm breadths are taken from the mesh and the length ratio is not. It
only sizes the "old" comparison row and cannot affect the pass or fail.

Verified in the built bundle rather than trusted: the minifier left the division

unfolded as `gl = hl/1.362` off `hl = .9061`, exported as `r`, imported into
`ProductARScan` as `se` and applied as `dist(p5, p17) * se`, with the gate still
`c < le` where `le = 28`. Note for next time: searching the bundle for the
decimal `0.6652` finds nothing, because it is computed, not written.
