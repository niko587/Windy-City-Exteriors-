/**
 * Procedural CanvasTextures for the property.
 *
 * Everything the house is made of is generated here at runtime: no image
 * downloads, no licensing questions, and the real-world texel scale stays
 * consistent because every wall UV is already measured in metres (see
 * `lib/geo.ts`). Each generator is memoised — materials share one GPU upload.
 */

import * as THREE from 'three';
import { mulberry32, tileFbm2, tileNoise2 } from '../lib/noise';

type Rgb = [number, number, number];

const cache = new Map<string, THREE.Texture>();

function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = make();
  tex.name = key;
  cache.set(key, tex);
  return tex;
}

export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
  shakeRows.clear();
}

interface Surface {
  data: Uint8ClampedArray;
  size: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  image: ImageData | null;
}

/**
 * A canvas and the buffer that backs it. Generators write straight into the
 * ImageData the canvas will receive, which saves a full copy of every map —
 * worth having when all of this runs on the main thread before frame one.
 */
function surface(size: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx ? ctx.createImageData(size, size) : null;
  return { data: image ? image.data : new Uint8ClampedArray(size * size * 4), size, canvas, ctx, image };
}

function toTexture(s: Surface, colorSpace: THREE.ColorSpace, repeat = 1): THREE.CanvasTexture {
  if (s.ctx && s.image) s.ctx.putImageData(s.image, 0, 0);
  const tex = new THREE.CanvasTexture(s.canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  return tex;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** GLSL's smoothstep, on the CPU side: used to turn noise into discrete features. */
function smooth(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Write a tangent-space normal (OpenGL convention, +Y up) into the buffer. */
function writeNormal(data: Uint8ClampedArray, i: number, x: number, y: number, z: number): void {
  const len = Math.hypot(x, y, z) || 1;
  data[i] = (x / len) * 127.5 + 127.5;
  data[i + 1] = (y / len) * 127.5 + 127.5;
  data[i + 2] = (z / len) * 127.5 + 127.5;
  data[i + 3] = 255;
}

function writeGrey(data: Uint8ClampedArray, i: number, v: number): void {
  const b = clamp01(v) * 255;
  data[i] = data[i + 1] = data[i + 2] = b;
  data[i + 3] = 255;
}

function writeRgb(data: Uint8ClampedArray, i: number, c: Rgb, mul = 1): void {
  data[i] = c[0] * mul;
  data[i + 1] = c[1] * mul;
  data[i + 2] = c[2] * mul;
  data[i + 3] = 255;
}

/* -------------------------------------------------------------------------
   Cladding profiles.

   Four real exterior profiles, each generated as a 1 m × 1 m tile so the
   course spacing on the wall is the spacing a crew would actually install.
   The albedo is near-neutral — `material.color` supplies the finish — which
   is what lets one tile serve siding, soffit and trim, and lets the studio
   change finish without regenerating anything.
   ------------------------------------------------------------------------- */

export type SidingProfile = 'lap' | 'dutch' | 'shake' | 'board';

const COURSES = 6;

/**
 * Surface across one horizontal course. `t` runs 0 (butt edge, bottom) to 1
 * (top, tucked under the course above). `slope` drives the normal map;
 * `shade` is contact shading baked into the albedo, which is what makes the
 * courses read at the distance the overview camera sits at.
 */
function lapProfile(t: number): { slope: number; shade: number } {
  // The line under a butt edge is nearly black on a real wall: the board
  // above it stands 20 mm proud and the sky cannot reach underneath. The old
  // 0.58 was a pencil line, and a pencil line is what made the elevation
  // read as a drawing rather than as boards.
  if (t < 0.028) return { slope: -1.35, shade: 0.15 };
  if (t < 0.105) {
    const k = (t - 0.028) / 0.077;
    return { slope: 0.62 - 0.5 * k, shade: 0.26 + 0.64 * k * k };
  }
  const k = (t - 0.105) / 0.895;
  return { slope: -0.1 - 0.16 * k, shade: 0.92 + 0.08 * k };
}

/** Dutch lap: the same butt edge with a cove milled along the top third. */
function dutchProfile(t: number): { slope: number; shade: number } {
  if (t < 0.032) return { slope: -1.4, shade: 0.13 };
  if (t < 0.105) {
    const k = (t - 0.032) / 0.073;
    return { slope: 0.66 - 0.5 * k, shade: 0.24 + 0.66 * k * k };
  }
  if (t > 0.66) {
    // The cove: a shallow concave sweep that catches its own shadow.
    const k = (t - 0.66) / 0.34;
    return { slope: 0.34 - 1.5 * k, shade: 0.99 - 0.28 * k * k };
  }
  const k = (t - 0.105) / 0.555;
  return { slope: -0.06 - 0.06 * k, shade: 0.91 + 0.08 * k };
}

/**
 * The stagger of one course of shakes. Built once per row and cached: the
 * pixel loops below ask for it a quarter of a million times per map, and
 * rebuilding a width table inside that loop was most of what switching the
 * studio to the shake profile cost.
 */
const shakeRows = new Map<number, { widths: number[]; offset: number }>();

function shakeRow(row: number): { widths: number[]; offset: number } {
  const hit = shakeRows.get(row);
  if (hit) return hit;
  const rnd = mulberry32(row * 6151 + 29);
  const n = 4 + (row % 3);
  const raw: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.7 + rnd() * 0.7;
    raw.push(w);
    total += w;
  }
  const built = { widths: raw.map((w) => w / total), offset: rnd() * 0.6 };
  shakeRows.set(row, built);
  return built;
}

/** Which shake a texel falls in, for the staggered courses. */
function shakeCell(u: number, v: number, rows: number): { row: number; t: number; su: number; width: number; key: number } {
  const row = Math.floor(v * rows);
  const t = v * rows - row;
  const { widths, offset } = shakeRow(row);
  const uu = (u + offset) % 1;
  let acc = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    if (uu < acc + w) return { row, t, su: (uu - acc) / w, width: w, key: row * 31 + i };
    acc += w;
  }
  return { row, t, su: 0.5, width: 1 / widths.length, key: row * 31 };
}

export function sidingMaps(profile: SidingProfile = 'lap'): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
} {
  const map = memo(`siding-${profile}-albedo`, () => {
    // The one map that stays at 512. Every other camera on the property would
    // be happy at half this — a metre of wall is about 140 pixels even at the
    // gutter corner — but the wall-assembly stage puts a single course of
    // cladding across the frame, and that is the one place where the board
    // face is read rather than glanced at.
    const s = surface(512);
    const rnd = mulberry32(1337);
    // One value across a whole elevation is the tell. Cladding is run in
    // batches, weathers by exposure and is never one colour board to board,
    // so the spread here is three times what it was.
    const boardTone: number[] = Array.from({ length: 48 }, () => 0.9 + rnd() * 0.15);
    const shakeTone: number[] = Array.from({ length: 64 }, () => 0.9 + rnd() * 0.14);

    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const course = Math.floor(v * COURSES);
      const t = v * COURSES - course;
      const horizontal = profile === 'lap' ? lapProfile(t) : profile === 'dutch' ? dutchProfile(t) : null;

      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        // Long, low-frequency grain along the board plus a fine vertical fibre.
        const grain = tileFbm2(u * 7, v * 96, 7, 96, 3, 11) - 0.5;
        const fibre = tileNoise2(u * 220, v * 26, 220, 26, 29) - 0.5;
        let value: number;

        if (horizontal) {
          // Keyed to the butt-joint run the texel is actually in, so the
          // tone changes where the boards change rather than on its own grid.
          const seam = boardTone[Math.abs(Math.floor(u * 2.4 + course * 0.37) * 7 + course * 5) % boardTone.length];
          value = horizontal.shade * seam + grain * 0.045 + fibre * 0.02;
          // Butt joints every ~2.4 m read as a hairline, not a gap.
          const joint = Math.abs(((u * 2.4 + course * 0.37) % 1) - 0.5);
          if (joint > 0.4965) value *= 0.9;
        } else if (profile === 'shake') {
          const c = shakeCell(u, v, 5);
          const tone = shakeTone[c.key % shakeTone.length];
          const split = tileFbm2(u * 160, v * 14, 160, 14, 3, 53) - 0.5;
          value = 0.94 * tone + split * 0.1 + grain * 0.04;
          if (c.t < 0.08) value *= 0.56 + c.t * 3.4; // shadow under the course
          const edge = Math.min(c.su, 1 - c.su) * c.width;
          if (edge < 0.004) value *= 0.66; // the gap between shakes
        } else {
          // Board and batten: 300 mm boards, 45 mm battens standing proud.
          const boards = 3.33;
          const bu = (u * boards) % 1;
          const batten = bu < 0.15;
          const tone = boardTone[(Math.floor(u * boards) * 2) % boardTone.length];
          value = (batten ? 1.0 : 0.95) * tone + grain * 0.05 + fibre * 0.015;
          if (!batten && bu < 0.2) value *= 0.72 + (bu - 0.15) * 5.2; // batten shadow
          if (batten && bu > 0.13) value *= 0.86;
        }

        writeRgb(s.data, (y * s.size + x) * 4, [
          clamp01(value) * 255,
          clamp01(value) * 254,
          clamp01(value) * 251,
        ]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo(`siding-${profile}-normal`, () => {
    // Relief tolerates less resolution than colour, and the normal scale is
    // driven down toward 1 anyway.
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const course = Math.floor(v * COURSES);
      const t = v * COURSES - course;
      const horizontal = profile === 'lap' ? lapProfile(t) : profile === 'dutch' ? dutchProfile(t) : null;

      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const gx = (tileNoise2(u * 180, v * 30, 180, 30, 5) - 0.5) * 0.12;
        const gy = (tileFbm2(u * 9, v * 110, 9, 110, 2, 7) - 0.5) * 0.16;
        let nx = gx;
        let ny = gy;

        if (horizontal) {
          ny += horizontal.slope;
        } else if (profile === 'shake') {
          const c = shakeCell(u, v, 5);
          ny += c.t < 0.06 ? -1.25 : -0.05;
          const edge = Math.min(c.su, 1 - c.su) * c.width;
          if (edge < 0.005) nx += c.su < 0.5 ? -1.1 : 1.1;
          ny += (tileFbm2(u * 120, v * 18, 120, 18, 2, 67) - 0.5) * 0.4;
        } else {
          const boards = 3.33;
          const bu = (u * boards) % 1;
          if (bu > 0.125 && bu < 0.155) nx -= 1.5; // batten's right shoulder
          else if (bu > 0.965 || bu < 0.02) nx += 1.5; // and its left
        }

        writeNormal(s.data, (y * s.size + x) * 4, nx, ny, 1.9);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Weathering mask — drives the BEFORE state of the siding comparison.
   Vertical wash streaks under the lap lines plus broad patchy fade.
   ------------------------------------------------------------------------- */

export function wearMap(): THREE.Texture {
  return memo('wear', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const patch = tileFbm2(u * 3, v * 3, 3, 3, 4, 3);
        // Streaks are stretched hard in v so they read as rain-wash.
        const streak = tileFbm2(u * 34, v * 2.5, 34, 3, 3, 61);
        const dirt = clamp01(patch * 0.6 + Math.pow(clamp01(streak * 1.25 - 0.18), 1.7) * 0.62);
        writeGrey(s.data, (y * s.size + x) * 4, dirt);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });
}

/* -------------------------------------------------------------------------
   Architectural shingles.

   A roof is the largest single surface in every composition, so a roof that
   repeats is the fastest way to lose the whole model. Five courses of tabs
   in a 1 m tile, but the offsets are drawn per course rather than alternating
   0 and a half, the tab widths vary, the tone is drawn per tab out of a wide
   blend, and a handful of tabs are lifted — their butt caught by the sky with
   a hard shadow under them. That last one is what a real weathered roof has
   and a rendered one never does.
   ------------------------------------------------------------------------- */

export function shingleMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const rows = 5;

  interface Course {
    /** Cumulative tab starts across the course, and the offset it is laid at. */
    cuts: number[];
    offset: number;
    /** Tabs lifted at the butt; keyed by tab index. */
    lifted: Set<number>;
  }

  /** Laid once per course rather than per texel. */
  const courses: Course[] = Array.from({ length: rows }, (_, row) => {
    const rnd = mulberry32(row * 4813 + 91);
    const n = 3 + (row % 2);
    const widths = Array.from({ length: n }, () => 0.78 + rnd() * 0.44);
    const total = widths.reduce((a, b) => a + b, 0);
    const cuts: number[] = [];
    let acc = 0;
    for (const w of widths) {
      cuts.push(acc);
      acc += w / total;
    }
    const lifted = new Set<number>();
    for (let i = 0; i < n; i++) if (rnd() > 0.78) lifted.add(i);
    return { cuts, offset: rnd(), lifted };
  });

  function tabAt(u: number, row: number): { tab: number; tu: number; width: number; lifted: boolean } {
    const c = courses[row];
    const uu = (((u + c.offset) % 1) + 1) % 1;
    for (let i = c.cuts.length - 1; i >= 0; i--) {
      if (uu >= c.cuts[i]) {
        const next = i + 1 < c.cuts.length ? c.cuts[i + 1] : 1;
        const w = next - c.cuts[i];
        return { tab: i, tu: (uu - c.cuts[i]) / w, width: w, lifted: c.lifted.has(i) };
      }
    }
    return { tab: 0, tu: 0.5, width: 1, lifted: false };
  }

  const map = memo('shingle-albedo', () => {
    const s = surface(256);
    const rnd = mulberry32(90210);
    // An architectural shingle is a blend by design — the granules are mixed
    // so a roof never reads as one grey. Widened hard from the old ±15 %.
    const tone: number[] = Array.from({ length: 64 }, () => 0.62 + rnd() * 0.56);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const row = Math.min(rows - 1, Math.floor(v * rows));
      const t = v * rows - row;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const c = tabAt(u, row);
        const key = tone[Math.abs(row * 13 + c.tab * 29) % tone.length];
        // Granules: fine, and part of the relief as well as the colour.
        const g = tileFbm2(x / 4, y / 4, 64, 64, 2, 17);
        const grit = tileNoise2(x / 1.6, y / 1.6, 160, 160, 43);
        let value = 0.6 * key + (g - 0.5) * 0.24 + (grit - 0.5) * 0.1;

        // The keyway: the course above lies on top of this one, and the line
        // where it lands is the darkest thing on a roof.
        if (t < 0.14) value *= 0.3 + 0.7 * smooth(0.0, 0.14, t);
        // Tab slots, cut right through.
        const slot = Math.min(c.tu, 1 - c.tu) * c.width;
        if (slot < 0.004) value *= 0.34;
        else if (slot < 0.012) value *= 0.64 + 0.36 * smooth(0.004, 0.012, slot);
        // A lifted tab catches the sky along its butt and throws a hard line
        // under itself.
        if (c.lifted) {
          if (t > 0.1 && t < 0.2) value *= 1 + 0.4 * (1 - Math.abs(t - 0.15) / 0.05);
          if (t < 0.1) value *= 0.7;
        }
        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 248, value * 245, value * 239]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('shingle-normal', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const row = Math.min(rows - 1, Math.floor(v * rows));
      const t = v * rows - row;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const c = tabAt(u, row);
        const gx = (tileNoise2(x / 2.2, y / 2.2, 116, 116, 4) - 0.5) * 0.55;
        const gy = (tileNoise2(x / 2.2 + 40, y / 2.2, 116, 116, 4) - 0.5) * 0.55;
        // The butt of the course stands proud; a lifted tab stands prouder.
        let slope = t < 0.12 ? -1.1 - (c.lifted ? 0.8 : 0) : -0.05;
        if (c.lifted && t > 0.12 && t < 0.22) slope = 0.5;
        const slot = Math.min(c.tu, 1 - c.tu) * c.width;
        const nx = slot < 0.006 ? (c.tu < 0.5 ? -0.9 : 0.9) : 0;
        writeNormal(s.data, (y * s.size + x) * 4, gx + nx, slope + gy, 2.2);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Concrete — the foundation wall and the flatwork it meets.

   Both were noise over a flat colour, which is the one thing concrete never
   is: what you actually read on a driveway is the pour mottle, the sand and
   aggregate catching light out of the surface, and the saw cuts. The
   foundation gets the form-panel seam and the snap-tie holes that date the
   wall; the flatwork gets a broom finish, which is the reason a real walk
   changes tone as you move past it.
   ------------------------------------------------------------------------- */

export function concreteMaps(kind: 'foundation' | 'flatwork'): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
} {
  const seed = kind === 'foundation' ? 401 : 733;
  const flat = kind === 'flatwork';
  /** Cycles of broom stria per tile: 2.4 m of walk at roughly 28 mm spacing. */
  const BROOM = 86;

  const map = memo(`concrete-${kind}-albedo`, () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        // Two scales of pour mottle. One pass of noise reads as dirt on a
        // flat plane; two read as a slab that cured unevenly.
        const broad = tileFbm2(u * 3, v * 3, 3, 3, 4, seed);
        const patch = tileFbm2(u * 11, v * 11, 11, 11, 2, seed + 31);
        const sand = tileNoise2(u * 190, v * 190, 190, 190, seed + 77);
        const grit = tileNoise2(u * 84, v * 84, 84, 84, seed + 101);
        let value = 0.7 + (broad - 0.5) * 0.26 + (patch - 0.5) * 0.11;
        // Aggregate: pale sand lifted out of the paste and darker stone sunk
        // into it, thresholded so they stay separate grains.
        value += smooth(0.72, 0.9, sand) * 0.14;
        value -= smooth(0.78, 0.95, grit) * 0.17;

        if (flat) {
          // The broom, dragged with a wobble so it is not a ruled line.
          const wander = (tileNoise2(u * 5, v * 5, 5, 5, seed + 5) - 0.5) * 3.4;
          value += Math.sin(v * BROOM * Math.PI * 2 + wander) * 0.028;
          // One control joint per tile: 2.4 m is about where a crew would saw
          // a walk, and a quarter-tile grid turns the flatwork into pavers.
          const j = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
          if (j > 0.489) value *= 1 - 0.4 * smooth(0.489, 0.5, j);
          else if (j > 0.468) value *= 1 + 0.055 * smooth(0.468, 0.489, j);
        } else {
          // Form-panel seam, horizontal, where two lifts of plywood met.
          const seam = Math.abs(v - 0.46);
          if (seam < 0.007) value *= 0.84;
          else if (seam < 0.016) value *= 1.04;
          // Snap-tie holes, patched but never invisible.
          const tu = ((u * 2) % 1) - 0.5;
          const tv = ((v * 2) % 1) - 0.5;
          const d = Math.sqrt(tu * tu + tv * tv);
          if (d < 0.05) value *= 0.78 + 0.22 * smooth(0.02, 0.05, d);
        }

        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 250, value * 246, value * 238]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo(`concrete-${kind}-normal`, () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        let gx = (tileNoise2(u * 128, v * 128, 128, 128, seed + 3) - 0.5) * 0.4;
        let gy = (tileNoise2(u * 128 + 17, v * 128, 128, 128, seed + 3) - 0.5) * 0.4;
        // The aggregate has to be in the relief as well as the albedo or it
        // stays a print rather than a surface.
        const grit = tileNoise2(u * 84, v * 84, 84, 84, seed + 101);
        const bump = smooth(0.68, 0.95, grit) * 0.9;
        gx += (tileNoise2(u * 84 + 31, v * 84, 84, 84, seed + 101) - 0.5) * bump;
        gy += (tileNoise2(u * 84, v * 84 + 31, 84, 84, seed + 101) - 0.5) * bump;

        if (flat) {
          const wander = (tileNoise2(u * 5, v * 5, 5, 5, seed + 5) - 0.5) * 3.4;
          gy += Math.cos(v * BROOM * Math.PI * 2 + wander) * 0.22;
          const j = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
          if (j > 0.489) {
            const side = Math.abs(u - 0.5) > Math.abs(v - 0.5);
            const dir = (side ? u - 0.5 : v - 0.5) < 0 ? -1 : 1;
            if (side) gx += dir * 1.5;
            else gy += dir * 1.5;
          }
        } else {
          const seam = Math.abs(v - 0.46);
          if (seam < 0.009) gy += (v < 0.46 ? -1 : 1) * 0.9;
        }

        writeNormal(s.data, (y * s.size + x) * 4, gx, gy, 2.4);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Ledgestone veneer — the water table and porch base, per the reference.

   Ledgestone is sold as a blend, and the blend is the whole effect: run one
   grey across a pier and it reads as painted board. So each stone draws a
   face colour from a five-way palette with a buff and a near-charcoal in it,
   then gets its own brightness, its own bedding striations and a chamfer that
   catches light along the top arris and loses it under the course above. That
   top-and-bottom pair is what survives to thirty metres; the aggregate
   speckle is for the eight-metre service views.
   ------------------------------------------------------------------------- */

export function stoneMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const courses = 7;
  const joint = 0.055;

  interface Stone {
    /** Where the stone starts and ends across the course, 0–1. */
    at: number;
    wide: number;
  }

  /**
   * The course layout, walked once rather than per texel. The old version
   * re-seeded a generator and rebuilt the width table for every pixel of a
   * 512² map, which is most of what the stone cost to make.
   */
  const layout: Stone[][] = Array.from({ length: courses }, (_, course) => {
    const rnd = mulberry32(course * 7919 + 13);
    const counts = [4, 5, 3, 6, 4, 5, 4];
    const n = counts[course % counts.length];
    const widths = Array.from({ length: n }, () => 0.6 + rnd() * 0.8);
    const total = widths.reduce((a, b) => a + b, 0);
    const offset = rnd() * 0.5;
    const stones: Stone[] = [];
    let acc = -offset;
    for (let i = 0; i < n; i++) {
      stones.push({ at: acc, wide: widths[i] / total });
      acc += widths[i] / total;
    }
    return stones;
  });

  interface Cell {
    course: number;
    idx: number;
    su: number;
    sv: number;
    wide: number;
  }

  function cell(u: number, v: number): Cell {
    const course = Math.min(courses - 1, Math.floor(v * courses));
    const sv = v * courses - course;
    const row = layout[course];
    const uu = (((u - row[0].at) % 1) + 1) % 1;
    let acc = 0;
    for (let i = 0; i < row.length; i++) {
      const w = row[i].wide;
      if (uu < acc + w) return { course, idx: i, su: (uu - acc) / w, sv, wide: w };
      acc += w;
    }
    const last = row.length - 1;
    return { course, idx: last, su: 0.5, sv, wide: row[last].wide };
  }

  /**
   * A real blend: two greys, a pale limestone, a buff and a charcoal. Drawn
   * per stone, so no two neighbours agree for long.
   */
  const BLEND: Rgb[] = [
    [198, 201, 205],
    [231, 226, 216],
    [150, 150, 153],
    [226, 206, 173],
    [199, 189, 175],
  ];

  const map = memo('stone-albedo', () => {
    // The blend and the chamfer are what carry; 384 over a 1.45 m tile still
    // beats the 180 pixels a metre of pier gets at the entry camera.
    const s = surface(384);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const c = cell(u, v);
        const eu = joint / (c.wide * courses);
        const inJoint = c.sv < joint || c.sv > 1 - joint || c.su < eu || c.su > 1 - eu;
        const i = (y * s.size + x) * 4;

        if (inJoint) {
          // Mortar is raked back and holds its own shadow, so it is darker
          // than any stone and reads as a line rather than a grey stone.
          const dv = Math.min(c.sv, 1 - c.sv) / joint;
          const du = Math.min(c.su, 1 - c.su) / eu;
          const depth = 1 - Math.min(1, Math.min(dv, du));
          const sand = tileNoise2(u * 170, v * 170, 170, 170, 23);
          const value = clamp01(0.46 - depth * 0.17 + (sand - 0.5) * 0.12);
          writeRgb(s.data, i, [value * 186, value * 181, value * 172]);
          continue;
        }

        const pick = mulberry32(c.course * 131 + c.idx * 17);
        const face = BLEND[Math.floor(pick() * BLEND.length) % BLEND.length];
        const level = 0.74 + pick() * 0.3;
        // Sedimentary bedding: stretched hard across the stone so it lies
        // flat the way a split face does.
        const bed = tileFbm2(u * 22, v * 150, 22, 150, 3, c.course * 3 + c.idx) - 0.5;
        const mottle = tileFbm2(u * 40, v * 40, 40, 40, 3, c.idx * 7 + 5) - 0.5;
        // Mineral flecks — discrete, not a wash, which is what separates
        // stone from grey paint under the eight-metre camera.
        const fleck = tileNoise2(u * 320, v * 320, 320, 320, 61);
        let value = level + bed * 0.17 + mottle * 0.13;
        value += smooth(0.8, 0.94, fleck) * 0.12;
        value -= smooth(0.82, 0.96, 1 - fleck) * 0.1;

        // The chamfer. The course above throws a shadow on the bottom arris
        // and the top arris catches sky, and that pair of lines is the whole
        // reason a stone wall still reads as stone from the street.
        const below = c.sv / 0.17;
        const above = (1 - c.sv) / 0.13;
        if (below < 1) value *= 0.6 + 0.4 * below;
        if (above < 1) value *= 1 + 0.2 * (1 - above);
        const side = Math.min(c.su, 1 - c.su) / 0.14;
        if (side < 1) value *= 0.86 + 0.14 * side;

        value = clamp01(value);
        writeRgb(s.data, i, [value * face[0], value * face[1], value * face[2]]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('stone-normal', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const c = cell(u, v);
        const eu = joint / (c.wide * courses);
        const edgeV = Math.min(c.sv, 1 - c.sv);
        const edgeU = Math.min(c.su, 1 - c.su);
        let gx = 0;
        let gy = 0;
        if (edgeV < joint) gy = c.sv < 0.5 ? -1.6 : 1.6;
        if (edgeU < eu) gx = c.su < 0.5 ? -1.5 : 1.5;
        // Each face bulges out of the wall a little, so the light rakes
        // across it instead of hitting a plane dead on.
        gx += (c.su - 0.5) * 0.7;
        gy += (c.sv - 0.5) * 0.55;
        const rough = (tileFbm2(u * 90, v * 90, 90, 90, 3, 5) - 0.5) * 0.8;
        const chip = (tileNoise2(u * 260, v * 260, 260, 260, 19) - 0.5) * 0.45;
        writeNormal(s.data, (y * s.size + x) * 4, gx + rough + chip, gy + rough * 0.8 - chip, 1.8);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Lawn — soft mown texture; the bulk of the ground plane.
   ------------------------------------------------------------------------- */

export function lawnMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const map = memo('lawn-albedo', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const clump = tileFbm2(u * 6, v * 6, 6, 6, 4, 55);
        const blade = tileNoise2(u * 150, v * 150, 150, 150, 71);
        const mow = 0.5 + 0.5 * Math.sin(v * Math.PI * 4);
        const value = clamp01(0.64 + (clump - 0.5) * 0.44 + (blade - 0.5) * 0.24 + mow * 0.08);
        // Turf is a far brighter surface than the old tile allowed: the map
        // and the material colour multiply, and between them they were
        // landing the lawn near three per cent albedo, which is asphalt.
        // Straw: no lawn is one green, and the thin patches are what stop a
        // hundred metres of it reading as a sheet of paper.
        const dry = smooth(0.58, 0.86, tileFbm2(u * 3, v * 3, 3, 3, 3, 203));
        const i = (y * s.size + x) * 4;
        writeRgb(s.data, i, [
          value * (154 + dry * 52),
          value * (176 + dry * 14),
          value * (110 + dry * 22),
        ]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('lawn-normal', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const gx = (tileNoise2(x / 1.6, y / 1.6, 160, 160, 12) - 0.5) * 0.9;
        const gy = (tileNoise2(x / 1.6 + 60, y / 1.6, 160, 160, 12) - 0.5) * 0.9;
        writeNormal(s.data, (y * s.size + x) * 4, gx, gy, 2.1);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Mulch bed and decking.
   ------------------------------------------------------------------------- */

/**
 * Shredded hardwood mulch.
 *
 * The old tile landed near black, which reads as a hole cut in the lawn
 * rather than as a bed. Real mulch is a mid dark brown that catches a lot of
 * light — the chips are flat facets lying every which way and half of them
 * are pointed at the sky — so this is roughly twice as bright, with the
 * chips drawn as discrete lit shards instead of a soft cloud of noise.
 */
export function mulchMap(): THREE.Texture {
  return memo('mulch-albedo', () => {
    const s = surface(192);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        // Two chip fields at different angles, so the shreds are not all
        // lying the same way.
        const a = tileFbm2(u * 26 + v * 7, v * 15, 33, 15, 2, 88);
        const b = tileFbm2(u * 11 - v * 18, v * 29, 29, 29, 2, 141);
        const chip = Math.max(a, b);
        const bed = tileFbm2(u * 4, v * 4, 4, 4, 3, 12);
        let value = 0.72 + (bed - 0.5) * 0.3;
        // The lit face of a chip, and the gap it falls into.
        value += smooth(0.56, 0.78, chip) * 0.3;
        value -= smooth(0.62, 0.9, 1 - chip) * 0.34;
        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 168, value * 126, value * 92]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });
}

/**
 * Composite decking: 150 mm boards with a shadowed gap and a brushed grain.
 *
 * At the deck camera the old tile collapsed into one brown plane, because the
 * only thing separating the boards was a 55 % grey line one texel wide. What
 * actually reads across a deck is three things: the gap is nearly black, the
 * arris either side of it catches light, and no two boards are the same
 * colour — composite is run in batches and weathers per board.
 */
export function deckMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const boards = 7;
  /** Half-width of the gap in board units; the rest of the falloff is shading. */
  const GAP = 0.04;

  const map = memo('deck-albedo', () => {
    const s = surface(256);
    const rnd = mulberry32(2024);
    // Brightness, warmth and a grain phase per board, so the grain does not
    // line up across the gap and give the tile away.
    const tone = Array.from({ length: boards }, () => 0.82 + rnd() * 0.3);
    const warm = Array.from({ length: boards }, () => 0.86 + rnd() * 0.3);
    const phase = Array.from({ length: boards }, () => rnd() * 10);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const b = Math.min(boards - 1, Math.floor(v * boards));
      const t = v * boards - b;
      const edge = Math.min(t, 1 - t);
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const grain = tileFbm2(u * 5 + phase[b], v * 150, 5, 150, 3, 31) - 0.5;
        // A few hard grain lines per board on top of the brushed field; they
        // are what carry the board direction once the tile is 12 m away.
        const streak = tileFbm2(u * 2 + phase[b], v * 260, 2, 260, 2, 97);
        let value = 0.74 * tone[b] + grain * 0.2 - smooth(0.7, 0.92, streak) * 0.14;

        if (edge < GAP) {
          // The gap: dark enough to be a gap, not a pencil line.
          value *= 0.2 + 0.5 * (edge / GAP);
        } else if (edge < 0.11) {
          // The eased arris beside it — bright on the upper board's edge,
          // shaded on the lower one, which is what gives the deck relief.
          const k = (edge - GAP) / (0.11 - GAP);
          const lit = t < 0.5 ? 0.82 : 1.14;
          value *= lit + (1 - lit) * k;
        }

        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [
          value * (236 + warm[b] * 24),
          value * (232 + warm[b] * 12),
          value * (230 - warm[b] * 30),
        ]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('deck-normal', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const t = (v * boards) % 1;
      const edge = Math.min(t, 1 - t);
      // A ramp rather than a step, so the board edge rolls over the way an
      // eased composite edge does instead of shearing.
      const slope = edge < 0.09 ? (t < 0.5 ? -1 : 1) * (1 - edge / 0.09) * 1.3 : 0;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const gx = (tileFbm2(u * 6, v * 150, 6, 150, 2, 41) - 0.5) * 0.3;
        const groove = (tileFbm2(u * 3, v * 300, 3, 300, 2, 83) - 0.5) * 0.55;
        writeNormal(s.data, (y * s.size + x) * 4, gx, slope + groove, 2.1);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   The sky.

   One sky, in one place, used three ways: it is the dome behind the house,
   it is the image-based light every material is lit by, and it is what the
   glazing reflects. Those were three separate approximations that disagreed
   with each other, which is a large part of why the model read as a drawing
   — the windows showed a warm studio wash while the backdrop showed a cool
   one, and neither matched the light rig.

   So the sky is written once, in GLSL, and the environment map is made by
   prefiltering the same material rather than by a second implementation of
   the same maths on the CPU. Radiance comes out linear and unbounded: the
   disc of the sun is two orders of magnitude above the sky around it, which
   is what gives metal and glass a glint instead of a pale smear, and the
   tone mapper is left to deal with the top end.
   ------------------------------------------------------------------------- */

/** Matches the key light in `PropertyScene`; the sun must be in one place. */
export const SUN_DIRECTION = new THREE.Vector3(7, 15, 19).normalize();

/**
 * Uniforms for `SKY_GLSL`. A fresh object per material, because three writes
 * through these and two materials must not share one set.
 *
 * `uStageMix` and `uStageColor` exist for the wall stage: the daylight drains
 * to a flat studio colour as the assembly takes over, and doing that here
 * keeps the dome and the reflections draining together.
 */
export function skyUniforms(): Record<string, THREE.IUniform> {
  return {
    uSunDirection: { value: SUN_DIRECTION.clone() },
    uSunColor: { value: new THREE.Color('#fff4e2').convertSRGBToLinear() },
    uSkyZenith: { value: new THREE.Color('#5c8dcd').convertSRGBToLinear() },
    // Deepened from #dfe8f2. The camera stands on the lawn, so the whole
    // visible band of sky is within ~20 degrees of the horizon; at the old
    // value that band tone-mapped to milk and the frame read as fog.
    uSkyHaze: { value: new THREE.Color('#c9d8ea').convertSRGBToLinear() },
    // The lower hemisphere is a sunlit lot, and it was being given the
    // radiance of a lawn at dusk. It feeds two things that both looked wrong
    // for the same reason: the bounce in the environment map, which is what
    // lights the underside of every eave and soffit, and the reflection in
    // the glass, which on a camera standing above the sills is the ground
    // almost everywhere on the elevation. Lifted and greened; the far tone is
    // where the drive, the walk and the neighbours average out.
    uSkyGroundNear: { value: new THREE.Color('#b9bea2').convertSRGBToLinear() },
    uSkyGroundFar: { value: new THREE.Color('#93967f').convertSRGBToLinear() },
    uSkyGain: { value: 1.8 },
    uStageColor: { value: new THREE.Color('#0a1b30').convertSRGBToLinear() },
    uStageMix: { value: 0 },
  };
}

/**
 * `vec3 wceSkyRadiance(vec3 direction)` — linear radiance looking that way.
 *
 * Above the horizon it is a Rayleigh-shaped gradient with forward scatter on
 * the sun's side; the cumulus is projected onto a plane overhead so the
 * banding compresses toward the horizon the way real cloud does, and each
 * cloud is shaded by comparing its density against a sample one step toward
 * the sun — thin in that direction means the face is turned into the light,
 * which is what gives lit tops and grey bases without a second noise field.
 * Below the horizon it is the lot and the street, because that is what a
 * window catches from any camera standing higher than the sill.
 */
export const SKY_GLSL = `
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHaze;
uniform vec3 uSkyGroundNear;
uniform vec3 uSkyGroundFar;
uniform float uSkyGain;
uniform vec3 uStageColor;
uniform float uStageMix;

float wceSkyHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float wceSkyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(wceSkyHash(i), wceSkyHash(i + vec2(1.0, 0.0)), f.x),
    mix(wceSkyHash(i + vec2(0.0, 1.0)), wceSkyHash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

float wceSkyFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 4; i++) {
    sum += amp * wceSkyNoise(p);
    p = p * 2.07 + 11.3;
    amp *= 0.5;
  }
  return sum;
}

vec3 wceSkyRadiance(vec3 d) {
  float h = d.y;
  float sd = dot(d, uSunDirection);

  // Exponential, not a power of (1 - h). A power curve is flat where it
  // matters: at ten degrees above the horizon 1 - h is still 0.98, so every
  // exponent left the whole low sky sitting on the haze colour. Real sky
  // reaches its zenith blue within about twenty degrees, which is what this
  // falloff does — and twenty degrees is the entire band a camera standing on
  // the lawn can see.
  float grad = exp(-clamp(h, 0.0, 1.0) * 6.0);
  vec3 col = mix(uSkyZenith, uSkyHaze, grad);
  // Mie forward scatter: the sun's half of the sky is warmer and paler, and
  // a sky that is the same blue all the way round is the flattest tell there is.
  col += uSunColor * (0.14 * pow(max(sd, 0.0), 3.0) * grad);

  // The lot and the street. Broken, not a ramp — a window pointed down finds
  // lawn, drive and the neighbours, never a clean gradient.
  vec3 ground = mix(uSkyGroundNear, uSkyGroundFar, pow(clamp(-h * 3.2, 0.0, 1.0), 0.55));
  ground *= 0.78 + 0.44 * wceSkyNoise(d.xz / max(-h, 0.3) * 0.9);
  col = mix(col, ground, smoothstep(0.0, -0.03, h));

  // The haze line. Two gradients meeting at an edge look drawn; a band a
  // couple of degrees thick looks lit.
  col += uSkyHaze * 0.18 * exp(-abs(h) * 26.0);

  float deck = smoothstep(0.02, 0.2, h);
  if (deck > 0.0) {
    vec2 p = d.xz / max(h, 0.05) * 0.4;
    float dens = wceSkyFbm(p);
    float lean = dens - wceSkyFbm(p + uSunDirection.xz * 0.6);
    vec3 cloud = mix(vec3(0.44, 0.47, 0.55), vec3(1.5, 1.47, 1.4), smoothstep(-0.07, 0.15, lean));
    col = mix(col, cloud, smoothstep(0.47, 0.8, dens) * deck * 0.94);
  }

  // The sun as a disc with an aureole around it, not a smear. Its radiance is
  // far above the sky's on purpose: that ratio is the glint.
  float ang = acos(clamp(sd, -1.0, 1.0));
  col += uSunColor * (
    (1.0 - smoothstep(0.0042, 0.0058, ang)) * 90.0 +
    exp(-ang * 30.0) * 1.2 +
    exp(-ang * 3.2) * 0.07);

  return mix(col * uSkyGain, uStageColor, uStageMix);
}`;

/**
 * The dome behind the house. `PropertyScene` puts this on its backdrop sphere
 * so the visible sky and the reflected sky are the same shader; prefiltering
 * this same material is where `studioEnvironment` gets the environment map.
 */
export function skyDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms(),
    vertexShader: `
      varying vec3 vWceSkyDir;
      void main() {
        vWceSkyDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      ${SKY_GLSL}
      varying vec3 vWceSkyDir;
      #include <tonemapping_pars_fragment>
      void main() {
        gl_FragColor = vec4(wceSkyRadiance(normalize(vWceSkyDir)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The environment map, prefiltered straight off the sky material.
 *
 * Generating it from the shader rather than from a second CPU implementation
 * is the whole point: there is no way for the light the house is lit by to
 * drift away from the sky it is standing under.
 */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const key = 'env';
  const hit = cache.get(key);
  if (hit) return hit;

  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(1, 32, 16);
  const material = skyDomeMaterial();
  scene.add(new THREE.Mesh(geometry, material));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0, 0.1, 10).texture;
  pmrem.dispose();
  geometry.dispose();
  material.dispose();

  env.name = key;
  cache.set(key, env);
  return env;
}
