# Prototype status

Last updated: 21 September 2026. Branch: `codex/interactive-prototype`.

This is an honest account of what the prototype does today, what is real and
what is a stand-in, and what the next person should look at first.

## What it is

A pitch-quality interactive prototype for Windy City Exteriors. The centrepiece
is a two-storey Chicagoland suburban house built as real geometry and rendered
in the browser, with a camera that travels to the elevation each service is
actually performed on. The rest of the site — services, projects, about,
estimate — is built around it.

Nothing on the site is sent anywhere. There is no back end, no analytics, no
form endpoint, and no network request that leaves the page.

## Running it

```
npm install
npm run dev        # http://127.0.0.1:5173
npm run typecheck
npm run test
npm run build      # then: npm run preview
```

To build for a GitHub Pages project site (a sub-path rather than a domain
root), set the base path:

```
SITE_BASE=/Windy-City-Exteriors-/ npm run build
```

## The property

- **Geometry** is generated in `src/property/build/`. `dims.ts` holds every
  dimension in metres — an 8/12 roof pitch, a 10.4 m × 8 m main block, an
  attached garage, a two-storey bay, a portico and a rear deck. `house.ts`
  assembles the elevations, roofs, gutters, windows, doors, deck, driveway and
  planting from those numbers, and `parts.ts` merges everything into one
  geometry per material so the whole property draws in roughly twenty calls.
  The current build is about 15,000 triangles.
- **Materials** (`src/property/materials/`) are generated at runtime as canvas
  textures: lap siding with a normal map, architectural shingles, ledgestone,
  broom-finished concrete, decking and lawn. There are no image textures to
  download.
- **Wear** is a shader hook rather than a second model. Every renovatable
  material carries a `uRenovation` uniform; at 0 the cladding, trim, soffit,
  gutters, deck and railings pick up an aged tone, a grime mask driven by world
  position, and higher roughness. At 1 they are the finished work.

## Interaction

Five modes live in a small external store (`src/property/store.ts`): the
opening sequence, overview, free explore, service focus, and the comparison.
The camera rig (`CameraRig.tsx`) runs eased moves between named compositions
and yields the moment anyone drags — a scripted move is interrupted, not
fought. Orbit limits tighten as the mode gets more specific, and the framing
shifts sideways on desktop and downward on a phone so the building never sits
behind the headline.

The service rail, the numbered hotspots and the keyboard all route through the
same action, so the camera, the panel and the emphasis can never disagree.

## The siding project studio

Choosing a siding job and seeing it are the same screen, because they are the
same thing to the person doing it. The studio carries a profile row (lap,
Dutch lap, shake, board and batten), a finish row, a one-line specification of
what has been chosen, and the two ways out of it: inside the wall, or on to an
estimate.

The profile chips are not swatch circles. Each one is a piece of wall with its
own relief and a raking highlight across it, and the finish chips wear the
profile currently selected, so the choice is shown in the material rather than
described in a label. Changing a profile swaps a cached generated texture
rather than rebuilding anything, so it lands instantly.

Continuing to the estimate carries the specification with it: the form opens
with siding already selected, the project note already written, and a line at
the top saying what was brought over. It is a module variable read once and
cleared — not storage, not a query string — so a reload starts clean and
nothing about the configuration leaves the browser.

## Inside the wall

From the studio, the property gives way to a one-bay section of exterior wall
on a dark stage: framing, insulation, sheathing, weather barrier, and siding
with its trim and window. The layers separate along their own axis, the outer
ones trailing the inner ones slightly so the stack comes apart in the order it
was built rather than sliding apart all at once.

Selecting a layer brings it forward and sinks the others back into the stage.
The panel lists all five in build order with what each one is for; the flags on
the model and the numbers in the panel come from the same list, so they cannot
disagree. The panel takes focus when it opens and returns it when it closes,
Escape steps back one level at a time, and a slider closes the wall back up for
anyone who would rather not drag. It is not `aria-modal`: the model behind it
stays live and orbitable, and claiming otherwise would be a lie to a screen
reader.

The stage is the same scene, the same canvas and the same camera rig as the
house — the daylight rig fades out, the stage rig comes up, and a veil covers
the one frame where the two swap. Nothing is torn down and rebuilt, so going in
and coming back costs nothing.

## The siding comparison

The before and after are the same house, the same camera, the same light and
the same geometry. Each frame is rendered twice with the scissor test: the
existing house to the left of the divider, the replacement to the right, with
one uniform flipped between the two passes. That is why the two halves line up
exactly rather than approximately.

The divider is dragged anywhere on the stage. There is also a visually hidden
native range input bound to the same value, so the comparison is fully
operable by keyboard and by assistive technology without a drag. Five finish
colours repaint only the replacement side.

## Accessibility

Semantic landmarks, a skip link, visible focus, labelled controls, a real
dialog for the mobile menu, keyboard orbit on the canvas, and a non-drag
alternative for the comparison. `prefers-reduced-motion` removes the opening
sequence and the camera easing rather than merely shortening them. If WebGL is
missing or the context is lost, the stage falls back to a drawn elevation with
the same calls to action — it is never blank.

## The estimate walkthrough

Five steps: property type, services, project detail with optional photos,
contact, review. Validation runs against what the visitor has actually typed at
the moment they press Continue. Photos are previewed from local object URLs and
revoked on unmount; they never leave the device. The final screen says plainly:
*Prototype only — your request was not sent.*

## What is real and what is not

Real, from `src/content.ts`: the company name, that it is family owned and
owner operated, the Lake Villa base, the service area, the phone number, the
email, and the service list.

Deliberately absent, because nobody has verified them: years in business, crew
size, job counts, awards, licence and insurance claims, warranties,
certifications, and roofing. Roofing is not advertised anywhere.

The projects page and the home gallery show stills of this interactive model,
captured from the running site by `npm run capture:stills` and labelled as
demonstrations on every tile. They are renders of the archetype house, not
photographs of anybody's job. There are no invented customer projects and no
fabricated testimonial quotes — the reviews section links to the real Google
and Facebook pages instead.

## Deployment

`.github/workflows/deploy.yml` typechecks, tests, builds against the
repository sub-path and publishes to GitHub Pages on every push to
`codex/interactive-prototype`, and on demand. Because Pages has no server-side
rewrite, `public/404.html` encodes the requested path and `index.html` restores
it, so a refresh or a shared link to `/estimate` lands on the right page.

## Known limitations

- The main bundle is small, but the renderer chunk is about 940 kB (250 kB
  gzipped) because it contains Three.js. It is loaded lazily, so the rest of
  the site does not pay for it.
- Shadows are baked once at startup and never updated, which is correct only
  because nothing in the scene moves.
- Quality drops automatically — pixel ratio first, then shadow map size — if
  frame times slip. On software rendering (a CI container, or a machine with no
  GPU) it will still be slow.
- The planting is built from alpha-cut leaf cards scattered on small spheres,
  not from displaced solids. It reads as planting at the framings used and it
  casts a shadow with holes in it, but each card is drawn from one procedural
  leaf atlas, so a shrub at two metres is a mass of leaves rather than a
  species. The treeline a hundred and twenty metres out is the same cards at a
  third the density, and exists to stop the lawn meeting the sky along a ruled
  line rather than to be looked at.
- The window reflection is analytic. It samples the same sky function that
  draws the dome and that the environment map is prefiltered from, so the
  cloud in the glass is the cloud behind the house and the light on the
  siding comes from the sky above it — but it is still a function, not the
  scene. It knows where the sun and the horizon are, and it does not know
  that there is a tree to the left of the house.
- The wall assembly is one bay of a 2x6 wall as built here. It is a correct
  drawing of an ordinary wall, not a specification of any particular job.
- The house is an archetype, not any real customer's property.

## The rendering pass

The verdict on the phase-two build was that it looked like a cartoon. That was
a fair reading and it was not about any one screen: the frame had no ambient
occlusion, no post-processing of any kind, foliage made of solid lobes, a flat
three-light rig and a studio gradient standing in for a sky. Four things
changed.

- **A post chain** (`src/property/post.ts`). The scene renders to a half-float
  target with a depth texture attached. From depth alone it reconstructs view
  positions and normals and computes screen-space ambient occlusion at half
  resolution, then upsamples it with a bilateral filter that will not bleed
  across a depth edge. Bloom is taken from mip four of the colour target.
  The composite applies the occlusion with a cool tint, adds the bloom, tone
  maps with ACES, lifts the shadows toward the sky colour, and finishes with a
  cosine-fourth vignette and luma-scaled grain. Tone mapping is off in the
  renderer, so the occlusion and the bloom both work on linear light.
- **A real sky.** One GLSL function returns the radiance looking in any
  direction: a Rayleigh-shaped gradient with forward scatter on the sun's
  side, a cumulus deck projected onto a plane overhead, a haze band at the
  horizon, the lot below it, and the sun as a disc ninety times brighter than
  the sky around it. The dome behind the house, the environment map the house
  is lit by, and the reflection in every pane are all that same function, so
  they cannot drift apart. The fog was re-matched to it; it was a warm cream
  left over from the studio backdrop, and against a real sky it laid a beige
  wash over the far lawn.
- **Planting rebuilt from cards.** See the note in the limitations above.
- **A light rig that is not three lamps.** VSM shadows with a real penumbra, a
  hemisphere light carrying sky above and warm bounce below, and a key warm
  enough to read as sun rather than as a lamp.
- **A sun that is off the camera axis.** It used to sit almost behind the
  viewer, which lights every visible face of a building equally and is the
  one thing no photograph ever looks like: a house with no shaded side reads
  as a model whatever else is right about it. The sun now comes over the
  front left at about forty degrees, so the entry elevation is lit, the right
  elevation falls into sky-blue shade at roughly a fifth of it, the porch roof
  throws onto the wall behind it and the eaves draw a line across the gable.
  The key was also raised against the sky and the hemisphere fill lowered:
  outdoors the sun beats the sky by something like five to one, and the rig
  was running closer to one to one, which is overcast.

## Where the next visual pass should go

1. The rear elevation. It is correct, but it has had less attention than the
   front and right, which is where every composition currently looks.
2. The gutters still reads as a gable rather than as a gutter run. The camera
   is right for the live view; the captured tile wants its own composition.
3. Variation between the four foreground trees, which currently share one
   canopy recipe, and more than one leaf shape in the atlas.
4. Lawn wear where the grass meets the drive and the walk, and a broken edge
   rather than a ruled one. Both need the ground mesh to carry a "metres from
   the nearest paving" channel; a material cannot work it out from one
   fragment.
5. Grime in the corners, which needs a cavity term the screen-space pass could
   write for the materials to read.
