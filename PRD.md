# PRD: Paper Cutout Photo Editor (working title "Cutout")

## Context
Users want a quick way to make a tactile, "paper craft" photo: their photo sits beside a realistically textured sheet of paper, they punch a shape out of the paper (revealing a duplicate of the photo beneath), then paste the punched-out piece onto the photo. The result is one continuous image they download. This PRD scopes **Round 1 (MVP)**: the core mechanic with **one shape**, cut on the paper side, paste on the photo side, download. Site UI, landing page and visual polish are explicitly out of scope.

Project folder: `/Users/keila/projects/cutout` (contains `Shapes/`, `StockImages/`, `UIMoodBoard/`, `visualExamples/`).

## Visual Direction (from `visualExamples/` and `UIMoodBoard/`)
- **Paper**: matte, fine film-grain speckle across the whole sheet (strong in `1circle`, subtle in `1sillyShape`); warm off-whites, sage green, cream. Very soft, not glossy. Crinkle should be subtle by default.
- **Holes**: crisp clean-edged cuts through the paper; the photo shows through, so the hole region looks like a little window onto the picture.
- **Pasted pieces**: flat paper-colored shapes with the same grain as the sheet, lying on the photo, with a very faint soft shadow/emboss (`1sillyShape`).
- **Composition**: many stamps per image, scattered, varying size and rotation, overlapping allowed (`4manyStarsHorizontal`, `1circle`). Layout: paper and photo each fill exactly half of a seamless canvas.
- **App chrome (later)**: quiet, editorial, soft pastel painterly background, frosted white rounded cards, serif type, dotted-circle motifs (`UIMoodBoard/example1.jpg`). Not built in Round 1, but keep controls minimal and unobtrusive so it can be skinned later.
- Text overlays appear in the examples but are **out of scope**.

## Goals
1. Upload (or pick a stock) photo and get a believable textured-paper composite.
2. Punch a shape out of the paper and see the underlying photo through the hole.
3. Move the punched piece onto the photo side.
4. Download the final flat image.

## Non-Goals (Round 1)
- Landing page, site chrome, branding, final visual design.
- More than one shape (the rest are Round 2).
- Accounts, saving projects, sharing. (A basic undo-last / reset is in scope; full history is not.)
- Mobile/touch optimization (cursor-based interaction assumed).

## Users & Use Case
Casual creators making stylized photos for social (Instagram Stories in particular). Single-session, no sign-in.

## User Flow
1. **Choose image**: upload JPEG/PNG or pick a default from `StockImages/`.
2. **Paper setup**: pick paper color, noise level, crinkle level.
3. **Orientation**: pick which side the paper goes on. Constrained by photo shape:
   - Vertical (portrait) photo → paper on **left** or **right**.
   - Horizontal (landscape) photo → paper on **top** or **bottom**.
   - Square → **any of the four sides** allowed.
4. **Cut**: pick the stamp shape; cursor becomes a dashed outline of the shape (live preview); click on the paper to punch it out. The hole reveals the duplicate photo beneath.
5. **Paste**: the punched-out piece is "emptied" from the hole and the user places it on the photo side (drag, drop/click to place).
6. **Repeat** steps 4–5 as many times as desired to build up the composition.
7. **Export**: choose output size and download.

## Functional Requirements

### F1. Image input
- Upload local image (JPEG/PNG; max dimension capped for performance, e.g. 4096px, downscale above).
- Stock images: a small default set loaded from `StockImages/`.

### F2. Canvas composition
- Final canvas = photo + paper side by side (or stacked), **flush, no gap**, one continuous image.
- Two layers:
  1. **Base layer**: photo on one half, an exact duplicate of the photo on the other half.
  2. **Paper layer**: opaque paper covering the duplicate half only.
- Cutting the paper reveals the aligned duplicate-photo pixels beneath (same photo region the paper covers, so the hole shows "the photo through the paper").
- Canvas dimensions = photo dimension doubled along the paper axis.

### F3. Paper customization
| Control | Effect | Notes |
|---|---|---|
| Color | Base paper color | Color picker + a few presets |
| Noise level | Paper grain / fibre speckle | Slider 0–100 |
| Crinkle level | Wrinkle/fold lighting (normal/shading map) | Slider 0–100 |
- Rendering must look physical: grain plus subtle shading from crinkles. Procedural generation (noise + displacement-derived lighting) preferred over image assets so color/levels are adjustable live.
- Paper edge cut by a shape should show a slight edge thickness/shadow so the hole reads as cut paper (nice-to-have for R1).

### F4. Cutout shapes
- Source art: JPEGs in `Shapes/` (currently `blobShape1`, `heartShape`, `paperClip`, `polygonShape`, `spiralShape`, `starBlobShape`) are traced into **vector paths** (SVG) to become selectable shapes.
- **Round 1**: ship **one** shape (recommend the blob: simple closed contour, traces cleanly).
- **Round 2 target list** (from draft): Organic: spiral, blob, puffy star. Polygon: star, circle, square, multi-point polygon. Note the draft list and the `Shapes/` folder don't fully match (folder has heart and paperclip; no circle/square/star art) — reconcile in Round 2. Circle/square can be generated natively rather than traced.
- Vectorization is a build-time asset step (threshold → trace → simplify → single closed path), not a runtime feature.

### F5. Cut interaction
- Selecting a shape turns the cursor into a **dashed outline** of that shape at a fixed size (size control is a stretch goal).
- Cursor preview is only active over the paper region.
- Click = punch: shape path is subtracted from the paper layer (clip/mask), revealing the layer below. Holes may overlap earlier holes (as in the examples).
- A punched-out **piece** object is created containing the paper pixels (with texture) that were removed, ready for pasting.
- Each stamp gets a **random rotation**; size has a default and a simple size slider (examples show varied sizes).

### F6. Paste interaction
- After a cut, the piece appears detached from the hole ("emptied") and becomes draggable.
- User drags it onto the **photo side only** and drops it; it cannot be dropped on the paper side. Dropping on the paper side snaps back / is rejected.
- Piece is rendered with a very faint soft shadow so it reads as sitting on the photo.
- **Multiple cut-and-paste cycles**: the user can punch several holes first and then paste, or alternate. Every unplaced piece stays in a "pending" tray/stack (or hovers near its hole) until placed. Pieces can be repositioned until export.
- Basic **undo last** and **reset** controls.

### F7. Export
- Output: static PNG (JPEG optional).
- Size options:
  - **Original size**: canvas at native resolution (photo size doubled on the paper axis).
  - **IG Story**: 1080×1920, **crop to fill** (cover). Default crop is centered; the composite is scaled until it covers the frame. A simple drag-to-reposition crop is a stretch goal.
- Export flattens all layers at full resolution (not the on-screen preview scale).

## Round 1 Scope Summary
| In | Out |
|---|---|
| Upload + stock images | Landing page / UI polish |
| Paper color, noise, crinkle | Multiple shapes (R2) |
| Orientation constraints | Manual shape rotate/flip controls |
| One shape, repeatable cut + paste, random rotation, size slider | Full undo history |
| PNG export (original + IG Story) | Saving/sharing |

## Technical Notes / Recommendation
- Stack: browser-only app, HTML5 Canvas (2D) — no backend. Paper texture generated per-pixel (value noise + crinkle height map → lit normal shading) on an offscreen canvas; regenerate on slider change (debounced).
- Cut implemented with canvas clipping using an SVG `Path2D` from the traced shape; piece captured via `drawImage` through the same clip.
- Hit-testing/placement in canvas coordinates; account for devicePixelRatio and display scaling so export matches preview.
- Performance: preview at reduced resolution, export re-renders at full size.

## Acceptance Criteria (Round 1)
1. Uploading a portrait photo offers only left/right; landscape offers only top/bottom.
2. Paper meets the photo edge with zero visible seam; the downloaded image is one flat picture.
3. Changing color/noise/crinkle visibly updates the paper live.
4. Hovering the paper shows a dashed shape outline following the cursor; clicking punches a hole through which the matching region of the photo shows.
5. Several pieces can be cut and then dragged onto the photo side and dropped; dropping on the paper side is rejected.
6. Output reads like the reference images in `visualExamples/` (grainy matte paper, clean-edged holes, paper-colored stamps on the photo).
7. Download works for original size and IG Story size, and the file matches what's on screen.

## Decisions (resolved)
1. Square photos: paper may go on any side.
2. IG Story export: crop to fill.
3. Pasted pieces: photo side only.
4. Multiple cut/paste cycles supported in R1.
5. Holes show the duplicate photo directly beneath the paper (peek-through).
6. Stock images: `StockImages/stockImage1.jpg` and `stockImage2.jpg` (2 images, confirmed). Shapes folder is `Shapes/` (capital S) with 6 JPEGs.

## Remaining minor questions
- Size slider range and default stamp size (suggest ~6–12% of the shorter canvas edge).
- Should the pending-piece tray be visible UI or should pieces simply float beside their holes?
- Licensing/source of the two stock images (assumed user-owned).

## Verification (when built)
- Run locally in the browser; test portrait, landscape and square images.
- Pixel-check export: seam row/column continuous; hole region equals duplicate-photo pixels.
- Compare export vs. on-screen preview at 1x and retina.
- Test each paper slider at 0/50/100 for visual sanity.

