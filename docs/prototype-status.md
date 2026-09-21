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

The projects page shows views of this interactive model, labelled as
demonstrations. There are no invented customer projects and no fabricated
testimonial quotes — the reviews section links to the real Google and Facebook
pages instead.

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
- The planting, fence and site furniture are stylised low-polygon forms. They
  read as landscape at the framings used, but they are not the level of the
  building itself.
- The house is an archetype, not any real customer's property.

## Where the next visual pass should go

1. The foliage: better canopy silhouettes, and variation between the four trees.
2. The rear elevation — it is correct, but it has had less attention than the
   front and right, which is where every composition currently looks.
3. Glass: the windows are flat and slightly dull; a touch of reflected sky
   would lift the whole model.
4. The lawn reads as a single tone at distance and could use large-scale
   colour variation.
