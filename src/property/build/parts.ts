/**
 * Architectural parts, built in wall-local space:
 *   x = distance along the wall from its left end (seen from outside)
 *   y = world height
 *   z = outward from the cladding face (0 at the face, + toward the viewer)
 *
 * Each builder pushes into a `Parts` bag keyed by material. The caller
 * transforms the whole bag onto a wall with one matrix, so a window built here
 * lands correctly on the front, the side or the rear without special cases.
 */

import * as THREE from 'three';
import { box, cyl, merge } from '../lib/geo';
import type { WindowSpec } from './dims';
import { gutterSpec } from './dims';

export type MatKey =
  | 'siding'
  | 'sidingAccent'
  | 'trim'
  | 'soffit'
  | 'gutter'
  | 'roof'
  | 'foundation'
  | 'stone'
  | 'glass'
  | 'sash'
  | 'entryDoor'
  | 'garageDoor'
  | 'shutter'
  | 'hardware'
  | 'deck'
  | 'railing'
  | 'flatwork'
  | 'lawn'
  | 'mulch'
  | 'shrub'
  | 'foliage'
  | 'bark';

export class Parts {
  private bag = new Map<MatKey, THREE.BufferGeometry[]>();

  add(key: MatKey, ...geos: THREE.BufferGeometry[]): void {
    const list = this.bag.get(key);
    if (list) list.push(...geos);
    else this.bag.set(key, geos);
  }

  /** Absorb another bag, optionally transforming everything it holds. */
  absorb(other: Parts, matrix?: THREE.Matrix4): void {
    for (const [key, geos] of other.bag) {
      if (matrix) for (const g of geos) g.applyMatrix4(matrix);
      this.add(key, ...geos);
    }
  }

  merged(): Map<MatKey, THREE.BufferGeometry> {
    const out = new Map<MatKey, THREE.BufferGeometry>();
    for (const [key, geos] of this.bag) out.set(key, merge(geos));
    this.bag.clear();
    return out;
  }

  get size(): number {
    let n = 0;
    for (const geos of this.bag.values()) n += geos.length;
    return n;
  }
}

/** Matrix that maps wall-local space onto a wall in the world. */
export function wallMatrix(
  origin: THREE.Vector3,
  dirU: THREE.Vector3,
  normal: THREE.Vector3,
): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.makeBasis(dirU.clone().normalize(), new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  m.setPosition(origin.x, 0, origin.z);
  return m;
}

/* -------------------------------------------------------------------------
   Windows
   ------------------------------------------------------------------------- */

const CASING = 0.085;
const CASING_T = 0.032;
const JAMB_D = 0.1;
const SASH_W = 0.052;
const SASH_Z = -0.055;
const GLASS_Z = -0.082;
const MUNTIN = 0.022;

/**
 * A trimmed replacement window: jamb return, sash frame, mullions, muntin
 * grille, glazing, casing with a proper head and a projecting sill.
 */
export function windowUnit(p: Parts, spec: WindowSpec): void {
  const { u, y, w, h } = spec;
  const units = spec.units ?? 1;
  const [gc, gr] = spec.grid ?? [1, 1];
  const cx = u;
  const cy = y + h / 2;

  // Jamb and head returns so the opening reads as a real hole with depth.
  const jz = -JAMB_D / 2;
  p.add(
    'sash',
    box(0.04, h, JAMB_D, { at: [cx - w / 2 + 0.02, cy, jz] }),
    box(0.04, h, JAMB_D, { at: [cx + w / 2 - 0.02, cy, jz] }),
    box(w, 0.04, JAMB_D, { at: [cx, y + h - 0.02, jz] }),
    box(w, 0.05, JAMB_D, { at: [cx, y + 0.025, jz] }),
  );

  const unitW = w / units;
  for (let i = 0; i < units; i++) {
    const ox = cx - w / 2 + unitW * (i + 0.5);

    // Sash frame around each operable unit.
    p.add(
      'sash',
      box(unitW, SASH_W, 0.05, { at: [ox, y + SASH_W / 2, SASH_Z] }),
      box(unitW, SASH_W, 0.05, { at: [ox, y + h - SASH_W / 2, SASH_Z] }),
      box(SASH_W, h, 0.05, { at: [ox - unitW / 2 + SASH_W / 2, cy, SASH_Z] }),
      box(SASH_W, h, 0.05, { at: [ox + unitW / 2 - SASH_W / 2, cy, SASH_Z] }),
      // Meeting rail: every double-hung has one and its absence is noticeable.
      box(unitW - SASH_W * 2, 0.055, 0.045, { at: [ox, cy, SASH_Z] }),
    );

    // Colonial muntin grille.
    const gw = unitW - SASH_W * 2;
    const gh = h - SASH_W * 2;
    if (gc > 1) {
      for (let c = 1; c < gc; c++) {
        p.add('sash', box(MUNTIN, gh, 0.03, { at: [ox - gw / 2 + (gw * c) / gc, cy, SASH_Z + 0.008] }));
      }
    }
    if (gr > 1) {
      for (let r = 1; r < gr; r++) {
        const ry = y + SASH_W + (gh * r) / gr;
        if (Math.abs(ry - cy) < 0.05) continue; // the meeting rail already sits here
        p.add('sash', box(gw, MUNTIN, 0.03, { at: [ox, ry, SASH_Z + 0.008] }));
      }
    }

    p.add('glass', box(unitW - SASH_W * 1.6, h - SASH_W * 1.6, 0.012, { at: [ox, cy, GLASS_Z] }));
  }

  // Mullion posts between ganged units.
  for (let i = 1; i < units; i++) {
    p.add('trim', box(0.07, h + 0.02, CASING_T + 0.01, { at: [cx - w / 2 + unitW * i, cy, CASING_T / 2] }));
  }

  casing(p, cx, y, w, h);
  if (spec.shutters) shutters(p, cx, y, w, h);
}

/** Flat casing with a heavier head board and a projecting sill. */
function casing(p: Parts, cx: number, y: number, w: number, h: number): void {
  const ow = w + CASING * 2;
  const headH = 0.12;
  const z = CASING_T / 2;
  p.add(
    'trim',
    box(CASING, h + 0.02, CASING_T, { at: [cx - w / 2 - CASING / 2, y + h / 2, z] }),
    box(CASING, h + 0.02, CASING_T, { at: [cx + w / 2 + CASING / 2, y + h / 2, z] }),
    box(ow + 0.07, headH, CASING_T + 0.014, { at: [cx, y + h + headH / 2, z + 0.007] }),
    // Drip cap over the head.
    box(ow + 0.12, 0.028, CASING_T + 0.05, { at: [cx, y + h + headH + 0.014, z + 0.025] }),
    // Sill, sloped very slightly so it catches a highlight.
    box(ow + 0.09, 0.05, 0.14, { at: [cx, y - 0.025, 0.04], rot: [-0.09, 0, 0] }),
    box(ow + 0.04, 0.06, CASING_T, { at: [cx, y - 0.08, z] }),
  );
}

function shutters(p: Parts, cx: number, y: number, w: number, h: number): void {
  const sw = w * 0.42;
  const off = w / 2 + CASING + sw / 2 + 0.01;
  const louvres = 9;
  for (const side of [-1, 1]) {
    const sx = cx + side * off;
    p.add(
      'shutter',
      box(sw, h, 0.036, { at: [sx, y + h / 2, 0.02] }),
      box(sw, 0.075, 0.048, { at: [sx, y + 0.06, 0.026] }),
      box(sw, 0.075, 0.048, { at: [sx, y + h - 0.06, 0.026] }),
      box(sw, 0.075, 0.048, { at: [sx, y + h / 2, 0.026] }),
    );
    for (let i = 0; i < louvres; i++) {
      const ly = y + 0.14 + ((h - 0.28) * (i + 0.5)) / louvres;
      if (Math.abs(ly - (y + h / 2)) < 0.07) continue;
      p.add('shutter', box(sw - 0.03, 0.026, 0.03, { at: [sx, ly, 0.03], rot: [0.5, 0, 0] }));
    }
  }
}

/* -------------------------------------------------------------------------
   Doors
   ------------------------------------------------------------------------- */

/** Front entry: panelled slab, sidelights, casing, hardware, a small light. */
export function entryUnit(
  p: Parts,
  opts: { u: number; y: number; w: number; h: number; doorW: number; sideW: number },
): void {
  const { u, y, w, h, doorW, sideW } = opts;
  const cy = y + h / 2;

  p.add(
    'sash',
    box(0.05, h, JAMB_D, { at: [u - w / 2 + 0.025, cy, -JAMB_D / 2] }),
    box(0.05, h, JAMB_D, { at: [u + w / 2 - 0.025, cy, -JAMB_D / 2] }),
    box(w, 0.05, JAMB_D, { at: [u, y + h - 0.025, -JAMB_D / 2] }),
  );

  // Sidelights.
  for (const side of [-1, 1]) {
    const sx = u + side * (doorW / 2 + 0.06 + sideW / 2);
    p.add(
      'sash',
      box(sideW, h - 0.3, 0.05, { at: [sx, y + 0.15 + (h - 0.3) / 2, -0.05] }),
      box(0.06, h, 0.06, { at: [sx - side * (sideW / 2 + 0.03), cy, -0.03] }),
    );
    p.add('glass', box(sideW - 0.07, h - 0.42, 0.012, { at: [sx, y + 0.15 + (h - 0.3) / 2, -0.075] }));
    for (let i = 1; i < 4; i++) {
      p.add('sash', box(sideW - 0.06, MUNTIN, 0.026, { at: [sx, y + 0.15 + ((h - 0.3) * i) / 4, -0.062] }));
    }
    p.add('trim', box(sideW * 0.9, 0.09, 0.05, { at: [sx, y + 0.1, -0.03] }));
  }

  // Door slab with raised panels.
  const dz = -0.055;
  p.add('entryDoor', box(doorW, h - 0.02, 0.055, { at: [u, y + (h - 0.02) / 2, dz] }));
  const panels: [number, number, number, number][] = [
    [0, 0.62, doorW - 0.26, 0.62],
    [0, 1.42, doorW - 0.26, 0.78],
  ];
  for (const [px, py, pw, ph] of panels) {
    p.add(
      'entryDoor',
      box(pw, ph, 0.018, { at: [u + px, y + py, dz + 0.036] }),
      box(pw - 0.07, ph - 0.07, 0.03, { at: [u + px, y + py, dz + 0.04] }),
    );
  }
  p.add(
    'hardware',
    cyl(0.032, 0.032, 0.075, 12, { at: [u + doorW / 2 - 0.11, y + 1.02, dz - 0.05], rot: [Math.PI / 2, 0, 0] }),
    box(0.05, 0.16, 0.022, { at: [u + doorW / 2 - 0.11, y + 1.22, dz - 0.03] }),
  );

  casing(p, u, y, w, h);

  // Carriage light beside the door.
  const lx = u + w / 2 + 0.42;
  p.add(
    'hardware',
    box(0.1, 0.1, 0.05, { at: [lx, y + 1.62, 0.025] }),
    box(0.13, 0.26, 0.13, { at: [lx, y + 1.86, 0.09] }),
    box(0.17, 0.035, 0.17, { at: [lx, y + 2.0, 0.09] }),
  );
  p.add('glass', box(0.1, 0.2, 0.1, { at: [lx, y + 1.86, 0.09] }));
}

/** Sliding patio door onto the deck. */
export function patioUnit(p: Parts, opts: { u: number; y: number; w: number; h: number }): void {
  const { u, y, w, h } = opts;
  const cy = y + h / 2;
  p.add(
    'sash',
    box(0.06, h, JAMB_D, { at: [u - w / 2 + 0.03, cy, -JAMB_D / 2] }),
    box(0.06, h, JAMB_D, { at: [u + w / 2 - 0.03, cy, -JAMB_D / 2] }),
    box(w, 0.06, JAMB_D, { at: [u, y + h - 0.03, -JAMB_D / 2] }),
    box(0.075, h, 0.07, { at: [u, cy, -0.05] }),
  );
  for (const side of [-1, 1]) {
    const sx = u + side * w / 4;
    const sw = w / 2 - 0.1;
    p.add(
      'sash',
      box(sw, 0.05, 0.05, { at: [sx, y + 0.06, -0.05] }),
      box(sw, 0.05, 0.05, { at: [sx, y + h - 0.06, -0.05] }),
    );
    p.add('glass', box(sw - 0.02, h - 0.16, 0.012, { at: [sx, cy, -0.08] }));
  }
  p.add('hardware', box(0.035, 0.22, 0.035, { at: [u - 0.16, y + 1.0, -0.09] }));
  casing(p, u, y, w, h);
}

/** Sectional garage door: four horizontal sections of raised panels. */
export function garageDoorUnit(p: Parts, opts: { u: number; y: number; w: number; h: number }): void {
  const { u, y, w, h } = opts;
  const sections = 4;
  const cols = 4;
  const sz = -0.075;
  p.add('garageDoor', box(w, h, 0.06, { at: [u, y + h / 2, sz] }));
  for (let s = 0; s < sections; s++) {
    const sy = y + (h * (s + 0.5)) / sections;
    const sh = h / sections;
    for (let c = 0; c < cols; c++) {
      const px = u - w / 2 + (w * (c + 0.5)) / cols;
      const pw = w / cols - 0.11;
      p.add(
        'garageDoor',
        box(pw, sh - 0.11, 0.022, { at: [px, sy, sz + 0.038] }),
        box(pw - 0.075, sh - 0.185, 0.032, { at: [px, sy, sz + 0.042] }),
      );
    }
    // Section joint shadow line.
    if (s > 0) p.add('hardware', box(w, 0.014, 0.018, { at: [u, y + (h * s) / sections, sz + 0.034] }));
  }
  // Glazed top section.
  for (let c = 0; c < cols; c++) {
    const px = u - w / 2 + (w * (c + 0.5)) / cols;
    p.add('glass', box(w / cols - 0.13, h / sections - 0.2, 0.012, { at: [px, y + h - h / sections / 2, sz - 0.02] }));
  }
  // Jambs and head trim around the opening.
  p.add(
    'trim',
    box(0.13, h + 0.14, 0.05, { at: [u - w / 2 - 0.065, y + (h + 0.14) / 2, 0.025] }),
    box(0.13, h + 0.14, 0.05, { at: [u + w / 2 + 0.065, y + (h + 0.14) / 2, 0.025] }),
    box(w + 0.4, 0.14, 0.06, { at: [u, y + h + 0.07, 0.03] }),
  );
}

/* -------------------------------------------------------------------------
   Eave assembly: fascia, soffit, gutter, downspout
   ------------------------------------------------------------------------- */

/**
 * A K-style gutter run, hung on its fascia, in wall-local space along x.
 * `y` is the top of the gutter (= eave line); `z` the outer face of the fascia.
 */
export function gutterRun(p: Parts, x0: number, x1: number, y: number, z: number): void {
  const { w, h, fascia } = gutterSpec;
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  p.add('trim', box(len, fascia, 0.026, { at: [cx, y - fascia / 2, z + 0.013] }));
  p.add(
    'gutter',
    // Back, bottom and the two-step ogee face.
    box(len, h, 0.018, { at: [cx, y - h / 2, z + 0.035] }),
    box(len, 0.018, w, { at: [cx, y - h + 0.009, z + 0.035 + w / 2] }),
    box(len, h * 0.55, 0.02, { at: [cx, y - h * 0.275, z + 0.035 + w] }),
    box(len, h * 0.45, 0.02, { at: [cx, y - h * 0.775, z + 0.035 + w * 0.72] }),
    box(len, 0.016, 0.03, { at: [cx, y + 0.004, z + 0.035 + w] }),
  );
}

/** Downspout with a top elbow, straps and a kick-out at the bottom. */
export function downspout(p: Parts, x: number, yTop: number, yBottom: number, z: number): void {
  const { spoutW, spoutD } = gutterSpec;
  const h = yTop - yBottom;
  p.add(
    'gutter',
    box(spoutW, h, spoutD, { at: [x, yBottom + h / 2, z + spoutD / 2] }),
    box(spoutW + 0.016, 0.055, spoutD + 0.016, { at: [x, yTop - 0.09, z + spoutD / 2] }),
    box(spoutW + 0.016, 0.05, spoutD + 0.016, { at: [x, yBottom + h * 0.55, z + spoutD / 2] }),
    // Kick-out elbow.
    box(spoutW, 0.075, 0.32, { at: [x, yBottom + 0.04, z + 0.18], rot: [0.45, 0, 0] }),
  );
}

/** Boxed soffit returning from the wall out to the fascia. */
export function soffitRun(p: Parts, x0: number, x1: number, y: number, z0: number, z1: number): void {
  const len = x1 - x0;
  const depth = z1 - z0;
  p.add('soffit', box(len, 0.028, depth, { at: [(x0 + x1) / 2, y - 0.014, (z0 + z1) / 2] }));
  // Frieze board where the soffit meets the wall.
  p.add('trim', box(len, 0.14, 0.03, { at: [(x0 + x1) / 2, y - 0.09, z0 + 0.015] }));
}

/* -------------------------------------------------------------------------
   Railings and stairs
   ------------------------------------------------------------------------- */

/** Railing along x, at height `y` (deck surface), depth `z`. */
export function railing(p: Parts, x0: number, x1: number, y: number, z: number, h: number): void {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const posts = Math.max(2, Math.round(len / 1.6));
  for (let i = 0; i <= posts; i++) {
    const px = x0 + (len * i) / posts;
    p.add(
      'railing',
      box(0.1, h + 0.08, 0.1, { at: [px, y + (h + 0.08) / 2, z] }),
      box(0.15, 0.045, 0.15, { at: [px, y + h + 0.1, z] }),
      box(0.11, 0.05, 0.11, { at: [px, y + h + 0.14, z] }),
    );
  }
  p.add(
    'railing',
    box(len, 0.045, 0.115, { at: [cx, y + h - 0.02, z] }),
    box(len, 0.038, 0.09, { at: [cx, y + 0.12, z] }),
  );
  const bal = Math.floor(len / 0.115);
  for (let i = 0; i < bal; i++) {
    const bx = x0 + (len * (i + 0.5)) / bal;
    p.add('railing', box(0.032, h - 0.19, 0.032, { at: [bx, y + 0.135 + (h - 0.19) / 2, z] }));
  }
}

/** Straight run of steps descending in +z. */
export function steps(
  p: Parts,
  opts: { cx: number; w: number; top: number; z0: number; count: number; rise: number; tread: number },
  material: MatKey = 'flatwork',
): void {
  const { cx, w, top, z0, count, rise, tread } = opts;
  for (let i = 0; i < count; i++) {
    const y = top - rise * (i + 1);
    const z = z0 + tread * i;
    p.add(material, box(w, rise, tread + 0.04, { at: [cx, y + rise / 2, z + tread / 2] }));
    p.add(material, box(w + 0.05, 0.035, tread + 0.09, { at: [cx, y + rise, z + tread / 2 + 0.02] }));
  }
}
