# AR Wrist Watch - Checkpoint Notes

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
| `e15aa93` | `index-C8LPQc_P.js` | **bundled rigged hand, no bangle, rotation sliders. Current, live.** |

Verified green locally (build and lint both exit 0) against `e15aa93`, which is
what the live site served. Removing the dead `.ar-spin-*` CSS in the commit that
touched this section changes the asset hashes, so the next deploy will publish
new filenames; nothing about that is a behaviour change.

## Deploy log

| commit | assets | note |
| --- | --- | --- |
| `e15aa93` | `index-C8LPQc_P.js` / `index-BwFrOMB7.css` | was live until 27 Sep |
| `ca31d1b` | `index-CvB__2NS.js` / `index-mcnVgCeH.css` | **current, live.** dead CSS removed, no behaviour change |

Verified live after the `ca31d1b` upload, since the notes flag a missing
`reference-hand.glb` as a past failure mode: `index.html` serves the new
hashes, and `/reference-hand.glb`, `ProductARScan-O4WeZbSO.js`,
`ProductAR-C85-hmh4.js` and `/api/products/apple-watch-ultra` all return 200.
Static files only, so no Alwaysdata restart was needed.
