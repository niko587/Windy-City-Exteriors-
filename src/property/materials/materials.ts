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
import { concreteMaps, deckMaps, lawnMaps, mulchMap, shingleMaps, sidingMaps, stoneMaps, wearMap } from './textures';

/** Shared across every patched shader. 0 = before renovation, 1 = after. */
const renovation = { value: 1 };

/**
 * The colour the existing cladding has faded to. Fixed: the house is wearing
 * what it is wearing, whatever finish gets specified for the replacement.
 */
const AGED_SIDING = '#c6b9a4';
const AGED_ACCENT = '#cdc1ad';

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
  wceAged *= 1.0 - uGrime * wceGrime;
  diffuseColor.rgb = mix(diffuseColor.rgb, wceAged, wceWear);`;

const FRAG_ROUGH_HOOK = `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + wceWear * (uRoughAdd + 0.14 * wceGrime), 0.035, 1.0);`;

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

let cached: HouseMaterials | null = null;

export function createMaterials(env: THREE.Texture | null): HouseMaterials {
  if (cached) return cached;

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
  const tile = (t: THREE.Texture, metres: number) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(1 / metres, 1 / metres);
    return c;
  };

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
      { aged: AGED_SIDING, agedMix: 1, grime: 0.32, roughAdd: 0.2, wearScale: 3.4, normal: [1, 1.5] },
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
      { aged: AGED_ACCENT, agedMix: 1, grime: 0.28, roughAdd: 0.2, wearScale: 3.4, normal: [1, 1.5] },
    ),

    trim: renovatable(
      std({ color: '#f0ece4', roughness: 0.52, metalness: 0, envMapIntensity: 0.6 }),
      { aged: '#cdc0a4', agedMix: 0.72, grime: 0.24, roughAdd: 0.22, wearScale: 2.4 },
    ),

    soffit: renovatable(
      std({ color: '#e7e2d8', roughness: 0.66, metalness: 0, envMapIntensity: 0.4 }),
      { aged: '#c3b69c', agedMix: 0.7, grime: 0.3, roughAdd: 0.18, wearScale: 2.6 },
    ),

    gutter: renovatable(
      std({ color: '#eeeae2', roughness: 0.38, metalness: 0.15, envMapIntensity: 0.9 }),
      { aged: '#c6bba6', agedMix: 0.66, grime: 0.42, roughAdd: 0.26, wearScale: 1.9 },
    ),

    deck: renovatable(
      std({
        color: '#a08d78',
        map: tile(deckTex.map, 1.05),
        normalMap: tile(deckTex.normalMap, 1.05),
        roughness: 0.74,
        metalness: 0,
        envMapIntensity: 0.5,
      }),
      { aged: '#9a978e', agedMix: 0.82, grime: 0.24, roughAdd: 0.14, wearScale: 2.8, normal: [1, 1.4] },
    ),

    railing: renovatable(
      std({ color: '#efebe3', roughness: 0.5, metalness: 0, envMapIntensity: 0.6 }),
      { aged: '#c9bda6', agedMix: 0.7, grime: 0.3, roughAdd: 0.22, wearScale: 2.2 },
    ),

    // Not part of a siding job — deliberately identical in both states, which
    // keeps attention on what actually changed.
    roof: std({
      color: '#6b6c71',
      map: tile(shingle.map, 1.0),
      normalMap: tile(shingle.normalMap, 1.0),
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.44,
    }),

    foundation: std({
      color: '#8d8b86',
      map: tile(found.map, 1.6),
      normalMap: tile(found.normalMap, 1.6),
      roughness: 0.94,
      metalness: 0,
      envMapIntensity: 0.3,
    }),

    // Ledgestone water table and porch base, straight off the reference.
    stone: std({
      color: '#9d9a94',
      map: tile(stone.map, 1.45),
      normalMap: tile(stone.normalMap, 1.45),
      roughness: 0.93,
      metalness: 0,
      envMapIntensity: 0.32,
    }),

    glass: (() => {
      const g = new THREE.MeshPhysicalMaterial({
        color: '#1d2b3e',
        roughness: 0.045,
        metalness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        reflectivity: 0.6,
      });
      if (env) {
        g.envMap = env;
        g.envMapIntensity = 2.0;
      }
      return g;
    })(),

    sash: std({ color: '#f4f1ea', roughness: 0.42, metalness: 0, envMapIntensity: 0.6 }),

    // The reference keeps red entirely in the interface and none of it on the
    // building, so the entry and the garage are the deep navy of the mark.
    entryDoor: std({ color: '#16233a', roughness: 0.36, metalness: 0, envMapIntensity: 0.85 }),

    garageDoor: std({ color: '#1b2a41', roughness: 0.44, metalness: 0.08, envMapIntensity: 0.78 }),

    shutter: std({ color: '#141f33', roughness: 0.55, metalness: 0, envMapIntensity: 0.5 }),

    hardware: std({ color: '#2c2f33', roughness: 0.34, metalness: 0.85, envMapIntensity: 1.25 }),

    flatwork: std({
      color: '#b7b2a8',
      map: tile(flat.map, 2.4),
      normalMap: tile(flat.normalMap, 2.4),
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.28,
    }),

    lawn: std({
      color: '#8ea16a',
      map: tile(lawnTex.map, 2.2),
      normalMap: tile(lawnTex.normalMap, 2.2),
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.28,
    }),

    mulch: std({
      color: '#7a5a44',
      map: tile(mulchMap(), 0.9),
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.22,
    }),

    shrub: std({ color: '#4e6b42', roughness: 0.9, metalness: 0, flatShading: true, envMapIntensity: 0.35 }),

    foliage: std({ color: '#5a7845', roughness: 0.92, metalness: 0, flatShading: true, envMapIntensity: 0.35 }),

    bark: std({ color: '#5c4f43', roughness: 0.96, metalness: 0, envMapIntensity: 0.22 }),

    all: [],
  };

  m.all = Object.values(m).filter((v): v is THREE.Material => v instanceof THREE.Material);
  cached = m;
  return m;
}

export function disposeMaterials(): void {
  if (!cached) return;
  for (const mat of cached.all) mat.dispose();
  renovatables.length = 0;
  cached = null;
}
