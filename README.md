# Depth of Field — 3D Simulator

A physically accurate depth-of-field simulator. A room holds a camera on a tripod, a subject and
props at known distances. Two full-screen views, toggled with `V`:

- **Third person** — orbit the room. The depth of field is drawn as a translucent frustum slab
  spanning the near and far focus limits, with the plane of focus marked inside it.
- **In camera** — the photograph itself, blurred by physically derived circle of confusion, under a
  camera-style HUD.

The organising idea is that **the diagram, the photograph and the numbers are three renderings of
one calculation.** Change the f-stop and the slab thickens, the background sharpens and the readout
moves — all from the same optics module. No blurred pixel traces back to a tuned constant.

```bash
pnpm install      # postinstall fetches the 3D assets into public/models (see below)
pnpm dev          # http://localhost:3000
pnpm test:run     # 202 tests, mostly optics
pnpm typecheck
pnpm build && node .output/server/index.mjs
```

## The assets

Most of them are not in the repo. A `postinstall` hook fetches them into `public/models/`, which is
gitignored, so a plain `pnpm install` is enough; `pnpm assets` re-runs the same fetch by hand and
`pnpm assets --force` re-downloads. The fetch is cached per asset, so repeat installs make no network
calls, and it is best-effort during install — a failure warns rather than breaking `pnpm install`, and
`SKIP_ASSET_FETCH=1 pnpm install` opts out (useful in CI, where the models are not needed to build or
test). That the assets are fetched at all is a licensing requirement, not a size optimisation: the [Poly
Haven](https://polyhaven.com) props are CC0 and could be committed, but the subject is a
[Renderpeople](https://renderpeople.com/free-3d-people/) free scan, licensed for use and **not for
redistribution**. Fetching beats vendoring.

Two models are committed anyway, because Sketchfab has no fetchable URL and a download script would
just break for everyone else. `scripts/vendor-asset.mjs` is the transform that produced them --
committing a binary means committing something nobody can diff, so the recipe lives in the repo
rather than in a shell history.

| Asset | Source | Licence |
| --- | --- | --- |
| Subject | [Renderpeople](https://renderpeople.com/free-3d-people/) free scan | Use only, no redistribution |
| Sofa, tables, vase, elephant, ceiling lamp, picture frames | [Poly Haven](https://polyhaven.com) | CC0 |
| Floor and wall surfaces (`wood_floor`, `beige_wall_001`) | [Poly Haven](https://polyhaven.com) textures | CC0 |
| Window | ["Window"](https://sketchfab.com/3d-models/window-e826c513779149d7ab3bde944647573f) by [jesseroberts](https://sketchfab.com/jesseroberts) | CC-BY-4.0 |
| Floor lamp | ["Sweep Floor Lamp, Black"](https://sketchfab.com/3d-models/sweep-floor-lamp-black-de6dc42e0fb44b4993ee58b4fda44daf) by [MADE.COM](https://sketchfab.com/made-it) | **CC-BY-NC-4.0** |

The floor lamp is the one asset that is not commercially usable. Swap it or drop it before shipping
this anywhere that matters; nothing else in the scene carries that restriction.

### Units, orientation and materials

Everything under `public/models` is in metres, base at y=0, facing +Z. The scene data assumes it,
so `defaultScene.ts` never contains a magic unit conversion. Getting there is not free: the Poly
Haven props already agree, the Renderpeople scan is in centimetres under a 0.001 node scale and
carries `normalizeToHeightM: 1.72`, and the two Sketchfab models were in inches and centimetres
respectively, one of them Z-up and modelled facing +X. `vendor-asset.mjs` bakes that out.

Three choices worth knowing:

- **Loaded materials win.** `keepMaterials: true` on a `gltf` prop keeps the model's own PBR maps
  instead of re-skinning it from `MaterialSpec`. This is not cosmetic. Defocus is only visible
  where there is high-frequency detail to destroy, so the roughness and normal maps *are* the
  effect -- a flat-shaded sofa renders identically at f/1.2 and f/16. The window is the sole
  exception: it ships one flat grey material and no maps, so there is nothing to preserve, and its
  220k triangles of curtain fold supply the detail instead.
- **Bulbs are lit by the scene, not the model.** glTF cannot express an emissive above 1.0, which
  is exactly the threshold bokeh needs, so every downloaded lamp arrives dark. `emissiveMaterials`
  names the materials to drive from `MaterialSpec` -- the shade keeps its maps, the bulb gets the
  glow. It keys on material rather than node because the ceiling lamp's globe, glass and body are
  three primitives of one mesh.
- **Everything is resampled to 2k.** The gather samples a downsampled colour buffer, so texel
  detail finer than roughly screen resolution cannot survive into the blur. The scan's 4K
  supersampled maps cost 10 MB and three JPEG decodes before first paint to buy nothing visible.
  Geometry gets the same treatment where it is committed: quantizing the window to 14-bit positions
  is 0.1 mm on a 1.75 m frame and takes it from 5.4 MB to 3.5 MB. No `simplify()` anywhere, though
  -- decimating the curtain folds would destroy the only detail that model has.

## The assistant

A chat panel on the right drives the simulator through tools. Ask for "more background blur" and it
reads the scene, changes the camera, photographs the result and tells you what it sees.

It needs `ANTHROPIC_API_KEY` in `.env.local`. Without one the panel loads and the route returns a
500 saying so; nothing else in the app depends on it.

```
src/features/dof/ai/tools.ts      tool definitions + browser implementations
src/features/dof/ai/snapshot.ts   canvas registry and capture
src/features/dof/ai/ChatPanel.tsx the panel
src/routes/api.chat.ts            the server half -- holds the key, runs no tools
src/lib/scene/catalog.ts          what it is allowed to add
```

**Every tool runs in the browser.** That is forced, not stylistic: the authoritative scene is a
Zustand store in the tab and the thing worth photographing is a WebGL canvas in the tab, so a server
tool would have nothing to read and nothing to look at. The server route exists to hold the API key
and to declare the same tool shapes, which `mergeAgentTools` pairs with the handlers the request
carries.

Three decisions worth knowing:

- **It can see.** `snapshot` returns a `ContentPart[]` with an image part rather than a stringified
  object, so the model actually receives the render. The same image is shown inline in the panel, so
  you can check its description against what it was looking at. Capturing needs
  `preserveDrawingBuffer` on the WebGL context -- without it the buffer is cleared before a tool
  handler runs and every capture comes back blank. The capture waits for a canvas that is *drawn*,
  not merely mounted: a stage that has been sized but not rendered is a flat colour, and a vision
  model will describe an empty room with total confidence.
- **It picks from a catalogue, never a URL.** `addProp` takes a `CatalogKey`. A model free to name
  its own glTF path would eventually name one that 404s, and one free to write a `PropGeometry`
  would eventually write a 40-metre sofa. Positions are clamped into the room on the way in for the
  same reason.
- **It pans as well as moves.** The tripod's yaw is what aims the lens, so `aimCameraAt` points the
  camera at a prop or a spot and `setCamera`'s `rotationYDeg` sets an absolute heading. Distances
  are axial and therefore signed: pan away from something and it reports a negative distance, which
  `focusOn` refuses rather than focusing on empty space behind the camera.
- **It cannot edit the optics.** There is no tool that writes a circle of confusion or a blur
  radius. It moves the same lens, aperture and focus controls a person has, and every number it
  reports comes back out of `src/lib/optics/`. An assistant that could tune the output directly
  would make the whole "no blurred pixel traces back to a tuned constant" claim worthless.

Tools that can fail in a way the model could fix -- a bad id, a prop behind the camera -- return
`{ ok: false, reason }` instead of throwing. A thrown error ends the run where it stands, leaving
the user with a column of green ticks and no reply.

Known gap: added props are session state and are not encoded in the URL, so **Copy link does not
reproduce a scene the assistant built** -- moves and camera changes survive, added props do not.

`node scripts/drive-chat.mjs "<prompt>"` runs a prompt end to end in headless Chrome and prints the
tool calls, the image sizes and the resulting URL, which is how the above was checked.

## The optics

Everything lives in `src/lib/optics/`, which imports nothing — no three.js, no React, no DOM. A test
enforces that.

Acceptable circle of confusion `c` is a **convention**, not a fact, so it is a first-class control.
The default is the published per-format value (full frame 0.030 mm), because `diagonal / 1500`
computes 0.0288 and would put every reading 3–6% away from PhotoPills and DOFMaster.

```
hyperfocal   H  = f² / (N·c) + f
near limit   Dn = s(H − f) / (H + s − 2f)
far limit    Df = s(H − f) / (H − s)          → ∞ when s ≥ H
blur disc    C  = f² / (N(s − f)) · (z − s)/z    signed: − in front, + behind
on screen    C_px = C_mm · renderHeightPx / sensorHeightMm      (a diameter)
```

**The limits are that last equation solved for `C = c`.** Expanding `Dn` with `H − f = f²/(Nc)`
gives `s·f² / (f² + Nc(s − f))`, which is exactly the foreground root of the blur-disc formula. That
is not a coincidence to be admired but an invariant to be tested — see below.

**Diffraction** is modelled and on by default. The Airy disk is `2.44·λ·N`, and it combines with
defocus in quadrature. Rearranging `sqrt(cGeo² + airy²) = c` gives `cGeo = sqrt(c² − airy²)`, so
diffraction simply **shrinks the CoC budget** and every closed-form expression above keeps working
unchanged — no numerical solver required. When `airy ≥ c` nothing in the frame is acceptably sharp,
which is why a full-frame camera runs out of usable depth of field at f/22.4 and Micro Four Thirds
at f/11.2.

### Traps worth knowing

- **Units.** `(s − f)` mixes a distance with a focal length, so the optics work in **millimetres
  internally** with metre-typed boundaries. Metres and feet exist only at the display layer.
- **Axial depth.** The shader uses `-viewZ`, never `length(viewPosition)`. Radial distance makes
  the in-focus surface a sphere and invents corner softness.
- **Diameter vs radius.** `C` is a diameter; the gather wants a radius. Every variable is named
  `...DiameterPx` or `...RadiusPx`.
- **`filmGauge`.** three.js defaults it to 35, which is wrong for "35mm format" — the image gate is
  36×24. Left alone it costs 2.7% of the field of view, silently. A test asserts both that the
  correct gauge matches and that the default does not.
- **Sensor aspect.** The in-camera view renders into a canvas letterboxed to exactly the sensor's
  aspect ratio, because the millimetres-to-pixels conversion is only valid when the render aspect
  matches the sensor's. Switching full frame → MFT visibly reshapes the frame from 3:2 to 4:3.
- **Datum.** Distances are measured from the lens, which is where the render camera sits — that is
  what makes the picture correct. Real focus scales are engraved from the image plane, so the panel
  shows both.

## The render pipeline

`src/features/dof/render/`. A fixed six-stage graph, hand-written against three's render targets:

1. **Scene** → HDR linear colour + depth, at a supersampled sensor-aspect target.
2. **CoC** → signed blur radius in pixels. The sign carries the near/far split for free.
3. **Downsample** → half-res colour, plus conservative CoC (`min` for near, `max` for far, so blur
   does not vanish on thin features).
4. **Near-field dilation** → two separable max passes. This is what lets a blurred foreground
   spread *past its own silhouette* over the background.
5. **Dual gather** → near and far. Two weight terms, both physical: a sample contributes only if
   its own disc reaches this pixel (`clamp(rSample·bound − dist, …)`), and it is divided by
   `π·r² + 1` for scatter energy, which is why a defocused highlight goes large and *dim* rather
   than large and bright.
6. **Composite** → tone map and sRGB encode, exactly once. Every intermediate buffer is linear
   half-float; blurring gamma-encoded values is the usual reason hand-rolled bokeh looks wrong.

`postprocessing` is deliberately **not** a dependency. It ships a `DepthOfFieldEffect` with a
`bokehScale` knob, and having that in the tree invites exactly the tuned-constant blur this project
exists to avoid.

**Bokeh shape comes from the reach test, not the kernel.** In a gather, a pixel is lit by a
defocused point if it falls inside that point's disc — so testing Euclidean distance yields a
perfectly round highlight no matter how many blades the lens has. The test is against the aperture
polygon instead, which is the same statement as "the point-spread function is the indicator function
of the exit pupil". Realistic blade counts make a subtle difference (an octagon's apothem is only
7.6% shorter than its circumradius); the blade override in the Render panel forces a low count so
you can confirm the shape is real.

## Verification

**Automated** — `pnpm test:run`:

- **The inverse invariant.** Across focal length × f-number × focus distance × all seven sensor
  formats (~4,700 assertions, diffraction on and off), the blur disc at the reported near and far
  limits equals the CoC budget to 1e-9, and an independently derived inverse solver reproduces both
  limits to 1e-12. This is what mechanically proves the readouts and the blur are one equation.
- **Analytic identities** — focused at `H`, `Dn` is exactly `H/2` and `Df` is infinite; as `s → ∞`,
  `Dn → f²/(Nc)`; a subject at 1.5 m and one at 3.0 m blur identically when focus is at 2 m (both
  have `|z−s|/z = 1/3`), which catches any sign or `1/z` error.
- **External checks** — published angles of view (24 mm → 84.06° diagonal, 50 mm → 46.79°), the
  diffraction limits above, and cross-format equivalence.
- Monotonicity laws, lens clamping, total-function URL normalisation, area-uniform kernel sampling,
  layout round-trips, letterbox maths, and a guard that `src/lib` never imports a framework.

**Runtime** — the **CoC probe** in the Render panel. The shader reports both the blur radius it
computed and the world depth it derived it from; the CPU then independently computes what the radius
should be at that depth, using the same functions that produce the HUD. Measured agreement is
**within 0.003 pixels**. `scripts/verify-coc.mjs` runs this over a grid headlessly.

**The loop closes** with `scripts/verify-2px.mjs`. Select the "2 px" sharpness criterion and the
depth-of-field limits are *defined* as where rendered blur reaches two pixels across — so the blur
at the reported limits must be a 1-pixel radius. It measures **1.0005 px** at both limits and
exactly 0 at the plane of focus.

**Build** — `grep -rl WebGLRenderer .output/server/` returns nothing: three.js never reaches the
server bundle, and its 1.1 MB chunk is code-split off the initial load.

## What is not modelled

Listed in the app itself, under "What this does not model" — the tool asks photographers to trust
its numbers, so it owes them the boundaries of the approximation. In short: partial occlusion is
approximated rather than solved, occluded highlights contribute nothing, large discs are
undersampled (the speckle on big highlights), blur is clamped at a maximum radius and the HUD says
so when it bites, transparency is unsupported, and the lens model has no aberrations, focus
breathing or mechanical vignetting.

Those are limits of the **rendering**. The depth-of-field numbers are exact closed-form thin-lens
optics, continuously checked against the shader at runtime.

## Layout

```
src/lib/optics/        pure optics — zero imports, ~4,700 assertions
src/lib/scene/         scene data model, layout maths, letterbox maths
src/features/dof/
  ai/                  assistant panel, tools, canvas capture
  state/               zustand store, URL write-through, derived optics
  render/              DofPipeline, bokeh kernel, GLSL
  scene/               procedural props behind a GLTF-ready interface
  views/               third-person overlay, in-camera rig
  ui/                  controls, HUD, readouts, debug panel
src/routes/api.chat.ts the assistant's server half
scripts/               headless verification harnesses
```

State lives in a zustand store that is authoritative, with the URL as a debounced write-through
sink — so every setting is shareable, but a drag never round-trips through the router. Scene props
are data behind a `PropGeometry` seam, so swapping a procedural prop for a loaded GLTF model is a
one-line change that touches nothing else.

That store is also the assistant's only way in. It drives the same actions the sliders do, which is
why its changes show up in the sidebar, the URL and the render without any of them knowing an
assistant exists.
