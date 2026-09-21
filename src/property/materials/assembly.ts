/**
 * Materials for the wall assembly stage.
 *
 * Kept apart from the house library on purpose: these only exist while the
 * viewer is looking inside the wall, they are lit by a different rig, and none
 * of them is renovatable — an assembly drawing has no before and after.
 *
 * The outer layer still wears the finish chosen in the studio, so the siding
 * the viewer peels back is the siding they just picked. It is a separate
 * material from the house's rather than the same one, because the stage needs
 * to fade layers back when one is being inspected, and nothing here may reach
 * into the house's shared materials to do it.
 */

import * as THREE from 'three';
import type { LayerKey } from '../wallLayers';
import { SIDING_COLORS } from '../sidingColours';
import { deckMaps, mulchMap, sidingMaps, type SidingProfile } from './textures';

export interface AssemblyMaterials {
  lumber: THREE.MeshStandardMaterial;
  osb: THREE.MeshStandardMaterial;
  insulation: THREE.MeshStandardMaterial;
  wrap: THREE.MeshStandardMaterial;
  siding: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  sash: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  stage: THREE.MeshStandardMaterial;
  all: THREE.Material[];
}

let cached: AssemblyMaterials | null = null;

/** Clone a generated map at a metre-based repeat; assembly UVs are in metres. */
const retiled = new Map<string, THREE.Texture>();

function tile(t: THREE.Texture, metres: number): THREE.Texture {
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

export function createAssemblyMaterials(env: THREE.Texture | null): AssemblyMaterials {
  if (cached) return cached;

  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(p);
    if (env) {
      m.envMap = env;
      m.envMapIntensity = p.envMapIntensity ?? 0.6;
    }
    return m;
  };

  const deck = deckMaps();
  const clad = sidingMaps('lap');

  const glass = new THREE.MeshPhysicalMaterial({
    color: '#22303f',
    roughness: 0.085,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    reflectivity: 0.38,
    ior: 1.52,
    transparent: true,
    opacity: 0.86,
  });
  if (env) {
    glass.envMap = env;
    glass.envMapIntensity = 1.1;
  }

  const m: AssemblyMaterials = {
    // Kiln-dried spruce: pale, slightly yellow, and rough enough that the
    // light rakes across the stud faces instead of sliding off them.
    lumber: std({
      color: '#d8b783',
      normalMap: tile(deck.normalMap, 0.42),
      roughness: 0.86,
      metalness: 0,
      envMapIntensity: 0.32,
    }),

    // The strand pattern of a sheathing panel is close enough to a mulch tile
    // at this scale that generating a second one would be waste.
    osb: std({
      color: '#c9a068',
      map: tile(mulchMap(), 0.24),
      roughness: 0.92,
      metalness: 0,
      envMapIntensity: 0.26,
    }),

    insulation: std({
      color: '#e6c3c8',
      roughness: 1,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 0.18,
    }),

    // House wrap is a plastic sheet: brighter than everything around it, with
    // a faint sheen that catches the key light along the fold of the layer.
    wrap: std({
      color: '#eef1f4',
      roughness: 0.58,
      metalness: 0.02,
      envMapIntensity: 0.55,
      side: THREE.DoubleSide,
    }),

    siding: std({
      color: SIDING_COLORS[0].hex,
      map: tile(clad.map, 1),
      normalMap: tile(clad.normalMap, 1),
      roughness: 0.66,
      metalness: 0,
      envMapIntensity: 0.6,
    }),

    trim: std({ color: '#f2eee5', roughness: 0.58, metalness: 0, envMapIntensity: 0.5 }),

    sash: std({ color: '#f4f1ea', roughness: 0.5, metalness: 0, envMapIntensity: 0.55 }),

    glass,

    // The stage itself — a dark floor with just enough reflection to sit the
    // assembly on something, as in the approved direction's second study.
    stage: std({
      color: '#0a1b30',
      roughness: 0.42,
      metalness: 0.14,
      envMapIntensity: 0.35,
    }),

    all: [],
  };

  m.all = Object.values(m).filter((v): v is THREE.Material => v instanceof THREE.Material);
  cached = m;
  rememberBases(m);
  return m;
}

/* -------------------------------------------------------------------------
   Emphasis: one layer forward, the rest sunk back into the stage.

   Fading is done on the materials rather than with opacity, because a wall
   section read through transparency stops reading as a solid thing — and the
   whole point of the stage is that these are solid things stacked in order.
   ------------------------------------------------------------------------- */

const FADE = new THREE.Color('#152538');

interface Emphasisable {
  material: THREE.MeshStandardMaterial;
  base: THREE.Color;
  env: number;
}

const byLayer = new Map<LayerKey, Emphasisable[]>();

function rememberBases(m: AssemblyMaterials): void {
  const entry = (mat: THREE.MeshStandardMaterial): Emphasisable => ({
    material: mat,
    base: mat.color.clone(),
    env: mat.envMapIntensity,
  });
  byLayer.set('framing', [entry(m.lumber)]);
  byLayer.set('insulation', [entry(m.insulation)]);
  byLayer.set('sheathing', [entry(m.osb)]);
  byLayer.set('barrier', [entry(m.wrap)]);
  byLayer.set('cladding', [entry(m.siding), entry(m.trim), entry(m.sash), entry(m.glass)]);
}

/** 1 = this layer is the subject, 0 = it has receded into the stage. */
export function setLayerEmphasis(key: LayerKey, amount: number): void {
  const list = byLayer.get(key);
  if (!list) return;
  const a = THREE.MathUtils.clamp(amount, 0, 1);
  for (const e of list) {
    e.material.color.copy(FADE).lerp(e.base, 0.24 + a * 0.76);
    e.material.envMapIntensity = e.env * (0.3 + a * 0.7);
  }
}

/** The studio's finish and profile, carried onto the outermost layer. */
export function setAssemblyFinish(colourId: string, profile: SidingProfile): void {
  if (!cached) return;
  const choice = SIDING_COLORS.find((c) => c.id === colourId) ?? SIDING_COLORS[0];
  const maps = sidingMaps(profile);
  cached.siding.map = tile(maps.map, 1);
  cached.siding.normalMap = tile(maps.normalMap, 1);
  cached.siding.needsUpdate = true;
  const entry = byLayer.get('cladding')?.[0];
  if (entry) entry.base.set(choice.hex);
  cached.siding.color.set(choice.hex);
}

export function disposeAssemblyMaterials(): void {
  if (!cached) return;
  for (const mat of cached.all) mat.dispose();
  cached = null;
  byLayer.clear();
}
