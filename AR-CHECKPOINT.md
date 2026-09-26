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
is correct, which is what the page needs. It has not been reviewed by eye yet,
only asserted numerically.

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
controls now default to zero, which is correct, so the watch orients itself with
no manual adjustment. They remain as URL overrides only.

The two failures that pointed at the cause, worth keeping:

- Rotating about the dial axis can only roll the watch in its own plane and can
  never change which way the dial points. The user diagnosed this correctly.
- Forearm 270 degrees produced a dial pointing *away* from the camera. A wrong
  facing, not a mistuned angle.

## Still open

- **Residual tilt.** The dial reads on local Z but leans back a little, and the
  model was authored with the case tipped up off the band. This is a real
  constant angle, not a mapping error, so quarter turns cannot express it and
  snapping to 90 degree steps left the watch visibly crooked. A `?ar-tilt=` trim
  in whole degrees now exists for it, defaulting to 0, with an on-screen row at
  -10/-5/0/+5/+10/+15. **The correct value is not yet known.** It is the next
  thing to trim on device.
- **Position.** `armR` standoff pushes the watch out along the palm normal, and
  that normal carries a leftward component (measured `palmN -0.38 -0.05 0.93`),
  which puts the watch left of the wrist centre. Exaggerated when the wrist fills
  the frame. `?ar-arm` (default `0.45`) trims it. Not yet adjusted.

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

## Debug parameters

| param | meaning |
| --- | --- |
| `?ar-debug` | landmark overlay plus a readout of standoff, wrist, facing, forearm and roll |
| `?ar-axes` | draws the model's own X, Y and Z axes on the watch. **This is how the dial axis was measured.** Use it rather than tuning a mapping |
| `?ar-spin=0\|90\|180\|270` | quarter turn about the dial normal. Defaults to 0, which is correct |
| `?ar-facing=0\|90\|180\|270` | quarter turn about the remaining axis. Defaults to 0, which is correct |
| `?ar-tilt=-30..30` | free-angle trim for the case leaning back off the band. Defaults to 0. **The right value is still unknown** |
| `?ar-arm=0.45` | standoff from the wrist, as a fraction of wrist width |

`ar-spin`, `ar-facing` and `ar-tilt` all have on-screen button rows in the AR
overlay, which is far easier than editing a URL on a phone. The two quarter
turns sit at zero and should stay there; they are trims, not the fix.

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

The password is read from `%TEMP%\opencode\ad-pass.txt` and deleted afterwards,
so it never sits in a command line or in the repo. Create that file first:

```powershell
Set-Content -LiteralPath "$env:TEMP\opencode\ad-pass.txt" -Value '<password>' -NoNewline
```

**Preserve on the server:** `/home/mdnr/www/app.db`, `wwwroot/models/`, and
remotely uploaded `wwwroot/images/`. Nothing is ever deleted by the upload, which
is what keeps these safe. Stale hashed assets do accumulate on the server; they
are harmless, since `index.html` only references the current ones. The database
backup is at `%TEMP%/opencode/app.db.backup`.

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

## Credentials

The SFTP password for `mdnr@ssh-mdnr.alwaysdata.net` appears in this repo's shell
history and in transcripts. It is not stored in any file in the repo, which is
the right state. **Rotate it**, and prefer a key over a password.
