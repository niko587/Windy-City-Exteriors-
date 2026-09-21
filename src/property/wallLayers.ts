/**
 * What a wall is made of, described once.
 *
 * The copy, the order and the travel distances live here rather than in the
 * geometry builder so the inspection panel can render the whole assembly
 * without pulling Three.js into the page shell — the same reason the hotspot
 * projection is a plain array. The renderer reads the same list, so the
 * numbered layer in the panel and the numbered layer on the stage can never
 * disagree.
 */

export type LayerKey = 'framing' | 'insulation' | 'sheathing' | 'barrier' | 'cladding';

export interface LayerInfo {
  key: LayerKey;
  /** Numbered from the inside out, the order a wall is actually built in. */
  index: number;
  name: string;
  /** One line under the name in the panel. */
  trade: string;
  /** What it does, in a sentence a homeowner would use. */
  blurb: string;
  /** Metres this layer travels outward when the assembly separates. */
  travel: number;
}

export const WALL_LAYERS: LayerInfo[] = [
  {
    key: 'framing',
    index: 1,
    name: 'Framing',
    trade: 'Structure',
    blurb:
      'Studs at sixteen inches on centre, with a header carrying the load around the window. Everything else is fastened to this, and it is the only layer nobody ever sees again.',
    travel: 0,
  },
  {
    key: 'insulation',
    index: 2,
    name: 'Insulation',
    trade: 'Comfort',
    blurb:
      'Batts filling every cavity, cut around the opening rather than stuffed past it. Gaps here are what you feel as a cold wall in February.',
    travel: 0.42,
  },
  {
    key: 'sheathing',
    index: 3,
    name: 'Sheathing',
    trade: 'Bracing',
    blurb:
      'Structural panels that tie the studs together and stop the wall racking in a Chicago crosswind. Seams are staggered and fastened on a schedule.',
    travel: 0.86,
  },
  {
    key: 'barrier',
    index: 4,
    name: 'Weather barrier',
    trade: 'Water',
    blurb:
      'The drainage plane. Lapped like shingles so anything that gets past the siding runs down and out, then taped at the seams and around the opening.',
    travel: 1.32,
  },
  {
    key: 'cladding',
    index: 5,
    name: 'Siding and trim',
    trade: 'What you see',
    blurb:
      'The finish, hung over the barrier with a deliberate gap behind it. Trim wraps the opening last, which is why siding and window work get specified together.',
    travel: 1.86,
  },
];

export const wallLayerOrder: LayerKey[] = WALL_LAYERS.map((l) => l.key);

/** Screen position of each layer's label, written by the renderer each frame. */
export interface WallProjected {
  x: number;
  y: number;
  /** Pixel length of the leader line from the flag down to its layer. */
  stem: number;
  /** 0 when the layer is behind the camera or off the frame. */
  visible: number;
}

export const wallProjected: WallProjected[] = WALL_LAYERS.map(() => ({
  x: 0,
  y: 0,
  stem: 0,
  visible: 0,
}));

/**
 * How present the assembly stage is, 0–1, written by the renderer each frame.
 * The house, its light rig, the backdrop and the DOM veil all read this one
 * value, so the handover between the property and the stage is a single
 * crossfade rather than four animations trying to agree.
 */
export const stagePresence = { value: 0 };
