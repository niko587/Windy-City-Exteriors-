/**
 * The house's material library.
 *
 * Two things matter here beyond looking right:
 *
 * 1. Every material is created once and shared by the merged geometry, so the
 *    whole property draws in roughly a dozen calls.
 * 2. Materials that a siding job would actually change (cladding, trim,
 *    fascia/soffit, gutters, decking) are *renovatable*: their shaders read a
 *    single shared `uRenovation` uniform. Setting it to 0 or 1 between two
 *    scissored render passes gives a before/after comparison on identical
 *    geometry, lighting, camera and framing — nothing moves, only the state of
 *    the finish.
 */

import * as THREE from 'three';
import {
  concreteMaps,
  deckMaps,
  lawnMaps,
  mulchMap,
  shingleMaps,
  sidingMaps,
  stoneMaps,
  wearMap,
  type SidingProfile,
} from './textures';

/** Shared across every patched shader. 0 = before renovation, 1 = after. */
const renovation = { value: 1 };

/**
 * The colour the existing cladding has faded to. Fixed: the house is wearing
 * what it is wearing, whatever finish gets specified for the replacement.
 */
const AGED_SIDING = '#bdb4a2';
const AGED_ACCENT = '#c5bcab';

import { SIDING_COLORS } from '../sidingColours';

interface Renovatable {
  material: THREE.MeshStandardMaterial;
  freshNormal: number;
  agedNormal: number;
}

const renovatables: Renovatable[] = [];

/**
 * Drive the comparison. Called between render passes, so it must stay cheap:
 * one uniform write plus a normal-scale tweak per renovatable material.
 */
export function setRenovation(value: number): void {
  renovation.value = value;
  for (const r of renovatables) {
    const s = r.agedNormal + (r.freshNormal - r.agedNormal) * value;
    r.material.normalScale.set(s, s);
  }
}

export function getRenovation(): number {
  return renovation.value;
}

/**
 * Change the cladding profile on the renovated house. The maps are generated
 * once each and cached, so switching is a pointer swap rather than a rebuild —
 * which is what lets the studio feel instant.
 */
export function setSidingProfile(profile: SidingProfile): void {
  if (!cached) return;
  const maps = sidingMaps(profile);
  for (const m of [cached.siding, cached.sidingAccent]) {
    m.map = retile(maps.map, 1);
    m.normalMap = retile(maps.normalMap, 1);
    m.needsUpdate = true;
  }
  currentProfile = profile;
}

export function getSidingProfile(): SidingProfile {
  return currentProfile;
}

let currentProfile: SidingProfile = 'lap';

/** Repaint the *renovated* cladding. The weathered state is unaffected. */
export function setSidingColour(id: string): void {
  const choice = SIDING_COLORS.find((c) => c.id === id) ?? SIDING_COLORS[0];
  if (!cached) return;
  cached.siding.color.set(choice.hex);
  cached.sidingAccent.color.set(choice.accent);
}

interface RenovOptions {
  /** Colour the finish drifts toward when weathered. */
  aged: string;
  /** How far toward `aged` the before state goes, 0–1. */
  agedMix?: number;
  /** Strength of the grime/streak darkening, 0–1. */
  grime?: number;
  /** Roughness added by weathering. */
  roughAdd?: number;
  /** Metres covered by one wear tile. */
  wearScale?: number;
  /** Normal-map strength when fresh / when weathered. */
  normal?: [fresh: number, aged: number];
}

const VERT_HOOK = `#include <begin_vertex>
  vWcePos = (modelMatrix * vec4(transformed, 1.0)).xyz;`;

const FRAG_COLOR_HOOK = `#include <map_fragment>
  float wceWear = 1.0 - uRenovation;
  vec2 wceUv = vec2(vWcePos.x + vWcePos.z, vWcePos.y) * uWearScale;
  float wceGrime = texture2D(uWear, wceUv).r;
  // Weathering pools low on the wall and just under the eaves.
  wceGrime *= 0.72 + 0.55 * smoothstep(5.6, 0.4, vWcePos.y);
  wceGrime = clamp(wceGrime, 0.0, 1.0);
  vec3 wceAged = mix(diffuseColor.rgb, uAged, uAgedMix);
  // Chalking. A finish at the end of its life does not fade evenly — it
  // gives up its pigment fastest where the sun has had longest at it, so the
  // tired wall is a mottle of the faded colour rather than one flat coat of
  // it. Without this the before state reads as a clean tan house.
  float wceFade = texture2D(uWear, wceUv * 0.27).r;
  float wceChalk = dot(wceAged, vec3(0.32, 0.52, 0.16));
  wceAged = mix(wceAged, vec3(wceChalk) * 1.05, wceFade * 0.38);
  wceAged *= 1.0 - uGrime * wceGrime;
  diffuseColor.rgb = mix(diffuseColor.rgb, wceAged, wceWear);
  // Everything sits in its own contact shadow where it meets grade; without
  // this the walls look posed on the lawn rather than built into it.
  diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 0.85, vWcePos.y));`;

const FRAG_ROUGH_HOOK = `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + wceWear * (uRoughAdd + 0.14 * wceGrime), 0.035, 1.0);`;

/**
 * Large-scale tonal variation in world space.
 *
 * A 2.2 m lawn tile repeated across a 150 m plane reads as wallpaper from the
 * overview camera. Multiplying the albedo by a slow world-space noise costs
 * two texture-free lookups and removes the grid entirely — the same trick
 * rescues the driveway, the mulch and the roof.
 */
const VARIED_NOISE = `
float wceHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float wceNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = wceHash(i);
  float b = wceHash(i + vec2(1.0, 0.0));
  float c = wceHash(i + vec2(0.0, 1.0));
  float d = wceHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

interface VariedOptions {
  /** Metres per cycle of the broad variation. */
  scale: number;
  /** Peak-to-peak brightness swing, 0–1. */
  amount: number;
  /** Extra roughness in the darker patches. */
  roughAdd?: number;
  /**
   * Fold height into the lookup. A plan-view lookup is right for ground, but
   * on a foundation wall or a stone pier it gives horizontal banding and
   * nothing up the wall, which is worse than no variation at all.
   */
  upright?: boolean;
}

function varied(material: THREE.MeshStandardMaterial, o: VariedOptions): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uVarScale = { value: 1 / o.scale };
    shader.uniforms.uVarAmount = { value: o.amount };
    shader.uniforms.uVarRough = { value: o.roughAdd ?? 0 };
    shader.uniforms.uVarUp = { value: o.upright ? 1 : 0 };

    shader.vertexShader = `varying vec3 vWcePos;
${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  vWcePos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
    shader.fragmentShader = `varying vec3 vWcePos;
uniform float uVarScale;
uniform float uVarAmount;
uniform float uVarRough;
uniform float uVarUp;
${VARIED_NOISE}
${shader.fragmentShader}`
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  vec2 wceVp = vWcePos.xz * uVarScale;
  // Three octaves rather than two. The lawn is now a 340 m plane that runs
  // out past the fog, and two octaves of a 16 m cycle leave the mid-ground
  // — too far for the tile to read, too near for the haze to take it — as
  // one flat sheet of colour.
  float wceVar = wceNoise(wceVp * 0.29) * 0.34 + wceNoise(wceVp) * 0.42 + wceNoise(wceVp * 3.3) * 0.24;
  float wceVarUp = wceNoise(vec2(vWcePos.x - vWcePos.z, vWcePos.y * 1.7) * uVarScale);
  wceVar = mix(wceVar, wceVar * 0.55 + wceVarUp * 0.45, uVarUp);
  diffuseColor.rgb *= 1.0 + (wceVar - 0.5) * uVarAmount;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + (0.5 - wceVar) * uVarRough, 0.04, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => 'wce-varied';
  return material;
}

/**
 * The scene's key light, so a reflected sun lands where the real one is. Kept
 * in step with `SUN` in `PropertyScene` by hand: it is one vector, and the
 * alternative is exporting light rig internals into the material library.
 */
const SUN_DIR = new THREE.Vector3(15.5, 19, 14.5).normalize();

/**
 * What glazing actually does.
 *
 * A window is neither a mirror nor the brown rectangle this model had. Nearly
 * all of it is the dim room behind the glass; riding on top is a reflection
 * whose strength climbs steeply with the angle you catch it at, and whose
 * content is sky above the horizon and lawn, drive and neighbours below it.
 * The sky is several stops brighter than anything the house is made of, which
 * is why a seven per cent reflection still reads bright — so the sky is
 * sampled at a gain and the tone mapper rolls the top off.
 *
 * Doing this analytically instead of leaning on the environment map buys the
 * one thing a small PMREM cannot: a horizon that stays a line. That line
 * crossing a pane at a slightly different height on every storey is most of
 * what makes a facade of windows look glazed rather than boarded.
 */
const GLASS_SKY = `
vec3 wceGlassSky(vec3 r) {
  float h = r.y;
  vec3 c;
  if (h > 0.0) {
    c = mix(uSkyHorizon, uSkyHigh, pow(clamp(h * 2.2, 0.0, 1.0), 0.6));
    // Cloud, projected onto a plane overhead so the banding compresses toward
    // the horizon; a pane tipped up the elevation then finds new structure
    // rather than more of the same gradient.
    vec2 p = r.xz / max(h, 0.32);
    float cl = wceNoise(p * 0.5) * 0.62 + wceNoise(p * 1.7) * 0.38;
    c = mix(c, uSkyCloud, smoothstep(0.44, 0.86, cl) * smoothstep(0.0, 0.22, h) * 0.8);
  } else {
    // The haze gives out fast below the line. Let it linger and every pane
    // caught from above fills with warm cream, which is exactly how this
    // model's glazing came to look like painted board.
    c = mix(uSkyHorizon, uSkyGround, pow(clamp(-h * 5.0, 0.0, 1.0), 0.6));
    // What is actually across the street: trees, roofs, a drive. Too far to
    // resolve, and that is the point — the lower half of a window is broken
    // tone, never a clean ramp.
    // The divisor is held well off zero on purpose: a true 1/h projection
    // explodes at the horizon, and since a pane's reflected ray barely moves
    // across its own width, that turned into mould blotches on the glass.
    vec2 q = r.xz / max(-h, 0.32);
    float lot = wceNoise(q * 0.65) * 0.6 + wceNoise(q * 2.1) * 0.4;
    c *= 0.82 + 0.46 * lot;
  }
  // The haze line. Two gradients meeting at a hard edge look drawn, and a
  // narrow one leaves the ground-floor windows — which reflect a shallow
  // angle below the horizon, never the sky — as black holes in the wall.
  c += uSkyHorizon * 0.4 * exp(-abs(h) * 10.0);
  float sn = max(dot(r, uSunDir), 0.0);
  c += vec3(1.0, 0.95, 0.84) * (pow(sn, 560.0) * 20.0 + pow(sn, 9.0) * 0.26);
  return c;
}`;

interface GlazingOptions {
  /** How far above surface values the reflected sky is sampled. */
  gain: number;
}

function glazed(material: THREE.MeshPhysicalMaterial, o: GlazingOptions): THREE.MeshPhysicalMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: SUN_DIR };
    shader.uniforms.uSkyHigh = { value: new THREE.Color('#9db6db').convertSRGBToLinear() };
    shader.uniforms.uSkyHorizon = { value: new THREE.Color('#e9eaea').convertSRGBToLinear() };
    shader.uniforms.uSkyCloud = { value: new THREE.Color('#fbfaf7').convertSRGBToLinear() };
    // What a window actually reflects when you are looking down at it: lawn,
    // drive and haze at twenty metres in open daylight, not dark slate.
    shader.uniforms.uSkyGround = { value: new THREE.Color('#8e9086').convertSRGBToLinear() };
    // The room behind the pane. Dim, cool and never zero: a window that goes
    // to black on the shadow elevation reads as a hole cut in the wall.
    shader.uniforms.uGlassRoom = { value: new THREE.Color('#3f4b5a').convertSRGBToLinear() };
    shader.uniforms.uGlassGain = { value: o.gain };

    shader.vertexShader = `varying vec3 vWcePos;
varying vec3 vWceNrm;
${shader.vertexShader}`
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
  // Panes are flat boxes on an unscaled merged mesh, so the upper 3×3 is
  // enough to carry the normal into world space.
  vWceNrm = mat3(modelMatrix) * objectNormal;`,
      )
      .replace('#include <begin_vertex>', VERT_HOOK);

    shader.fragmentShader = `varying vec3 vWcePos;
varying vec3 vWceNrm;
uniform vec3 uSunDir;
uniform vec3 uSkyHigh;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyCloud;
uniform vec3 uSkyGround;
uniform vec3 uGlassRoom;
uniform float uGlassGain;
${VARIED_NOISE}
${GLASS_SKY}
${shader.fragmentShader}`
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  // No two rooms behind an elevation are the same darkness — blinds, depth,
  // what the light is doing inside. A slow world-space drift gives every
  // opening its own interior instead of stamping one grey across the house.
  float wceRoom = wceNoise(vec2(vWcePos.x * 0.3 + vWcePos.z * 0.3, vWcePos.y * 0.26));
  diffuseColor.rgb *= 0.72 + 0.62 * wceRoom;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  vec3 wceV = normalize(cameraPosition - vWcePos);
  vec3 wceN = normalize(vWceNrm);
  wceN *= dot(wceN, wceV) < 0.0 ? -1.0 : 1.0;
  float wceCos = clamp(dot(wceN, wceV), 0.0, 1.0);
  // An insulated unit has two glass surfaces facing out, so the sheet returns
  // roughly twice a single pane's four per cent before the angle takes over.
  float wceFres = 0.075 + 0.925 * pow(1.0 - wceCos, 5.0);
  totalEmissiveRadiance += wceGlassSky(reflect(-wceV, wceN)) * (wceFres * uGlassGain);
  // Whatever the reflection is not carrying, the interior is: the same slow
  // drift that varies the base colour varies how lit each room is.
  totalEmissiveRadiance += uGlassRoom * ((1.0 - wceFres) * (0.68 + 0.64 * wceRoom));`,
      );
  };
  material.customProgramCacheKey = () => 'wce-glazed';
  return material;
}

interface FoliageOptions {
  /** Tint on the sun-bleached leaves and on the ones deep in the canopy. */
  bright: [number, number, number];
  deep: [number, number, number];
  /** Metres per cycle of the broad colour break-up. */
  scale: number;
}

/**
 * Planting, without touching a vertex.
 *
 * The shrubs are faceted spheres, and a faceted sphere in one flat green is a
 * paper prop. Two things fix it from inside the material: the canopy is not
 * one colour, and a leaf facing the sky is bleached while one turned under is
 * sitting in the shrub's own shade. The second is the important one — it is
 * what turns a silhouette into a mass — and it costs a dot product.
 */
function foliaged(material: THREE.MeshStandardMaterial, o: FoliageOptions): THREE.MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLeafBright = { value: new THREE.Vector3(...o.bright) };
    shader.uniforms.uLeafDeep = { value: new THREE.Vector3(...o.deep) };
    shader.uniforms.uLeafScale = { value: 1 / o.scale };

    shader.vertexShader = `varying vec3 vWcePos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      VERT_HOOK,
    );
    shader.fragmentShader = `varying vec3 vWcePos;
uniform vec3 uLeafBright;
uniform vec3 uLeafDeep;
uniform float uLeafScale;
${VARIED_NOISE}
${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  vec3 wceLp = vWcePos * uLeafScale;
  float wceLeaf = wceNoise(wceLp.xz + wceLp.y * 1.7) * 0.62
                + wceNoise(wceLp.xz * 2.9 - wceLp.y * 3.1) * 0.38;
  vec3 wceTint = mix(uLeafDeep, uLeafBright, clamp(wceLeaf * 1.3 - 0.15, 0.0, 1.0));
  // World up carried into view space, which is cheaper than inverting the
  // view matrix and works with the flat-shaded normal the facet already has.
  float wceLift = dot(normalize(normal), normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)));
  wceTint *= 0.72 + 0.42 * smoothstep(-0.7, 0.9, wceLift);
  diffuseColor.rgb *= wceTint;
  roughnessFactor = clamp(roughnessFactor + (0.5 - wceLeaf) * 0.18, 0.4, 1.0);`,
    );
  };
  material.customProgramCacheKey = () => 'wce-foliage';
  return material;
}

function renovatable(material: THREE.MeshStandardMaterial, o: RenovOptions): THREE.MeshStandardMaterial {
  const [fresh, aged] = o.normal ?? [1, 1];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRenovation = renovation;
    shader.uniforms.uWear = { value: wearMap() };
    shader.uniforms.uAged = { value: new THREE.Color(o.aged).convertSRGBToLinear() };
    shader.uniforms.uAgedMix = { value: o.agedMix ?? 0.8 };
    shader.uniforms.uGrime = { value: o.grime ?? 0.3 };
    shader.uniforms.uRoughAdd = { value: o.roughAdd ?? 0.2 };
    shader.uniforms.uWearScale = { value: 1 / (o.wearScale ?? 3.2) };

    shader.vertexShader = `varying vec3 vWcePos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      VERT_HOOK,
    );
    shader.fragmentShader = `varying vec3 vWcePos;
uniform float uRenovation;
uniform sampler2D uWear;
uniform vec3 uAged;
uniform float uAgedMix;
uniform float uGrime;
uniform float uRoughAdd;
uniform float uWearScale;
${shader.fragmentShader}`
      .replace('#include <map_fragment>', FRAG_COLOR_HOOK)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH_HOOK);
  };
  material.customProgramCacheKey = () => 'wce-renovatable';
  material.normalScale.set(fresh, fresh);
  renovatables.push({ material, freshNormal: fresh, agedNormal: aged });
  return material;
}

export interface HouseMaterials {
  siding: THREE.MeshStandardMaterial;
  sidingAccent: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  soffit: THREE.MeshStandardMaterial;
  gutter: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  foundation: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  sash: THREE.MeshStandardMaterial;
  entryDoor: THREE.MeshStandardMaterial;
  garageDoor: THREE.MeshStandardMaterial;
  shutter: THREE.MeshStandardMaterial;
  hardware: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  railing: THREE.MeshStandardMaterial;
  flatwork: THREE.MeshStandardMaterial;
  lawn: THREE.MeshStandardMaterial;
  mulch: THREE.MeshStandardMaterial;
  shrub: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  all: THREE.Material[];
}

/** Clone a shared texture at a metre-based repeat. Wall UVs are in metres. */
const retiled = new Map<string, THREE.Texture>();

function retile(t: THREE.Texture, metres: number): THREE.Texture {
  const key = `${t.name}@${metres}`;
  const hit = retiled.get(key);
  if (hit) return hit;
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(1 / metres, 1 / metres);
  retiled.set(key, c);
  return c;
}

let cached: HouseMaterials | null = null;

export function createMaterials(env: THREE.Texture | null): HouseMaterials {
  if (cached) return cached;

  // Built up front rather than on first compile. It is a pixel loop, and
  // `renovatable` asks for it from inside `onBeforeCompile`, which runs
  // during the first frame — where sixty milliseconds is a visible hitch.
  wearMap();

  const siding = sidingMaps();
  const shingle = shingleMaps();
  const found = concreteMaps('foundation');
  const stone = stoneMaps();
  const flat = concreteMaps('flatwork');
  const lawnTex = lawnMaps();
  const deckTex = deckMaps();

  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    if (env) {
      m.envMap = env;
      m.envMapIntensity = p.envMapIntensity ?? 0.75;
    }
    return m;
  };

  // Repeat 1 = one metre, because wall UVs are metres.
  const tile = retile;

  const m: HouseMaterials = {
    // AFTER: a confident deep slate. BEFORE: the faded almond this house
    // would actually have been wearing.
    siding: renovatable(
      std({
        color: SIDING_COLORS[0].hex,
        map: siding.map,
        normalMap: siding.normalMap,
        roughness: 0.66,
        metalness: 0,
        envMapIntensity: 0.62,
      }),
      { aged: AGED_SIDING, agedMix: 1, grime: 0.44, roughAdd: 0.3, wearScale: 3.4, normal: [1, 1.7] },
    ),

    // Gable ends and the garage front get a slightly lighter board for relief.
    sidingAccent: renovatable(
      std({
        color: SIDING_COLORS[0].accent,
        map: siding.map,
        normalMap: siding.normalMap,
        roughness: 0.68,
        metalness: 0,
        envMapIntensity: 0.62,
      }),
      { aged: AGED_ACCENT, agedMix: 1, grime: 0.4, roughAdd: 0.3, wearScale: 3.4, normal: [1, 1.7] },
    ),

    trim: renovatable(
      std({ color: '#f0ece4', roughness: 0.52, metalness: 0, envMapIntensity: 0.6 }),
      { aged: '#c8bda6', agedMix: 0.8, grime: 0.34, roughAdd: 0.28, wearScale: 2.4 },
    ),

    soffit: renovatable(
      std({ color: '#e7e2d8', roughness: 0.66, metalness: 0, envMapIntensity: 0.4 }),
      { aged: '#c3b69c', agedMix: 0.7, grime: 0.3, roughAdd: 0.18, wearScale: 2.6 },
    ),

    gutter: renovatable(
      std({ color: '#eeeae2', roughness: 0.38, metalness: 0.15, envMapIntensity: 0.9 }),
      { aged: '#c0b6a4', agedMix: 0.74, grime: 0.5, roughAdd: 0.3, wearScale: 1.9 },
    ),

    deck: renovatable(
      std({
        color: '#a08d78',
        map: tile(deckTex.map, 1.05),
        normalMap: tile(deckTex.normalMap, 1.05),
        roughness: 0.76,
        metalness: 0,
        envMapIntensity: 0.5,
      }),
      // The board relief is carried harder than anywhere else on the house:
      // a deck seen down its length is nothing but edges, and a flat one
      // collapses into a single plane at the rear camera's distance.
      { aged: '#9a978e', agedMix: 0.82, grime: 0.24, roughAdd: 0.14, wearScale: 2.8, normal: [1.5, 1.9] },
    ),

    railing: renovatable(
      std({ color: '#efebe3', roughness: 0.5, metalness: 0, envMapIntensity: 0.6 }),
      { aged: '#c9bda6', agedMix: 0.7, grime: 0.3, roughAdd: 0.22, wearScale: 2.2 },
    ),

    // Not part of a siding job — deliberately identical in both states, which
    // keeps attention on what actually changed.
    // Not part of a siding job, so it stays identical in both states — but a
    // roof that tiles visibly undoes the rest of the model, hence the broad
    // weathering drift across the planes.
    roof: varied(
      std({
        color: '#6b6c71',
        map: tile(shingle.map, 1.0),
        normalMap: tile(shingle.normalMap, 1.0),
        roughness: 0.9,
        metalness: 0,
        envMapIntensity: 0.44,
      }),
      { scale: 6.5, amount: 0.13, roughAdd: 0.05 },
    ),

    // A poured wall is never one tone along its length — the lifts cure at
    // different rates and the grade splashes it — so the tile gets the same
    // broad drift the ground does, folded up the wall rather than across it.
    foundation: varied(
      std({
        color: '#8b8983',
        map: tile(found.map, 1.6),
        normalMap: tile(found.normalMap, 1.6),
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.28,
      }),
      { scale: 4.2, amount: 0.16, roughAdd: 0.04, upright: true },
    ),

    // Ledgestone water table and porch base, straight off the reference. The
    // blend is in the tile; this adds the pier-to-pier drift that stops two
    // columns of the same wall looking stamped from one another.
    stone: varied(
      std({
        color: '#9a978f',
        map: tile(stone.map, 1.45),
        normalMap: tile(stone.normalMap, 1.45),
        roughness: 0.92,
        metalness: 0,
        envMapIntensity: 0.34,
      }),
      { scale: 3.0, amount: 0.13, roughAdd: 0.04, upright: true },
    ),

    glass: (() => {
      // Deep and cool, because the base colour is the unlit room: everything
      // that makes this read as glass is added on top by `glazed`. A second
      // environment reflection on top of the analytic one only brought the
      // warm horizon wash back, so the env map is kept to a whisper and the
      // clearcoat — which was doing the same thing again — is gone.
      const g = glazed(
        new THREE.MeshPhysicalMaterial({
          color: '#16202b',
          roughness: 0.16,
          metalness: 0,
          // No standard specular lobe at all. The light rig carries three
          // fill lights that stand in for bounce, and a mirror-smooth pane
          // reflects those fakes as hard white sheets — which is what was
          // blowing the gable window out while its neighbours went muddy.
          // `glazed` puts back a reflection that knows where the sky is.
          specularIntensity: 0,
          ior: 1.52,
        }),
        { gain: 3.4 },
      );
      if (env) {
        g.envMap = env;
        g.envMapIntensity = 0.3;
      }
      return g;
    })(),

    // Crisp and bright against the darkened glazing: the sash and muntin
    // grid is the drawing on the elevation, so it stays the cleanest white
    // on the house.
    sash: std({ color: '#f7f4ee', roughness: 0.4, metalness: 0, envMapIntensity: 0.62 }),

    // The reference keeps red entirely in the interface and none of it on the
    // building, so the entry and the garage are the deep navy of the mark.
    entryDoor: std({ color: '#16233a', roughness: 0.36, metalness: 0, envMapIntensity: 0.85 }),

    garageDoor: std({ color: '#1b2a41', roughness: 0.44, metalness: 0.08, envMapIntensity: 0.78 }),

    shutter: std({ color: '#141f33', roughness: 0.55, metalness: 0, envMapIntensity: 0.5 }),

    hardware: std({ color: '#2c2f33', roughness: 0.34, metalness: 0.85, envMapIntensity: 1.25 }),

    flatwork: varied(
      std({
        color: '#b7b2a8',
        map: tile(flat.map, 2.4),
        normalMap: tile(flat.normalMap, 2.4),
        roughness: 0.95,
        metalness: 0,
        envMapIntensity: 0.28,
      }),
      { scale: 6.5, amount: 0.14, roughAdd: 0.06 },
    ),

    lawn: varied(
      std({
        color: '#9fb07c',
        map: tile(lawnTex.map, 2.2),
        normalMap: tile(lawnTex.normalMap, 2.2),
        roughness: 1,
        metalness: 0,
        envMapIntensity: 0.28,
      }),
      { scale: 19, amount: 0.22 },
    ),

    mulch: varied(
      std({
        color: '#7a5a44',
        map: tile(mulchMap(), 0.9),
        roughness: 1,
        metalness: 0,
        envMapIntensity: 0.22,
      }),
      { scale: 3.4, amount: 0.26 },
    ),

    shrub: foliaged(
      std({ color: '#4c6a41', roughness: 0.88, metalness: 0, flatShading: true, envMapIntensity: 0.4 }),
      { bright: [1.22, 1.18, 0.78], deep: [0.56, 0.7, 0.54], scale: 0.4 },
    ),

    // Trees carry the variation over a longer run than a clipped shrub, and
    // a little further toward yellow, which is what separates the two masses
    // where a shrub sits in front of a trunk.
    foliage: foliaged(
      std({ color: '#5a7845', roughness: 0.9, metalness: 0, flatShading: true, envMapIntensity: 0.4 }),
      { bright: [1.22, 1.17, 0.78], deep: [0.58, 0.72, 0.56], scale: 0.95 },
    ),

    bark: std({ color: '#5a4d41', roughness: 0.96, metalness: 0, envMapIntensity: 0.22 }),

    all: [],
  };

  m.all = Object.values(m).filter((v): v is THREE.Material => v instanceof THREE.Material);
  cached = m;
  return m;
}

export function disposeMaterials(): void {
  if (!cached) return;
  for (const mat of cached.all) mat.dispose();
  for (const t of retiled.values()) t.dispose();
  retiled.clear();
  renovatables.length = 0;
  currentProfile = 'lap';
  cached = null;
}
