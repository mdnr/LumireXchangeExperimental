# Bundled third-party assets

## `public/reference-hand.glb`

The reference hand shown on the seller "Align on wrist" page. It exists only as a
neutral stand-in for a wrist while a seller lines their model up; it is never
shown to buyers and never appears in a try-on view.

- **Title:** Rigged Hand
- **Author:** J-Toastie
- **Source:** https://poly.pizza/m/BEy8jbxm6A
- **Licence:** Creative Commons Attribution (CC BY)
- **Format:** glTF binary, 1,518 triangles, 20-bone rig, no textures

The file itself is used unmodified. It is adapted in two ways at runtime, which
CC BY asks to be made clear: it is rotated, scaled and shifted into the page's
wrist frame, and fingernails are placed over the rig's own finger bones. The
constants and maths for both are in `src/lib/referenceHand.ts`, and the result is
described there as measurements taken from the file rather than numbers tuned by
eye.

CC BY requires attribution. The credit for this asset is surfaced on the align
page itself, next to the hand.

### Why the procedural hand is still in the tree

`src/components/ReferenceHand.tsx` builds a hand out of capsules and spheres.
It is retained as the fallback that renders while this GLB loads, and if it ever
fails to load, so the align page is never without a wrist to align against.
