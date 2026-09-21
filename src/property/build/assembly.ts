/**
 * The wall assembly — the "look inside the wall" stage.
 *
 * A one-bay section of exterior wall, built the way it is built on site and
 * separated into the five layers a homeowner actually pays for. Each layer is
 * its own geometry so it can be moved, highlighted and labelled independently;
 * within a layer everything is merged, so the whole assembly still draws in a
 * handful of calls.
 *
 * Local space: x across the bay (0 at the left stud), y up from the bottom
 * plate, z outward from the framing toward the viewer. The stage places it.
 */

import * as THREE from 'three';
import { box, boxFrom, merge } from '../lib/geo';
import { WALL_LAYERS, type LayerInfo, type LayerKey } from '../wallLayers';

/** 2.44 m bay, 2.6 m tall: one sheet of sheathing, studs at 16 inches. */
const BAY = 2.44;
const HEIGHT = 2.62;
const STUD_W = 0.038;
const STUD_D = 0.14; // a 2x6 wall, which is what gets built here now
const SPACING = 0.4064; // 16" on centre

/** A window rough opening, so the layers read as a wall and not a panel. */
const OPENING = { x: 1.18, y: 0.95, w: 0.92, h: 1.25 };

export type { LayerKey };

export interface AssemblyLayer extends LayerInfo {
  /** Geometry keyed by the material it is drawn with. */
  parts: Map<string, THREE.BufferGeometry>;
  /** Where the flag sits, in local space, once the layer has travelled. */
  anchor: [number, number, number];
  /** The point on the layer the flag's leader line runs down to. */
  stem: [number, number, number];
}

function studWall(): Map<string, THREE.BufferGeometry> {
  const lumber: THREE.BufferGeometry[] = [];

  // Plates: one at the bottom, doubled at the top, as framed.
  lumber.push(boxFrom(0, 0, 0, BAY, STUD_W, STUD_D));
  lumber.push(boxFrom(0, HEIGHT - STUD_W * 2, 0, BAY, STUD_W, STUD_D));
  lumber.push(boxFrom(0, HEIGHT - STUD_W, 0, BAY, STUD_W, STUD_D));

  const top = HEIGHT - STUD_W * 2;
  for (let x = 0; x <= BAY - STUD_W + 0.001; x += SPACING) {
    const left = Math.min(x, BAY - STUD_W);
    const overlapsOpening = left + STUD_W > OPENING.x && left < OPENING.x + OPENING.w;
    if (!overlapsOpening) {
      lumber.push(boxFrom(left, STUD_W, 0, STUD_W, top - STUD_W, STUD_D));
      continue;
    }
    // Cripples above and below the opening rather than a stud through it.
    lumber.push(boxFrom(left, STUD_W, 0, STUD_W, OPENING.y - STUD_W, STUD_D));
    const headTop = OPENING.y + OPENING.h + 0.14;
    lumber.push(boxFrom(left, headTop, 0, STUD_W, top - headTop, STUD_D));
  }

  // King studs, jacks, header and sill around the opening.
  lumber.push(boxFrom(OPENING.x - STUD_W * 2, STUD_W, 0, STUD_W, top - STUD_W, STUD_D));
  lumber.push(boxFrom(OPENING.x + OPENING.w + STUD_W, STUD_W, 0, STUD_W, top - STUD_W, STUD_D));
  lumber.push(boxFrom(OPENING.x - STUD_W, STUD_W, 0, STUD_W, OPENING.y + OPENING.h - STUD_W, STUD_D));
  lumber.push(boxFrom(OPENING.x + OPENING.w, STUD_W, 0, STUD_W, OPENING.y + OPENING.h - STUD_W, STUD_D));
  lumber.push(boxFrom(OPENING.x - STUD_W, OPENING.y + OPENING.h, 0, OPENING.w + STUD_W * 2, 0.14, STUD_D));
  lumber.push(boxFrom(OPENING.x, OPENING.y - STUD_W, 0, OPENING.w, STUD_W, STUD_D));

  return new Map([['lumber', merge(lumber)]]);
}

/** Batts between the studs — visible through the framing, and the reason a wall costs what it costs. */
function insulation(): Map<string, THREE.BufferGeometry> {
  const batts: THREE.BufferGeometry[] = [];
  const top = HEIGHT - STUD_W * 2;
  const depth = STUD_D - 0.012;

  for (let x = 0; x <= BAY - STUD_W + 0.001; x += SPACING) {
    const left = Math.min(x, BAY - STUD_W) + STUD_W;
    const width = Math.min(SPACING - STUD_W, BAY - left);
    if (width < 0.05) continue;
    const overlaps = left + width > OPENING.x && left < OPENING.x + OPENING.w;
    if (!overlaps) {
      batts.push(boxFrom(left, STUD_W, 0.006, width, top - STUD_W * 2, depth));
      continue;
    }
    batts.push(boxFrom(left, STUD_W, 0.006, width, OPENING.y - STUD_W * 2, depth));
    const headTop = OPENING.y + OPENING.h + 0.15;
    batts.push(boxFrom(left, headTop, 0.006, width, top - headTop - STUD_W, depth));
  }

  return new Map([['insulation', merge(batts)]]);
}

/** A panel with the window opening cut out of it, as four pieces. */
function pierced(z: number, thickness: number, inset = 0): THREE.BufferGeometry {
  const x0 = OPENING.x - inset;
  const x1 = OPENING.x + OPENING.w + inset;
  const y0 = OPENING.y - inset;
  const y1 = OPENING.y + OPENING.h + inset;
  return merge([
    boxFrom(0, 0, z, BAY, y0, thickness),
    boxFrom(0, y1, z, BAY, HEIGHT - y1, thickness),
    boxFrom(0, y0, z, x0, y1 - y0, thickness),
    boxFrom(x1, y0, z, BAY - x1, y1 - y0, thickness),
  ]);
}

export function buildAssembly(): { layers: AssemblyLayer[]; triangles: number } {
  const sheathingZ = STUD_D;
  const barrierZ = sheathingZ + 0.012;
  const claddingZ = barrierZ + 0.003;

  const trimParts = (): THREE.BufferGeometry => {
    const trim: THREE.BufferGeometry[] = [];
    const t = 0.032;
    const o = 0.075;
    // Casing around the opening, then a sill with a drip edge.
    trim.push(boxFrom(OPENING.x - o, OPENING.y - o, claddingZ, OPENING.w + o * 2, o, t));
    trim.push(boxFrom(OPENING.x - o, OPENING.y + OPENING.h, claddingZ, OPENING.w + o * 2, o, t));
    trim.push(boxFrom(OPENING.x - o, OPENING.y, claddingZ, o, OPENING.h, t));
    trim.push(boxFrom(OPENING.x + OPENING.w, OPENING.y, claddingZ, o, OPENING.h, t));
    trim.push(
      box(OPENING.w + o * 2.6, 0.03, 0.09, {
        at: [OPENING.x + OPENING.w / 2, OPENING.y - o - 0.012, claddingZ + 0.03],
        rot: [-0.09, 0, 0],
      }),
    );
    return merge(trim);
  };

  /**
   * Labels ride on the top edge of their own layer — every other anchor the
   * stack offers is hidden behind the layer in front of it, which is how a
   * flag ends up pointing at something it does not belong to.
   *
   * They also climb. The layers separate along one axis, so from any camera
   * the five anchors project onto a short line: five flags reading "WEATHER
   * BARRIER" and "SIDING AND TRIM" cannot fit across sixty pixels, and they
   * pile into an unreadable heap. Stepping each one 300 mm higher than the
   * layer in front of it turns that heap into a staircase, with the cladding
   * — the layer this whole section is about — at the top. The step is small:
   * four of them have to clear the wall and still sit under the header.
   */
  const RISE = 0.2;
  const EDGE = HEIGHT + 0.07;
  type Flag = { anchor: [number, number, number]; stem: [number, number, number] };
  const flag = (index: number, z: number): Flag => ({
    anchor: [BAY * 0.44, EDGE + (index - 1) * RISE, z],
    stem: [BAY * 0.44, EDGE, z],
  });

  const geometry: Record<LayerKey, { parts: Map<string, THREE.BufferGeometry> } & Flag> = {
    framing: { parts: studWall(), ...flag(WALL_LAYERS[0].index, STUD_D * 0.5) },
    insulation: { parts: insulation(), ...flag(WALL_LAYERS[1].index, STUD_D * 0.5) },
    sheathing: {
      parts: new Map([['osb', pierced(sheathingZ, 0.012)]]),
      ...flag(WALL_LAYERS[2].index, sheathingZ),
    },
    barrier: {
      parts: new Map([['wrap', pierced(barrierZ, 0.0015)]]),
      ...flag(WALL_LAYERS[3].index, barrierZ),
    },
    cladding: {
      parts: new Map([
        ['siding', pierced(claddingZ, 0.019)],
        ['trim', trimParts()],
      ]),
      ...flag(WALL_LAYERS[4].index, claddingZ),
    },
  };

  const layers: AssemblyLayer[] = WALL_LAYERS.map((info) => ({ ...info, ...geometry[info.key] }));

  let triangles = 0;
  for (const layer of layers) {
    for (const g of layer.parts.values()) {
      const index = g.getIndex();
      triangles += (index ? index.count : g.attributes.position.count) / 3;
    }
  }

  return { layers, triangles };
}

/** The window unit sits in the opening and travels with the cladding. */
export function buildAssemblyWindow(): Map<string, THREE.BufferGeometry> {
  const z = STUD_D + 0.012;
  const sash: THREE.BufferGeometry[] = [];
  const f = 0.045;
  sash.push(boxFrom(OPENING.x, OPENING.y, z, OPENING.w, f, 0.1));
  sash.push(boxFrom(OPENING.x, OPENING.y + OPENING.h - f, z, OPENING.w, f, 0.1));
  sash.push(boxFrom(OPENING.x, OPENING.y, z, f, OPENING.h, 0.1));
  sash.push(boxFrom(OPENING.x + OPENING.w - f, OPENING.y, z, f, OPENING.h, 0.1));
  // Meeting rail and a single vertical muntin, matching the house's windows.
  sash.push(boxFrom(OPENING.x, OPENING.y + OPENING.h / 2 - 0.02, z + 0.02, OPENING.w, 0.04, 0.05));
  sash.push(boxFrom(OPENING.x + OPENING.w / 2 - 0.014, OPENING.y, z + 0.02, 0.028, OPENING.h, 0.045));

  const glass = boxFrom(OPENING.x + f, OPENING.y + f, z + 0.03, OPENING.w - f * 2, OPENING.h - f * 2, 0.012);

  return new Map([
    ['sash', merge(sash)],
    ['glass', glass],
  ]);
}

export const assemblySize = { bay: BAY, height: HEIGHT, depth: STUD_D };
