# Blender authoring workflow — siding sample

A bounded proof that this project can author architectural detail in Blender,
render it, and get it back out as named geometry. One wall sample, not a
house. Nothing here touches the website: the whole workflow lives in
`assets/blender/` and writes only into `assets/blender/out/`.

## Run it

From the repository root, on the Mac:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python assets/blender/siding_sample.py \
    -- --out assets/blender/out
```

`--factory-startup` matters: it means the result does not depend on anything
in a personal Blender profile, which is the difference between a script and a
recipe that only works on one machine.

Flags, all after the `--`:

| flag | default | what it does |
| --- | --- | --- |
| `--out DIR` | `assets/blender/out` | where the four outputs land |
| `--preview` | off | 24 samples instead of 160, for iterating |
| `--skip-render` | off | build, save and export without rendering |
| `--samples N` | 160 | Cycles samples for the final render |
| `--res W H` | 1600 1200 | render size |
| `--engine NAME` | `CYCLES` | falls back with a printed note if unavailable |
| `--colour NAME` | `porcelain` | `porcelain`, `navy` or `sandstone` |
| `--sun N` | 8.0 | sun irradiance |
| `--sky N` | 0.032 | sky dome strength |

The default finish is porcelain rather than the house navy on purpose: a pale
board shows the lap shadow, and the lap shadow is what this sample exists to
demonstrate. `--colour navy` gives the elevation colour.

## What it writes

```
assets/blender/out/wce_siding_sample.blend   the authored scene
assets/blender/out/wce_siding_sample.png     the render
assets/blender/out/wce_siding_sample.glb     68 named meshes
assets/blender/out/report.txt                what actually happened
```

`live_reload.py` writes none of these; see below.

`report.txt` is the important one for review. The script records every point
where it had to adapt to the Blender build it found — a missing socket name, a
renamed enum, an exporter argument that was rejected — and writes them there
rather than failing silently or pretending.

## What is in the sample

A corner of wall, 2.4 m long and 2.4 m tall, with a 0.38 m return so the
corner board has a corner to turn:

- sheathing, and a weather barrier drawn as its own thin layer
- a starter strip, so the first course leans the way the rest do
- fibre-cement lap siding, 8¼ in board at a 7 in exposure, cut around the
  opening, dying into a frieze board at the top
- framing behind the sheathing, and a rough opening that is actually missing
  from all three layers, so the window has depth to be recessed into and
  something dark behind it
- 5/4 leg casings, a heavier head casing, and a sloped drip cap over it
- a sill with a fall across it
- a jamb set back into the opening, a sash with stiles, rails and a meeting
  rail, and glass behind both
- corner boards as an L, with the siding on both walls dying into them

Every one of those is geometry with thickness. The two numbers that matter:

- **the siding butt stands 15.8 mm proud** of the barrier, because a lapped
  board rides on the one below it and leans out by its own thickness over its
  width — about 2.2°. That lean is the shadow under every course.
- **the casing stands 9.2 mm proud of the butt**, because 5/4 trim is 25 mm
  and 25 − 15.8 = 9.2. Siding dies into trim; trim is never flush with it.

Neither can be faked with a texture, and both are what tell a homeowner they
are looking at a wall rather than at a picture of one.

## Choices worth reviewing

- **The sun and the sky are one setting.** `SUN_ELEVATION_DEG` and
  `SUN_AZIMUTH_DEG` drive the lamp and the sky texture together. Aiming them
  separately is how a scene ends up with a highlight that does not match its
  own horizon.
- **The camera is level and shifted, not tilted.** `shift_y` frames the wall
  the way a tilt-shift lens does on a real body, so verticals stay vertical.
  Tilting a camera up at a building converges them, and that is the first
  thing an architectural photographer corrects.
- **The sun disc is 0.526°**, its real angular diameter, which is why nothing
  in the frame has a razor-sharp shadow edge.
- **1.2 mm bevels on the trim.** A mathematically sharp arris cannot catch the
  sky, and an edge that does not catch the sky reads as computer-generated
  whatever the material is doing.
- **No operators for geometry.** Everything is built from explicit vertices.
  Operators depend on selection and a UI context that does not exist in
  background mode, and they turn a script into a recording of mouse clicks.

## The daylight balance, and why it is two numbers

`--sun` and `--sky` are exposed because the balance between them is the whole
difference between a sunny day and an overcast photograph of a model, and it
is worth arguing about in front of a render rather than in a file.

They were set by measuring, not by taste. At `--sun 8 --sky 0.032` a
porcelain board in sun sits about **4.5 times brighter** than the same board
on the shaded return, which is roughly what open shade measures on a clear
day. The route there is worth recording because it is counter-intuitive:

| sun | sky | lit : shaded |
| --- | --- | --- |
| 4.2 | 0.18 | 1.16 |
| 12 | 0.18 | 1.42 |
| 24 | 0.18 | 1.63 |
| 8 | 0.06 | 2.50 |
| 8 | 0.045 | 3.20 |
| **8** | **0.032** | **4.55** |

Raising the sun five-fold barely moved the ratio: it only drove the lit face
into the tone curve's roll-off while the shaded face stayed exactly where it
was. The thing that was wrong was the sky, and the sky is what had to come
down. A flat-looking render is almost always too much ambient rather than too
little key.

## Blender 5 notes

The script was executed against Blender **5.0.1** (as the `bpy` PyPI module,
in a Linux container — see the limitations below). Two things changed between
4.x and 5.x and are handled so it runs on either:

1. **`use_nodes` is deprecated** and scheduled for removal in 6.0; materials
   and worlds arrive with a node tree already. The script sets it only when
   `node_tree` is `None`, which is true on 4.x and false on 5.x.
2. **The Nishita sky was split.** `sky_type` no longer offers `NISHITA`; 5.x
   has `SINGLE_SCATTERING` and `MULTIPLE_SCATTERING` (plus `PREETHAM` and
   `HOSEK_WILKIE`). The script picks the best available in that order and
   prints which one it got.

It also found that `dust_density` is gone from the sky node on 5.0.1. Every
Principled socket and every sky attribute is set through a guard that reports
a miss instead of raising, so a third rename will produce a line in
`report.txt` rather than a stack trace.

## Live reload — the viewport follows the file

`live_reload.py` watches `siding_sample.py` and rebuilds the sample in the open
Blender session every time it is saved, so revisions land in the viewport
instead of waiting for a background render.

**Start.** In Blender's Python Console:

```python
import sys
sys.path.append("/Users/nikostathis/Documents/ChatGPT/Windy City Exteriors/assets/blender")
import live_reload
live_reload.start()
```

**Stop.** From that console, or from a new one:

```python
import bpy
bpy.app.driver_namespace["wce_live"].stop()
```

`start()` parks the module in the driver namespace so the stop line works from
anywhere in the session. A watcher you cannot find again is a watcher you have
to quit Blender to be rid of.

Also available from the console once it is running:

| call | what it does |
| --- | --- |
| `live_reload.status()` | running, registered, busy, build count, last message |
| `live_reload.rebuild(force=True)` | rebuild now without waiting for a save |
| `live_reload.BUILD["colour"] = "navy"` | then `rebuild(force=True)` to compare finishes |
| `live_reload.snapshot()` | render the camera to `build/blender-live/` |

The last result is drawn in the corner of the 3D view, green when the build
succeeded and red when it did not, because a timer has no operator context and
`self.report()` is therefore unavailable — without the overlay an error would
land only in a terminal that nobody watching the viewport is looking at.

### What it will not do

- **It will not write into the folder it watches.** The runner writes nothing
  at all by default; `snapshot()` is the only writer and it targets
  `build/blender-live/`, outside `assets/blender/`. The module asserts that at
  import, so a later edit cannot quietly point it back at the watched folder
  and start a rebuild loop.
- **It will not throw you out of camera view.** A rebuild deletes the old
  camera, which drops any viewport looking through it back to user
  perspective. The regions that were in camera view before are put back
  afterwards, and only those. See **Camera view survives a rebuild** below.
- **It will not overlap rebuilds.** A re-entrancy flag refuses a second build
  while one is in flight, and `force=True` does not override it. Two builders
  writing one collection is how a file ends up with two of everything.
- **It will not rebuild while you are in Edit or Sculpt mode.** It says so in
  the overlay and tries again on the next tick.
- **It will not die on a bad edit.** Syntax errors and exceptions are caught,
  printed with a traceback, and shown in the overlay; the timer stays
  registered so the next save can fix it. The callback catches `BaseException`
  and always returns a delay, because a callback that raises is silently
  unregistered by Blender, and a watcher that has quietly stopped watching is
  worse than one that never started.
- **It will not leak.** Each rebuild calls `clear_scene()`, which removes only
  datablocks whose names start with `wce` and then sweeps the zero-user meshes,
  materials, lights, cameras and worlds they were using. `build_world()` and
  `painted()` each make a new datablock per call, so without that sweep a
  hundred reloads would leave a hundred `wce_sky.NNN` worlds behind. Measured:
  after seven rebuilds the object, mesh, material, world, light and camera
  counts are identical to the counts after the first, and an unrelated object
  added to the scene by hand is still there.

A save is not acted on until the file's mtime and size have been unchanged for
0.35 s, so an editor that truncates and rewrites is never read half-written.
The poll between saves is a single `os.stat`, which is free; the rebuild itself
is synchronous, because Blender has one thread for Python and the UI and
pretending otherwise would be a lie. It takes about 0.02 s, so the freeze is
not perceptible.

### Camera view survives a rebuild

A rebuild deletes the old camera object and builds a new one, and Blender
drops any viewport that was looking through the deleted camera back to user
perspective. Found by review on 5.2.2: `start()` built correctly, then the
first watched save threw the viewport out of Camera Perspective into a distant
User Perspective — which defeats most of the point of watching the file.

The runner now records which regions are in camera view **before** anything is
deleted, and puts exactly those back once the build has succeeded:

- `_capture_camera_views()` walks every `VIEW_3D` region and returns the set
  whose `view_perspective` is `CAMERA`.
- `_restore_camera_views()` walks them again and sets `view_perspective` back
  to `CAMERA` for the recorded ones only. Setting it picks up whatever
  `scene.camera` now is, which is the newly built camera, so the viewport lands
  back in the same shot rather than where the old camera used to be.
- Regions that were in user or orthographic perspective are left alone. A
  watcher that yanks every viewport into camera view is a different bug, not a
  fix.
- Restoration happens only after a successful build, and only when
  `scene.camera` exists. On a failed build there is nothing to look through.

Regions are recorded by position — `(window, area, quad)` — rather than by
holding a reference to the `RegionView3D`. A Python reference into Blender's UI
structs is not guaranteed to survive the data churn of a rebuild, and a stale
one either does nothing or crashes. Quad-view spaces are enumerated per region,
since their four views each carry their own perspective.

### How it was checked

`live_reload_checks.py` runs 23 checks against a real `bpy`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python assets/blender/live_reload_checks.py
```

It prints PASS or FAIL per check and exits non-zero if any fail. It covers the
camera-view regression above (capture, restore, leaving unrelated viewports
alone, quad views, a missing window manager), first build, no datablock leak
across repeated rebuilds, an unrelated object surviving, the settle window
holding then releasing, a syntax error and a runtime error each reported
without unregistering, recovery on the next good save, the re-entrancy guard
refusing a forced rebuild, double `start()` and double `stop()` being
idempotent, and a deleted script being reported rather than fatal.

The camera-view checks use stand-in window and area objects rather than real
Blender UI structs, because `--background` has no 3D view at all and the
regression is precisely a UI-state one. That is the honest limit of the test:
it proves the capture and restore logic, not Blender's own redraw. The same
caveat as everything else here applies — this was run on Blender 5.0.1 in a
Linux container, so the viewport overlay is the one part that could not be
exercised and falls back to console-only when `draw_handler_add` is
unavailable.

## Limitations — read before trusting the render

- **This was not run on the Mac.** The session that wrote it runs in a remote
  Linux container. `/Users/nikostathis/...` and
  `/Applications/Blender.app/...` do not exist from here and were verified not
  to.
- **It was run against 5.0.1, not 5.2.2.** Same major version, so the API
  surface should match, but the two minor releases were not compared.
- **The render in this folder, if present, came from that Linux container on
  CPU Cycles**, not from the Mac and not on a GPU. Treat it as a composition
  and geometry check. The Mac run is the reference.
- **Glass in the GLB is not the glass in the render.** glTF has no
  transmission in its core spec, so the pane exports as an opaque material.
  The `.blend` is the authoritative source for anything that has to look like
  glass.
- **Bevels are applied on export** (`export_apply=True`), so the GLB carries
  the eased edges as real geometry and is therefore heavier than the raw
  boxes.
- **No textures, no image maps, no downloads.** Everything is procedural or a
  flat value, so the whole thing runs offline and there is nothing to license.

## If this is worth continuing

The obvious next steps, in order of value:

1. A second sample at a different scale — a soffit, fascia and gutter return —
   since that is the other junction customers look at and the web prototype
   models least convincingly.
2. Baking the Blender render down to the texture maps the Three.js prototype
   samples, rather than modelling the same wall twice in two engines.
3. A shared parameter file, so board exposure and trim dimensions are stated
   once and read by both the Blender script and the web build.
