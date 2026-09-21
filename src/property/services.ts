/**
 * Camera compositions, one per experience state.
 *
 * A composition is spherical: a look-at target plus azimuth, polar angle,
 * distance and field of view. Storing it this way rather than as an eye
 * position is what makes the travel between two services read as a camera move
 * around a building rather than a jump between coordinates — the rig
 * interpolates the orbit, so the house stays the centre of attention the whole
 * way and the viewer can follow where they went.
 *
 * Azimuth 0 looks at the front elevation from due south (+Z). Polar is
 * measured from straight up, so values under π/2 look down at the property and
 * values over π/2 look up into the eaves.
 */

import type { FocusId } from '../content';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type ServiceFocus = Extract<FocusId, 'siding' | 'windows' | 'doors' | 'decks' | 'gutters'>;

export const serviceFocusOrder: ServiceFocus[] = ['siding', 'windows', 'doors', 'decks', 'gutters'];

export interface Composition {
  target: [number, number, number];
  azimuth: number;
  polar: number;
  distance: number;
  fov: number;
  /** Seconds of travel from an arbitrary previous composition. */
  travel?: number;
}

/** Lifted slightly and pulled back so a small screen still reads the whole house. */
function forMobile(c: Composition): Composition {
  return {
    ...c,
    distance: c.distance * 1.3,
    fov: Math.min(c.fov + 4, 52),
    polar: lerp(c.polar, 1.5, 0.28),
  };
}

const compositions = {
  /** Deep establishing shot the opening sequence flies in from. */
  approach: { target: [-1.6, 3.2, -2.4], azimuth: 0.64, polar: 1.372, distance: 56, fov: 20, travel: 0 },

  overview: { target: [-1.9, 2.9, -2.3], azimuth: 0.5, polar: 1.425, distance: 30, fov: 30, travel: 2.6 },

  explore: { target: [-1.4, 2.5, -2.2], azimuth: 0.6, polar: 1.462, distance: 24, fov: 34, travel: 1.5 },

  /** The front-right corner: bay end wall into the long right elevation, the
   *  biggest uninterrupted run of cladding on the property. */
  siding: { target: [3.7, 2.8, -0.3], azimuth: 0.88, polar: 1.497, distance: 17.5, fov: 30, travel: 1.9 },

  /** Close enough on the bay's upper pair to read casing, drip cap and sill. */
  windows: { target: [3.4, 4.45, 1.2], azimuth: 0.33, polar: 1.472, distance: 10.8, fov: 33, travel: 1.7 },

  /** Straight up the walk at the portico. */
  doors: { target: [-1.2, 1.82, 1.5], azimuth: 0.22, polar: 1.504, distance: 9.8, fov: 35, travel: 1.7 },

  /** Around the right elevation to the rear deck, from above the railing
   *  rather than through it: at deck-rail height the near rail crosses the
   *  frame and hides the thing the shot is about. */
  decks: { target: [2.9, 0.95, -10.4], azimuth: 2.44, polar: 1.222, distance: 15.4, fov: 30, travel: 2.4 },

  /** Level with the bay corner where the gutter, the return and the downspout
   *  all meet. Shot square rather than craned up from the lawn: a steep look
   *  upward throws every vertical into convergence and the house leans. */
  gutters: { target: [5.0, 4.85, 0.55], azimuth: 1.06, polar: 1.6, distance: 8.6, fov: 31, travel: 1.8 },

  /** The assembly stage: a three-quarter view down the layers, far enough back
   *  that the whole separated stack sits inside the frame, low enough to read
   *  the thickness of each one. */
  wall: { target: [0, 1.5, 0.35], azimuth: 0.95, polar: 1.412, distance: 9.4, fov: 30, travel: 1.2 },
} satisfies Record<string, Composition>;

export type CompositionKey = keyof typeof compositions;

export function composition(key: CompositionKey, mobile: boolean): Composition {
  const c = compositions[key];
  return mobile ? forMobile(c) : c;
}

/**
 * Orbit limits. Explore is generous; the siding comparison is deliberately
 * tight so the before and after can never be judged from a misleading angle.
 */
export interface OrbitLimits {
  minPolar: number;
  maxPolar: number;
  minAzimuth: number;
  maxAzimuth: number;
  minDistance: number;
  maxDistance: number;
}

export const limits: Record<'free' | 'guided' | 'locked' | 'stage', OrbitLimits> = {
  free: {
    minPolar: 0.62,
    maxPolar: 1.545,
    minAzimuth: -Math.PI,
    maxAzimuth: Math.PI,
    minDistance: 8,
    maxDistance: 46,
  },
  guided: {
    minPolar: 0.9,
    maxPolar: 1.76,
    minAzimuth: -Math.PI,
    maxAzimuth: Math.PI,
    minDistance: 6.5,
    maxDistance: 40,
  },
  /** Transformation mode: a narrow sweep that keeps the compared wall framed. */
  locked: {
    minPolar: 1.4,
    maxPolar: 1.56,
    minAzimuth: 0.58,
    maxAzimuth: 1.18,
    minDistance: 14,
    maxDistance: 22,
  },
  /** The wall assembly: orbit the section freely, but never from behind the
   *  framing, where the layers would read back to front. */
  stage: {
    minPolar: 1.02,
    maxPolar: 1.6,
    minAzimuth: 0.14,
    maxAzimuth: 1.4,
    minDistance: 5.4,
    maxDistance: 16,
  },
};

/** Screen-anchored hotspot definitions, in world space. */
export interface Hotspot {
  id: ServiceFocus;
  label: string;
  note: string;
  at: [number, number, number];
  /** Hidden when the camera is behind this plane, so labels never float over the far side. */
  facing: [number, number, number];
}

export const hotspots: Hotspot[] = [
  {
    id: 'siding',
    label: 'Siding',
    note: 'Lap, corners and trim',
    at: [5.28, 2.7, -1.5],
    facing: [1, 0.12, 0.2],
  },
  {
    id: 'windows',
    label: 'Windows',
    note: 'Upper-floor replacements',
    at: [2.6, 4.52, 1.22],
    facing: [0.05, 0.15, 1],
  },
  {
    id: 'doors',
    label: 'Front entry',
    note: 'Door, sidelights, portico',
    at: [-0.25, 1.5, 2.0],
    facing: [0.22, 0.1, 0.97],
  },
  {
    id: 'gutters',
    label: 'Gutters',
    note: 'Eave, corner, downspout',
    at: [5.74, 5.42, 1.2],
    facing: [0.8, 0.25, 0.54],
  },
  {
    id: 'decks',
    label: 'Deck',
    note: 'Framing, rails and stairs',
    at: [5.3, 1.45, -10.2],
    facing: [0.85, 0.15, -0.5],
  },
];

/** Contextual copy shown in the property panel, distinct from the page-level service content. */
export const focusNotes: Record<ServiceFocus, { title: string; kicker: string; body: string; points: string[] }> = {
  siding: {
    title: 'Siding',
    kicker: 'Whole-elevation replacement',
    body: 'The front-right corner is the elevation that sets the tone from the street. Drag the handle to compare the tired original cladding against a completed replacement — same wall, same light, same camera, same time of day.',
    points: ['Lap siding and corner posts', 'Window and door trim wrapped', 'Weather barrier checked while open'],
  },
  windows: {
    title: 'Windows',
    kicker: 'Replacement and trim',
    body: 'Framed close on the gable bay so the casing, drip cap, sill and shutter read the way they would from your own driveway. Every opening on a house this age is measured individually.',
    points: ['Measured opening by opening', 'Insulated and sealed perimeter', 'Exterior casing and sill finished'],
  },
  doors: {
    title: 'Doors',
    kicker: 'Entry composition',
    body: 'The approach up the walk to the portico. Entry door, sidelights, threshold and surround are one piece of work, which is why the door and its trim get specified together.',
    points: ['Entry doors with sidelights', 'Patio and service doors', 'Threshold, jamb and trim repair'],
  },
  decks: {
    title: 'Decks',
    kicker: 'Rear structure',
    body: 'The camera travels around the right elevation to the rear, where the deck framing, rim, posts, railing and stairs are visible together. The part you do not see gets the most attention.',
    points: ['New builds and full rebuilds', 'Board, stair and railing replacement', 'Structural framing and ledger repair'],
  },
  gutters: {
    title: 'Gutters',
    kicker: 'Eaves and drainage',
    body: 'Reframed upward at the bay corner, where the gutter run, the eave return and the downspout all meet. Pitch and outlet placement are what decide where water actually ends up.',
    points: ['New gutters and downspouts', 'Re-pitching, re-hanging, leak repair', 'Fascia and soffit behind the gutter line'],
  },
};
