/**
 * Builds the whole property as one merged geometry per material.
 *
 * The result is roughly twenty draw calls for a house with trimmed windows,
 * muntin grilles, shutters, a panelled entry, a sectional garage door, K-style
 * gutters with downspouts, a stone water table, a framed deck with railings
 * and stairs, flatwork and planting. Nothing is instanced at runtime and
 * nothing animates, so the scene can be rendered twice per frame for the
 * siding comparison without the frame budget noticing.
 *
 * Where a cross gable meets the main roof, the two roof boxes are allowed to
 * interpenetrate rather than being trimmed to an exact valley. They meet at
 * different angles so nothing z-fights, and the intersection reads as the
 * valley it actually is.
 */

import * as THREE from 'three';
import { box, boxFrom, cyl, wallGeometry, type Opening } from '../lib/geo';
import { mulberry32 } from '../lib/noise';
import { LEAF_TILES } from '../materials/foliage';
import {
  Parts,
  downspout,
  entryUnit,
  garageDoorUnit,
  gutterRun,
  patioUnit,
  railing,
  steps,
  wallMatrix,
  windowUnit,
  type MatKey,
} from './parts';
import {
  GARAGE_PITCH,
  PITCH,
  PORCH_PITCH,
  bay,
  bayWindows,
  bay_ridgeY,
  deck,
  entry,
  frontWindows,
  garage,
  garage_ridgeY,
  leftWindows,
  main,
  main_ridgeY,
  patioDoor,
  porch,
  porch_peakY,
  rearWindows,
  rightWindows,
  site,
  type WindowSpec,
} from './dims';

const UP = new THREE.Vector3(0, 1, 0);
const ROOF_T = 0.11;

/** Run `fn` in a local frame and fold the result into `target`. */
function local(target: Parts, m: THREE.Matrix4, fn: (p: Parts) => void): void {
  const sub = new Parts();
  fn(sub);
  target.absorb(sub, m);
}

function elevationMatrix(origin: [number, number, number], normal: [number, number, number]): THREE.Matrix4 {
  const n = new THREE.Vector3(...normal);
  const dirU = new THREE.Vector3().crossVectors(UP, n);
  return wallMatrix(new THREE.Vector3(...origin), dirU, n);
}

interface Elevation {
  origin: [number, number, number];
  normal: [number, number, number];
  width: number;
  y0: number;
  y1: number;
  gable?: { peakY: number; peakU: number };
  windows: WindowSpec[];
  cladding?: MatKey;
  extra?: (p: Parts) => void;
  extraOpenings?: Opening[];
  /** Corner boards at u = 0 and u = width. */
  corners?: [boolean, boolean];
  /** Height of the stone water table wrapping the base of this elevation. */
  stone?: number;
}

function elevation(target: Parts, e: Elevation): void {
  const m = elevationMatrix(e.origin, e.normal);
  const openings: Opening[] = [
    ...e.windows.map((w) => ({ u: w.u, y: w.y, w: w.w, h: w.h })),
    ...(e.extraOpenings ?? []),
  ];

  local(target, m, (p) => {
    p.add(e.cladding ?? 'siding', wallGeometry({ width: e.width, y0: e.y0, y1: e.y1, gable: e.gable }, openings));

    for (const w of e.windows) windowUnit(p, w);
    e.extra?.(p);

    // Corner boards hide the plane-to-plane seam and are how a real siding
    // job actually terminates a course.
    const [c0 = true, c1 = true] = e.corners ?? [];
    if (c0) p.add('trim', box(0.11, e.y1 - e.y0, 0.07, { at: [0.055, (e.y0 + e.y1) / 2, 0.035] }));
    if (c1) p.add('trim', box(0.11, e.y1 - e.y0, 0.07, { at: [e.width - 0.055, (e.y0 + e.y1) / 2, 0.035] }));
  });
}

/** Merging needs matching attributes; primitives without UVs get empty ones. */
function blankUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  const count = (g.attributes.position as THREE.BufferAttribute).count;
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  return g;
}

/**
 * A cluster of leaf cards.
 *
 * Each card is a quad carrying one tile of the leaf atlas, turned to a random
 * attitude and placed on a squashed sphere around the centre. Two details do
 * the work:
 *
 * The **normals are spherical**, taken from the cluster centre rather than
 * from the face. A flat quad lit by its own normal is a flat quad, and forty
 * of them at forty angles is a glitter ball. Pointing the normals outward
 * makes the whole cluster shade as one round mass while its edge stays cut.
 *
 * The cards are spread with a bias toward the outside, because that is where
 * the silhouette is and the silhouette is the whole point.
 */
function leafCluster(
  p: Parts,
  key: 'shrub' | 'foliage',
  centre: [number, number, number],
  radius: number,
  cards: number,
  seed: number,
  squash = 1,
): void {
  const rnd = mulberry32(seed * 7919 + 13);
  const [cx, cy, cz] = centre;
  const tile = 1 / LEAF_TILES;

  for (let i = 0; i < cards; i++) {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const rho = Math.sqrt(1 - u * u);
    const spread = 0.3 + Math.pow(rnd(), 0.55) * 0.7;
    const dx = Math.cos(phi) * rho * radius * spread;
    const dy = u * radius * squash * spread;
    const dz = Math.sin(phi) * rho * radius * spread;

    const size = radius * (0.72 + rnd() * 0.5);
    const g = new THREE.PlaneGeometry(size, size);

    // One of the four atlas tiles, flipped at random so eight readings come
    // out of four drawings.
    const tx = Math.floor(rnd() * LEAF_TILES);
    const ty = Math.floor(rnd() * LEAF_TILES);
    const flip = rnd() < 0.5;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < uv.count; v++) {
      const su = flip ? 1 - uv.getX(v) : uv.getX(v);
      uv.setXY(v, (tx + su) * tile, (ty + uv.getY(v)) * tile);
    }

    g.rotateX(rnd() * Math.PI * 2);
    g.rotateY(rnd() * Math.PI * 2);
    g.rotateZ(rnd() * Math.PI * 2);
    g.translate(cx + dx, cy + dy, cz + dz);

    // Spherical normals, from the centre of the cluster outward, tipped a
    // third of the way toward the sky. A leaf scatters light rather than
    // reflecting it off one face, so a purely radial normal makes the sunlit
    // side glare and the shaded side go black — two plants, not one.
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const nx = pos.getX(v) - cx;
      const ny = (pos.getY(v) - cy) / Math.max(squash, 0.2);
      const nz = pos.getZ(v) - cz;
      const len = Math.hypot(nx, ny, nz) || 1;
      const ux = nx / len;
      const uy = ny / len + 0.5;
      const uz = nz / len;
      const l2 = Math.hypot(ux, uy, uz) || 1;
      nrm.setXYZ(v, ux / l2, uy / l2, uz / l2);
    }

    p.add(key, g);
  }
}

/**
 * A shrub: three overlapping clusters of cards at different heights, so the
 * outline is broken both by the leaves and by the masses they sit in.
 */
function shrub(p: Parts, x: number, z: number, r: number, seed: number): void {
  const rnd = mulberry32(seed * 37 + 11);
  const lobes: [number, number, number, number][] = [
    [0, r * 0.62, 0, 0.94],
    [r * 0.44, r * 0.98, r * 0.2, 0.68],
    [-r * 0.36, r * 0.88, -r * 0.26, 0.6],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const [lx, ly, lz, k] = lobes[i];
    leafCluster(
      p,
      'shrub',
      [x + lx + (rnd() - 0.5) * r * 0.14, ly, z + lz + (rnd() - 0.5) * r * 0.14],
      r * k,
      i === 0 ? 26 : 16,
      seed + i * 13,
      0.82 + rnd() * 0.16,
    );
  }
}

function tree(p: Parts, x: number, z: number, scale: number, seed: number): void {
  const rnd = mulberry32(seed);
  const h = 3.1 * scale;
  p.add('bark', blankUv(cyl(0.13 * scale, 0.24 * scale, h, 9, { at: [x, h / 2, z] })));

  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    p.add(
      'bark',
      blankUv(
        cyl(0.05 * scale, 0.09 * scale, 1.5 * scale, 6, {
          at: [x + Math.cos(a) * 0.45 * scale, h * 0.86, z + Math.sin(a) * 0.45 * scale],
          rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5],
        }),
      ),
    );
  }

  // Several smaller masses rather than one large one: a canopy is a handful
  // of clumps hanging off branches, and the gaps between them are as much of
  // the read as the leaves are.
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rnd();
    const rr = (0.62 + rnd() * 0.34) * scale;
    const d = (0.5 + rnd() * 0.62) * scale;
    leafCluster(
      p,
      'foliage',
      [x + Math.cos(a) * d, h * (1.0 + rnd() * 0.36), z + Math.sin(a) * d],
      rr,
      16,
      seed + i * 31,
      0.88,
    );
  }
}

/* ------------------------------------------------------------------------ */

export interface PropertyBuild {
  geometries: Map<MatKey, THREE.BufferGeometry>;
  triangles: number;
  bounds: THREE.Box3;
}

export function buildProperty(): PropertyBuild {
  const P = new Parts();
  const mainW = main.xR - main.xL;
  const mainD = main.zF - main.zB;
  const bayW = bay.xR - bay.xL;
  const bayD = bay.zF - main.zF;

  /* -- stone water table, footings and interior core --------------------- */

  P.add(
    'stone',
    boxFrom(main.xL - 0.07, 0, main.zB - 0.07, mainW + 0.14, main.y0, mainD + 0.14),
    boxFrom(bay.xL - 0.07, 0, main.zF, bayW + 0.14, main.y0, bayD + 0.07),
    boxFrom(garage.xL - 0.06, 0, garage.zB - 0.06, garage.xR - garage.xL + 0.12, garage.y0, garage.zF - garage.zB + 0.12),
  );
  // Stone cap: a thin projecting course where the cladding starts.
  P.add(
    'flatwork',
    boxFrom(main.xL - 0.11, main.y0 - 0.045, main.zB - 0.11, mainW + 0.22, 0.045, mainD + 0.22),
    boxFrom(bay.xL - 0.11, main.y0 - 0.045, main.zF, bayW + 0.22, 0.045, bayD + 0.11),
  );

  /* A solid core so the shell never reads as hollow from a high angle.
     It stands 120 mm inside the cladding, and that number is load-bearing:
     glazing sits 82 mm back from the wall face, so a core any shallower than
     about 90 mm stands in front of every pane. It did, at 50 mm — what looked
     like flat opaque glass was this concrete seen through the opening, form
     seam and all. Keep the inset deeper than GLASS_Z in `parts.ts`. */
  const CORE = 0.12;
  P.add(
    'foundation',
    boxFrom(main.xL + CORE, main.y0, main.zB + CORE, mainW - CORE * 2, main.eave - main.y0, mainD - CORE * 2),
    boxFrom(bay.xL + CORE, main.y0, main.zF - 0.3, bayW - CORE * 2, main.eave - main.y0, bayD + 0.3 - CORE),
    boxFrom(
      garage.xL + CORE,
      garage.y0,
      garage.zB + CORE,
      garage.xR - garage.xL - CORE * 2,
      garage.eave - garage.y0,
      garage.zF - garage.zB - CORE * 2,
    ),
  );

  /* -- main block elevations -------------------------------------------- */

  elevation(P, {
    origin: [main.xL, 0, main.zF],
    normal: [0, 0, 1],
    width: mainW,
    y0: main.y0,
    y1: main.eave,
    windows: frontWindows,
    extraOpenings: [{ u: entry.u, y: main.y0, w: entry.w, h: entry.h }],
    extra: (p) => entryUnit(p, { u: entry.u, y: main.y0, w: entry.w, h: entry.h, doorW: entry.doorW, sideW: entry.sideW }),
    corners: [true, false],
  });

  elevation(P, {
    origin: [main.xR, 0, main.zF],
    normal: [1, 0, 0],
    width: mainD,
    y0: main.y0,
    y1: main.eave,
    gable: { peakY: main_ridgeY, peakU: mainD / 2 },
    windows: rightWindows,
    extra: (p) => gableVent(p, mainD / 2, main.eave + 0.95),
    corners: [false, true],
  });

  elevation(P, {
    origin: [main.xL, 0, main.zB],
    normal: [-1, 0, 0],
    width: mainD,
    y0: main.y0,
    y1: main.eave,
    gable: { peakY: main_ridgeY, peakU: mainD / 2 },
    windows: leftWindows,
    extra: (p) => gableVent(p, mainD / 2, main.eave + 0.95),
  });

  elevation(P, {
    origin: [main.xR, 0, main.zB],
    normal: [0, 0, -1],
    width: mainW,
    y0: main.y0,
    y1: main.eave,
    windows: rearWindows,
    extraOpenings: [{ u: patioDoor.u, y: main.y0, w: patioDoor.w, h: patioDoor.h }],
    extra: (p) => patioUnit(p, { u: patioDoor.u, y: main.y0, w: patioDoor.w, h: patioDoor.h }),
  });

  /* -- projecting front-gable bay ---------------------------------------- */

  elevation(P, {
    origin: [bay.xL, 0, bay.zF],
    normal: [0, 0, 1],
    width: bayW,
    y0: main.y0,
    y1: bay.eave,
    gable: { peakY: bay_ridgeY, peakU: bay.ridgeX - bay.xL },
    windows: bayWindows,
    cladding: 'sidingAccent',
  });

  elevation(P, {
    origin: [bay.xL, 0, main.zF],
    normal: [-1, 0, 0],
    width: bayD,
    y0: main.y0,
    y1: bay.eave,
    windows: [],
    corners: [false, false],
  });

  elevation(P, {
    origin: [bay.xR, 0, bay.zF],
    normal: [1, 0, 0],
    width: bayD,
    y0: main.y0,
    y1: bay.eave,
    windows: [],
    corners: [false, false],
  });

  /* -- garage wing elevations -------------------------------------------- */

  const garW = garage.xR - garage.xL;
  const garD = garage.zF - garage.zB;

  elevation(P, {
    origin: [garage.xL, 0, garage.zF],
    normal: [0, 0, 1],
    width: garW,
    y0: garage.y0,
    y1: garage.eave,
    gable: { peakY: garage_ridgeY, peakU: garage.ridgeX - garage.xL },
    windows: [],
    cladding: 'sidingAccent',
    extraOpenings: [{ u: garage.door.u, y: garage.y0, w: garage.door.w, h: garage.door.h }],
    extra: (p) => garageDoorUnit(p, { u: garage.door.u, y: garage.y0, w: garage.door.w, h: garage.door.h }),
    corners: [true, false],
  });

  elevation(P, {
    origin: [garage.xL, 0, garage.zB],
    normal: [-1, 0, 0],
    width: garD,
    y0: garage.y0,
    y1: garage.eave,
    windows: [{ u: 4.6, y: 1.5, w: 0.82, h: 1.0, grid: [2, 2] }],
  });

  elevation(P, {
    origin: [garage.xR, 0, garage.zB],
    normal: [0, 0, -1],
    width: garW,
    y0: garage.y0,
    y1: garage.eave,
    gable: { peakY: garage_ridgeY, peakU: garage.xR - garage.ridgeX },
    windows: [],
    cladding: 'sidingAccent',
    corners: [false, true],
  });

  /* -- main roof ---------------------------------------------------------- */

  const a = Math.atan(PITCH);
  const roofX = mainW + main.rake * 2;
  const mainEaveY = main.eave - main.overhang * PITCH;
  {
    const zEaveF = main.zF + main.overhang;
    const run = zEaveF - main.ridgeZ;
    const L = Math.hypot(run, run * PITCH);
    const perpY = Math.cos(a) * (ROOF_T / 2);
    const perpZ = Math.sin(a) * (ROOF_T / 2);
    const midY = (mainEaveY + main_ridgeY) / 2;

    P.add(
      'roof',
      box(roofX, ROOF_T, L, { at: [0, midY + perpY, (zEaveF + main.ridgeZ) / 2 + perpZ], rot: [a, 0, 0] }),
      box(roofX, ROOF_T, L, {
        at: [0, midY + perpY, (main.zB - main.overhang + main.ridgeZ) / 2 - perpZ],
        rot: [-a, 0, 0],
      }),
      box(roofX, 0.085, 0.34, { at: [0, main_ridgeY + 0.115, main.ridgeZ] }),
    );

    for (const sx of [-1, 1]) {
      const x = sx * (roofX / 2 + 0.028);
      P.add(
        'trim',
        box(0.055, 0.24, L, { at: [x, midY - 0.07, (zEaveF + main.ridgeZ) / 2], rot: [a, 0, 0] }),
        box(0.055, 0.24, L, { at: [x, midY - 0.07, (main.zB - main.overhang + main.ridgeZ) / 2], rot: [-a, 0, 0] }),
      );
    }

    // Front eave gutter stops where the bay breaks through; the rear runs full.
    const gutterY = mainEaveY - 0.02;
    local(P, elevationMatrix([main.xL, 0, main.zF], [0, 0, 1]), (p) => {
      gutterRun(p, -main.rake, bay.xL - main.xL - 0.5, gutterY, main.overhang);
      downspout(p, 0.26, gutterY - 0.14, 0.24, main.overhang - 0.36);
    });
    local(P, elevationMatrix([main.xR, 0, main.zB], [0, 0, -1]), (p) => {
      gutterRun(p, -main.rake, mainW + main.rake, gutterY, main.overhang);
      downspout(p, 0.26, gutterY - 0.14, 0.24, main.overhang - 0.36);
      downspout(p, mainW - 0.26, gutterY - 0.14, 0.24, main.overhang - 0.36);
    });
  }

  /* -- bay roof ----------------------------------------------------------- */

  const bayEaveY = bay.eave - bay.overhang * PITCH;
  {
    const zN = main.zF - 2.3; // buried in the main roof, forming the valley
    const zEdge = bay.zF + bay.rake;
    const depth = zEdge - zN;
    const zC = (zN + zEdge) / 2;
    const xLe = bay.xL - bay.overhang;
    const xRe = bay.xR + bay.overhang;
    const Ll = Math.hypot(bay.ridgeX - xLe, (bay.ridgeX - xLe) * PITCH);
    const Lr = Math.hypot(xRe - bay.ridgeX, (xRe - bay.ridgeX) * PITCH);
    const perpX = Math.sin(a) * (ROOF_T / 2);
    const perpY = Math.cos(a) * (ROOF_T / 2);

    P.add(
      'roof',
      box(Ll, ROOF_T, depth, {
        at: [(xLe + bay.ridgeX) / 2 - perpX, (bayEaveY + bay_ridgeY) / 2 + perpY, zC],
        rot: [0, 0, a],
      }),
      box(Lr, ROOF_T, depth, {
        at: [(xRe + bay.ridgeX) / 2 + perpX, (bayEaveY + bay_ridgeY) / 2 + perpY, zC],
        rot: [0, 0, -a],
      }),
      box(0.34, 0.085, depth, { at: [bay.ridgeX, bay_ridgeY + 0.115, zC] }),
    );

    // Rake boards on the street-facing gable.
    P.add(
      'trim',
      box(Ll, 0.24, 0.055, { at: [(xLe + bay.ridgeX) / 2, (bayEaveY + bay_ridgeY) / 2 - 0.07, zEdge + 0.028], rot: [0, 0, a] }),
      box(Lr, 0.24, 0.055, { at: [(xRe + bay.ridgeX) / 2, (bayEaveY + bay_ridgeY) / 2 - 0.07, zEdge + 0.028], rot: [0, 0, -a] }),
    );

    // Gutters on the bay's own eaves, with the downspout that the gutters
    // composition is framed on.
    local(P, elevationMatrix([bay.xR, 0, main.zF], [1, 0, 0]), (p) => {
      gutterRun(p, -0.5, bayD + bay.rake, bayEaveY - 0.02, bay.overhang);
      downspout(p, bayD + bay.rake - 0.24, bayEaveY - 0.16, 0.22, bay.overhang - 0.34);
    });
    local(P, elevationMatrix([bay.xL, 0, bay.zF], [-1, 0, 0]), (p) => {
      gutterRun(p, -bay.rake, bayD + 0.5, bayEaveY - 0.02, bay.overhang);
    });
  }

  /* -- garage roof -------------------------------------------------------- */

  const ga = Math.atan(GARAGE_PITCH);
  {
    const zN = garage.zB - garage.rake;
    const zF = garage.zF + garage.rake;
    const roofZ = zF - zN;
    const zC = (zN + zF) / 2;
    const xEave = garage.xL - garage.overhang;
    const yEaveL = garage.eave - garage.overhang * GARAGE_PITCH;
    const perpX = Math.sin(ga) * (ROOF_T / 2);
    const perpY = Math.cos(ga) * (ROOF_T / 2);

    const Lleft = Math.hypot(garage.ridgeX - xEave, (garage.ridgeX - xEave) * GARAGE_PITCH);
    const Lright = Math.hypot(garage.xR - garage.ridgeX, (garage.xR - garage.ridgeX) * GARAGE_PITCH);

    P.add(
      'roof',
      box(Lleft, ROOF_T, roofZ, {
        at: [(xEave + garage.ridgeX) / 2 - perpX, (yEaveL + garage_ridgeY) / 2 + perpY, zC],
        rot: [0, 0, ga],
      }),
      box(Lright, ROOF_T, roofZ, {
        at: [(garage.xR + garage.ridgeX) / 2 + perpX, (garage.eave + garage_ridgeY) / 2 + perpY, zC],
        rot: [0, 0, -ga],
      }),
      box(0.34, 0.085, roofZ, { at: [garage.ridgeX, garage_ridgeY + 0.115, zC] }),
    );

    for (const sz of [zN, zF]) {
      const z = sz + (sz === zN ? -0.028 : 0.028);
      P.add(
        'trim',
        box(Lleft, 0.24, 0.055, { at: [(xEave + garage.ridgeX) / 2, (yEaveL + garage_ridgeY) / 2 - 0.07, z], rot: [0, 0, ga] }),
        box(Lright, 0.24, 0.055, {
          at: [(garage.xR + garage.ridgeX) / 2, (garage.eave + garage_ridgeY) / 2 - 0.07, z],
          rot: [0, 0, -ga],
        }),
      );
    }

    local(P, elevationMatrix([garage.xL, 0, garage.zB], [-1, 0, 0]), (p) => {
      gutterRun(p, -garage.rake, garD + garage.rake, yEaveL - 0.02, garage.overhang);
      downspout(p, garD + garage.rake - 0.3, yEaveL - 0.16, 0.18, garage.overhang - 0.34);
    });
  }

  /* -- entry portico ------------------------------------------------------ */

  {
    const pa = Math.atan(PORCH_PITCH);
    const cx = porch.cx;
    const cap = 0.06;

    P.add('stone', boxFrom(cx - porch.xHalf, 0, main.zF, porch.xHalf * 2, main.y0 - cap, porch.zFront));
    P.add('flatwork', boxFrom(cx - porch.xHalf - 0.05, main.y0 - cap, main.zF, porch.xHalf * 2 + 0.1, cap, porch.zFront + 0.05));

    local(P, elevationMatrix([cx, 0, main.zF], [0, 0, 1]), (p) => {
      steps(p, { cx: 0, w: 2.5, top: main.y0, z0: porch.zFront, count: porch.steps, rise: main.y0 / porch.steps, tread: 0.3 });
      for (const sx of [-1, 1]) {
        p.add('stone', box(0.28, main.y0, 0.98, { at: [sx * 1.48, main.y0 / 2, porch.zFront + 0.45] }));
        p.add('flatwork', box(0.36, 0.055, 1.06, { at: [sx * 1.48, main.y0 + 0.028, porch.zFront + 0.45] }));
      }
      // Tapered columns on stone piers, as in the reference.
      for (const sx of [-1, 1]) {
        const x = sx * porch.colX;
        p.add('stone', box(0.34, 0.62, 0.34, { at: [x, main.y0 + 0.31, porch.colZ] }));
        p.add(
          'trim',
          box(0.36, 0.05, 0.36, { at: [x, main.y0 + 0.645, porch.colZ] }),
          box(porch.col, 1.72, porch.col, { at: [x, main.y0 + 1.53, porch.colZ] }),
          box(porch.col + 0.07, 0.1, porch.col + 0.07, { at: [x, main.y0 + 2.44, porch.colZ] }),
        );
      }
      p.add('trim', box(porch.half * 2 + 0.24, 0.28, 0.26, { at: [0, porch.eave - 0.14, porch.colZ] }));
      p.add('soffit', box(porch.half * 2, 0.035, porch.colZ + 0.12, { at: [0, porch.eave - 0.3, (porch.colZ + 0.12) / 2] }));
    });

    const xEdge = porch.half + porch.rake;
    const yEdge = porch.eave - porch.rake * PORCH_PITCH;
    const L = Math.hypot(xEdge, xEdge * PORCH_PITCH);
    const t = 0.09;
    const zBack = main.zF - 0.14;
    const zFront = porch.colZ + porch.overhangZ;
    const zD = zFront - zBack;
    const zC = (zBack + zFront) / 2;
    const px = Math.sin(pa) * (t / 2);
    const py = Math.cos(pa) * (t / 2);

    P.add(
      'roof',
      box(L, t, zD, { at: [cx - xEdge / 2 - px, (yEdge + porch_peakY) / 2 + py, zC], rot: [0, 0, pa] }),
      box(L, t, zD, { at: [cx + xEdge / 2 + px, (yEdge + porch_peakY) / 2 + py, zC], rot: [0, 0, -pa] }),
      box(0.3, 0.07, zD, { at: [cx, porch_peakY + 0.085, zC] }),
    );

    local(P, elevationMatrix([cx - porch.half, 0, porch.colZ + 0.14], [0, 0, 1]), (p) => {
      p.add(
        'sidingAccent',
        wallGeometry(
          { width: porch.half * 2, y0: porch.eave - 0.02, y1: porch.eave, gable: { peakY: porch_peakY, peakU: porch.half } },
          [],
        ),
      );
      for (const sx of [-1, 1]) {
        p.add('trim', box(L, 0.19, 0.055, { at: [porch.half + sx * (xEdge / 2), (yEdge + porch_peakY) / 2 - 0.05, 0.03], rot: [0, 0, -sx * pa] }));
      }
    });
  }

  /* -- deck --------------------------------------------------------------- */

  {
    const dW = deck.xR - deck.xL;
    const dD = deck.zN - deck.zF;
    const cx = (deck.xL + deck.xR) / 2;
    const cz = (deck.zN + deck.zF) / 2;

    P.add('deck', box(dW, 0.045, dD, { at: [cx, deck.y - 0.0225, cz] }));
    P.add(
      'railing',
      box(dW + 0.06, 0.24, 0.045, { at: [cx, deck.y - 0.17, deck.zF] }),
      box(0.045, 0.24, dD, { at: [deck.xR, deck.y - 0.17, cz] }),
      box(0.045, 0.24, dD, { at: [deck.xL, deck.y - 0.17, cz] }),
    );
    for (const px of [deck.xL + 0.25, cx, deck.xR - 0.25]) {
      for (const pz of [deck.zF + 0.3, cz, deck.zN - 0.4]) {
        P.add('railing', box(0.14, deck.y - 0.28, 0.14, { at: [px, (deck.y - 0.28) / 2, pz] }));
      }
    }

    /* Each rail starts at the corner its wall-local u axis runs away from:
       u is UP × normal, so it runs toward -x off a -z wall and toward -z off
       a +x wall. Starting from the other corner runs the whole rail out over
       the lawn, which is exactly what it was doing. The gap in the front rail
       is the stair opening, and it is measured from the same corner as the
       stair itself so the two can never drift apart. */
    const stairU = deck.xR - (deck.xR - deck.stairW / 2 - 0.15);
    local(P, elevationMatrix([deck.xR, 0, deck.zF], [0, 0, -1]), (p) => {
      railing(p, stairU + deck.stairW / 2 + 0.16, dW - 0.05, deck.y, -0.06, deck.railH);
    });
    local(P, elevationMatrix([deck.xR, 0, deck.zN], [1, 0, 0]), (p) => {
      railing(p, 0.05, dD - 0.05, deck.y, -0.06, deck.railH);
    });
    local(P, elevationMatrix([deck.xL, 0, deck.zF], [-1, 0, 0]), (p) => {
      railing(p, 0.05, dD - 0.05, deck.y, -0.06, deck.railH);
    });

    local(P, elevationMatrix([deck.xR - deck.stairW / 2 - 0.15, 0, deck.zF], [0, 0, -1]), (p) => {
      steps(p, { cx: 0, w: deck.stairW, top: deck.y, z0: 0, count: 3, rise: deck.y / 3, tread: 0.3 }, 'deck');
    });
    P.add('flatwork', boxFrom(deck.xR - deck.stairW - 0.7, 0, deck.zF - 1.5, deck.stairW + 0.8, 0.05, 1.4));

    // Patio furniture reads as lived-in without adding a single texture.
    P.add('bark', box(1.3, 0.05, 0.8, { at: [2.0, deck.y + 0.72, -10.6] }));
    for (const [fx, fz] of [
      [1.45, -10.25],
      [2.55, -10.25],
      [1.45, -10.95],
      [2.55, -10.95],
    ]) {
      P.add('bark', box(0.06, 0.72, 0.06, { at: [fx, deck.y + 0.36, fz] }));
    }

    // Condenser unit tucked against the wall — the kind of detail that stops a
    // render reading as a model.
    P.add(
      'hardware',
      box(0.82, 0.78, 0.82, { at: [main.xR + 0.62, 0.45, -6.1] }),
      box(0.88, 0.06, 0.88, { at: [main.xR + 0.62, 0.86, -6.1] }),
    );
    P.add('flatwork', boxFrom(main.xR + 0.12, 0, -6.65, 1.1, 0.06, 1.1));
  }

  /* -- site --------------------------------------------------------------- */

  P.add('lawn', box(site.lawn, 0.05, site.lawn, { at: [0, -0.03, -14] }));

  const driveZ = site.driveZEnd - garage.zF;
  P.add(
    'flatwork',
    boxFrom(site.driveXL, 0, garage.zF, site.driveXR - site.driveXL, 0.055, driveZ),
    boxFrom(porch.cx - site.walkW / 2, 0, porch.zFront + porch.steps * 0.3, site.walkW, 0.05, site.walkZEnd - porch.zFront - porch.steps * 0.3),
    boxFrom(site.driveXR - 0.25, 0, site.walkZEnd - site.walkW, Math.abs(site.driveXR) + porch.cx + site.walkW / 2 + 0.25, 0.05, site.walkW),
  );

  P.add(
    'mulch',
    boxFrom(main.xL - 0.12, 0, main.zF, 3.1, 0.07, site.bedDepth),
    boxFrom(bay.xL - 1.0, 0, bay.zF, bayW + 1.4, 0.07, site.bedDepth),
    boxFrom(main.xR, 0, main.zB, site.bedDepth, 0.07, 4.6),
    boxFrom(garage.xL - 0.12, 0, garage.zF, 1.6, 0.07, site.bedDepth * 0.9),
  );

  const shrubs: [number, number, number, number][] = [
    [-4.6, 0.7, 0.62, 3],
    [-3.55, 0.6, 0.5, 9],
    [-2.7, 0.66, 0.44, 17],
    [1.0, 1.7, 0.56, 23],
    [2.2, 1.78, 0.46, 31],
    [3.4, 1.74, 0.52, 41],
    [4.6, 1.78, 0.46, 47],
    [5.75, 1.6, 0.6, 53],
    [-10.7, -0.05, 0.5, 61],
    [-10.05, -0.05, 0.42, 67],
    [5.85, -1.8, 0.58, 71],
    [5.85, -3.3, 0.5, 79],
    [5.85, -4.7, 0.56, 83],
  ];
  for (const [x, z, r, seed] of shrubs) shrub(P, x, z, r, seed);

  // Kept off the right-front quadrant on purpose: every service camera except
  // the deck looks through it, and a canopy in that cone hides the elevation
  // the shot exists to show.
  tree(P, -15.4, 7.6, 1.3, 101);
  tree(P, 12.4, 15.8, 1.0, 211);
  tree(P, 16.2, -13.4, 1.4, 307);
  tree(P, -14.2, -10.6, 1.2, 409);

  /* A treeline behind the property. Without it the lawn meets the sky along a
     ruled line at the far edge of the plane and the whole site reads as a
     model on a table. These sit a hundred metres out and well inside the fog
     range, so they read as a hazed band at the property line rather than as
     trees on the site: close enough to catch, too far to look at. */
  {
    const rnd = mulberry32(9173);
    for (let i = 0; i < 34; i++) {
      // An arc behind and to the sides; the front-right quadrant stays open,
      // because that is where every composition places the sky.
      const a = 1.85 + (i / 33) * 4.0 + (rnd() - 0.5) * 0.08;
      const d = 118 + rnd() * 34;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      // Small enough that the fog reads as haze on a band of trees rather than
      // as pale cloud shapes standing above the roofline.
      const r = 2.8 + rnd() * 1.7;
      const trunk = 2.2 + rnd() * 1.3;
      P.add('bark', blankUv(cyl(0.26, 0.4, trunk * 2, 5, { at: [x, trunk, z] })));
      for (let l = 0; l < 3; l++) {
        // Cards here too, at a third the density. Nothing at this distance is
        // read as a leaf, but a horizon of closed convex lumps is exactly as
        // wrong as a garden of them.
        leafCluster(
          P,
          'foliage',
          [
            x + (rnd() - 0.5) * r * 0.9,
            trunk * 1.35 + r * 0.55 + (rnd() - 0.5) * r * 0.4,
            z + (rnd() - 0.5) * r * 0.9,
          ],
          r * (0.68 + rnd() * 0.4),
          5,
          900 + i * 7 + l,
          0.86,
        );
      }
    }
  }

  /* -- finish ------------------------------------------------------------- */

  const geometries = P.merged();
  let triangles = 0;
  const bounds = new THREE.Box3();
  for (const g of geometries.values()) {
    triangles += (g.attributes.position as THREE.BufferAttribute).count / 3;
    g.computeBoundingBox();
    if (g.boundingBox) bounds.union(g.boundingBox);
  }

  return { geometries, triangles: Math.round(triangles), bounds };
}

function gableVent(p: Parts, u: number, y: number): void {
  p.add('trim', box(0.82, 0.66, 0.06, { at: [u, y, 0.03] }));
  p.add('shutter', box(0.64, 0.48, 0.05, { at: [u, y, 0.06] }));
  for (let i = 0; i < 5; i++) {
    p.add('shutter', box(0.6, 0.03, 0.035, { at: [u, y - 0.19 + i * 0.095, 0.08], rot: [0.5, 0, 0] }));
  }
}
