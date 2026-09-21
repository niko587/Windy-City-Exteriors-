/**
 * Every dimension of the property, in metres, in one place.
 *
 * Massing follows `docs/references/approved-direction.png`: a two-storey main
 * block under a side gable, a projecting two-storey front-gable bay that
 * breaks the eave line, a recessed two-car garage wing, a gabled entry portico
 * on a stone base, and a rear deck. Numbers are buildable rather than
 * convenient — 2.78 m first-floor plate, 6" lap exposure, 4.9 m garage
 * opening, 0.45 m eave overhang, 8:12 roof.
 *
 * The camera system and the hotspots read from here too, so the framing can
 * never drift away from the geometry.
 */

export const PITCH = 8 / 12;
export const GARAGE_PITCH = 8 / 12;
export const PORCH_PITCH = 5 / 12;

export const grade = 0;

/** Main two-storey block. */
export const main = {
  xL: -5.2,
  xR: 5.2,
  zF: 0,
  zB: -8,
  /** Top of the exposed stone base = bottom of the cladding. */
  y0: 0.42,
  /** First-floor plate. */
  yMid: 3.2,
  /** Eave height at the wall line. */
  eave: 5.7,
  ridgeZ: -4,
  overhang: 0.45,
  rake: 0.32,
} as const;

export const main_ridgeY = main.eave + Math.abs(main.ridgeZ - main.zF) * PITCH; // 8.367

/** Projecting front-gable bay: the piece that stops the front reading as a box. */
export const bay = {
  xL: 1.6,
  xR: 5.2,
  zF: 1.1,
  ridgeX: 3.4,
  eave: main.eave,
  overhang: 0.45,
  rake: 0.32,
} as const;

export const bay_ridgeY = bay.eave + (bay.ridgeX - bay.xL) * PITCH; // 6.90

/** Recessed front-gable garage wing on the left. */
export const garage = {
  xL: -11.2,
  xR: main.xL,
  zF: -0.7,
  zB: -6.9,
  y0: 0.16,
  eave: 3.3,
  ridgeX: -8.2,
  overhang: 0.4,
  rake: 0.4,
  door: { u: 3.0, w: 4.9, h: 2.18 },
} as const;

export const garage_ridgeY = garage.eave + (garage.ridgeX - garage.xL) * GARAGE_PITCH; // 5.30

/** Gabled entry portico, offset left of centre so the bay can hold the right. */
export const porch = {
  cx: -1.2,
  xHalf: 1.75,
  zFront: 2.05,
  half: 1.75,
  eave: 3.0,
  rake: 0.22,
  overhangZ: 0.42,
  colX: 1.45,
  colZ: 1.84,
  col: 0.2,
  steps: 3,
} as const;

export const porch_peakY = porch.eave + porch.half * PORCH_PITCH; // 3.729

/** Rear deck. */
export const deck = {
  xL: 0.8,
  xR: 5.2,
  zN: main.zB,
  zF: -12.4,
  y: 0.38,
  railH: 0.95,
  stairW: 1.4,
} as const;

/** Driveway, walk and beds. */
export const site = {
  driveXL: -10.95,
  driveXR: -5.45,
  driveZEnd: 15.5,
  walkW: 1.4,
  walkZEnd: 5.6,
  bedDepth: 1.35,
  lawn: 150,
} as const;

/** Gutter profile. */
export const gutterSpec = {
  w: 0.125,
  h: 0.105,
  fascia: 0.2,
  spoutW: 0.078,
  spoutD: 0.098,
} as const;

export interface WindowSpec {
  u: number;
  y: number;
  w: number;
  h: number;
  /** Muntin grid: [columns, rows]. 1×1 means a clear single lite. */
  grid?: [number, number];
  /** Vertical mullions splitting the opening into equal units. */
  units?: number;
  shutters?: boolean;
}

const FLOOR1 = { y: 1.34, h: 1.48 };
const FLOOR1_NARROW = { y: 1.44, h: 1.38 };
const FLOOR2 = { y: 3.82, h: 1.34 };

/** Main front elevation, u from the left corner (x = main.xL). Right of the
 *  entry the bay takes over, so nothing is placed there. */
export const frontWindows: WindowSpec[] = [
  { u: 1.4, ...FLOOR1, w: 1.9, units: 3, grid: [1, 1] },
  { u: 1.3, ...FLOOR2, w: 0.92, grid: [2, 3], shutters: true },
  { u: 3.75, ...FLOOR2, w: 0.92, grid: [2, 3], shutters: true },
];

/** Bay front elevation, u from x = bay.xL. */
export const bayWindows: WindowSpec[] = [
  { u: 1.8, ...FLOOR1, w: 2.3, units: 3, grid: [1, 1] },
  { u: 1.0, ...FLOOR2, w: 0.92, grid: [2, 3], shutters: true },
  { u: 2.6, ...FLOOR2, w: 0.92, grid: [2, 3], shutters: true },
  { u: 1.8, y: 6.0, w: 0.82, h: 0.6, grid: [2, 2] },
];

/** Entry opening: door plus two sidelights, cut to the porch floor. */
export const entry = {
  /** x = -1.2, expressed as a distance along the front wall from its left corner. */
  u: 4.0,
  w: 1.86,
  h: 2.13,
  doorW: 1.02,
  sideW: 0.3,
} as const;

/** Right elevation (x = main.xR), u measured from the front corner. */
export const rightWindows: WindowSpec[] = [
  { u: 2.3, ...FLOOR1_NARROW, w: 0.92, grid: [2, 3] },
  { u: 5.4, ...FLOOR1_NARROW, w: 0.92, grid: [2, 3] },
  { u: 2.3, ...FLOOR2, w: 0.92, grid: [2, 3] },
  { u: 5.4, ...FLOOR2, w: 0.92, grid: [2, 3] },
];

/** Left elevation, u from the rear corner. Only the upper floor clears the garage. */
export const leftWindows: WindowSpec[] = [
  { u: 2.3, ...FLOOR2, w: 0.92, grid: [2, 3] },
  { u: 5.5, ...FLOOR2, w: 0.92, grid: [2, 3] },
];

/** Rear elevation, u from x = main.xR toward main.xL. */
export const rearWindows: WindowSpec[] = [
  { u: 6.2, ...FLOOR1, w: 1.6, units: 2, grid: [1, 1] },
  { u: 8.8, ...FLOOR1_NARROW, w: 0.92, grid: [2, 3] },
  { u: 1.8, ...FLOOR2, w: 0.92, grid: [2, 3] },
  { u: 4.2, ...FLOOR2, w: 0.92, grid: [2, 3] },
  { u: 6.6, ...FLOOR2, w: 0.92, grid: [2, 3] },
  { u: 9.0, ...FLOOR2, w: 0.92, grid: [2, 3] },
];

/** Sliding patio door onto the deck. */
export const patioDoor = { u: 2.6, w: 1.9, h: 2.13 } as const;
