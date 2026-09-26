# AR Wrist Watch - Checkpoint Notes

Checkpoint tag: `ar-metric3d-checkpoint` (at commit `2e6c2c2`)
Orientation-fixed tag: `ar-facing-fixed` (at commit `fc564fa`)
Live site: https://mdnr.alwaysdata.net

## Repo state right now

- Branch `master`, no remote (deploy is manual, see below).
- Working tree is clean apart from this notes file, which is untracked.
- Deployed: `fc564fa` as `ProductARScan-B4dMx8l7.js`.
- **The dial now faces the camera, confirmed by the user on a real device**, with
  the back of the hand to the lens. That was the last blocking bug.

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

Resolved arrangement, all three now measured rather than assumed:

```
local Z (dial)  ->  palm normal, at the camera
local Y (band)  ->  along the forearm
local X         ->  across the wrist
```

The band shares the dial's axis because it encircles the wrist, which is what
leaves the forearm on Y.

This is the same column order the old **fallback** branch already used
(`makeBasis(across, armDir, faceDir)`), which is why that fallback sat
plausibly on the wrist: its axes were right and only its normal was poor.

- Which band axis runs up the forearm was never determinable from geometry, and
  is now settled by the arrangement above.
- No node rotations or scales were missed: 76 of 78 nodes use TRS, but all have
  identity rotation and unit scale, so the bbox is unaffected either way.

**The basis must stay right handed.** An earlier attempt used
`faceDir x armDir` and produced determinant **-1**, a mirror rather than a
rotation, and the quaternion derived from it drifted. With the current column
order the third column is recovered as `across x armDir`, so the determinant
stays +1.

**Front camera mirroring is already correct.** `toScreen` mirrors the landmark
x-coordinate when the selfie camera is active, and the video element gets the
same treatment, so overlay and feed agree. Both cameras show the same dial
offset, which confirms mirroring is not the cause.

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

- **Band direction.** Not yet confirmed on device. Should follow from the
  arrangement above, with local Y on the forearm, but the user has not stated it
  yet.
- **Residual tilt.** The user noted the dial sits "slightly tilted up". Left
  deliberately alone, since it is a small angle between the dial axis and the
  palm normal and the frame needed confirming first. If it persists, fix it as
  a small constant angle, not another quarter turn.
- **Position.** `armR` standoff pushes the watch out along the palm normal, and
  that normal carries a leftward component (measured `palmN -0.38 -0.05 0.93`),
  which puts the watch left of the wrist centre. Exaggerated when the wrist fills
  the frame. `?ar-arm` (default `0.45`) trims it.
- **Sense of the roll.** If the watch rotates but feels backwards, that is a sign
  convention, one character to fix. Judge on the **rear** camera: the selfie
  preview is mirrored, so inverted spin there is expected and not a bug.

## Not yet verified on a real device

- That `multiHandWorldLandmarks` is being delivered, now confirmed indirectly:
  the user read `roll -65deg 3D` rather than `PINNED`, so the metric hand is
  arriving on the test phone.

## Debug parameters

| param | meaning |
| --- | --- |
| `?ar-debug` | landmark overlay plus a readout of standoff, wrist, facing, forearm and roll |
| `?ar-axes` | draws the model's own X, Y and Z axes on the watch. **This is how the dial axis was measured.** Use it rather than tuning a mapping |
| `?ar-spin=0\|90\|180\|270` | quarter turn about the forearm axis. Defaults to 0, which is correct |
| `?ar-facing=0\|90\|180\|270` | quarter turn about the remaining axis. Defaults to 0, which is correct |
| `?ar-arm=0.45` | standoff from the wrist, as a fraction of wrist width |

Both `ar-spin` and `ar-facing` also have on-screen button rows in the AR
overlay, which is far easier than editing a URL on a phone. Both sit at zero and
should stay there; they are trims, not the fix.

## Deploy

`deploy.ps1` builds the frontend, merges it into `Server/wwwroot` and publishes.
Then upload **explicitly, per file**, with sftp:

- `publish/wwwroot/index.html`
- every file in `publish/wwwroot/assets/`

Never upload recursively, that previously created a wrong nested `wwwroot`.
Static files need no Alwaysdata restart, but users must hard refresh.

**Preserve on the server:** `/home/mdnr/www/app.db`, `wwwroot/models/`, and
remotely uploaded `wwwroot/images/`. The database backup is at
`%TEMP%/opencode/app.db.backup`.

## Last known good builds

| commit | asset | behaviour |
| --- | --- | --- |
| `1252322` | `ProductARScan-Dvlm0uiS.js` | pinned to camera, no rotation. Dull but not wrong. |
| `2e6c2c2` | `ProductARScan-B2exgz03.js` | metric 3D roll plus on-screen spin control. |
| `a8e96b1` | `ProductARScan-DV2W4q9h.js` | adds the `?ar-axes` probe that found the dial axis. |
| `fc564fa` | `ProductARScan-B4dMx8l7.js` | **dial faces the camera. Current, and confirmed on device.** |

## Credentials

The SFTP password for `mdnr@ssh-mdnr.alwaysdata.net` appears in this repo's shell
history and in transcripts. It is not stored in any file in the repo, which is
the right state. **Rotate it**, and prefer a key over a password.
