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
}

function surface(size: number): { data: Uint8ClampedArray; size: number } {
  return { data: new Uint8ClampedArray(size * size * 4), size };
}

function toTexture(
  s: { data: Uint8ClampedArray; size: number },
  colorSpace: THREE.ColorSpace,
  repeat = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s.size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(s.size, s.size);
    img.data.set(s.data);
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeat, repeat);
  return tex;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

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
   Lap siding — 1 m × 1 m tile, six 167 mm courses.
   ------------------------------------------------------------------------- */

const COURSES = 6;

/**
 * Lap profile across one course. `t` runs 0 (butt edge, bottom) to 1 (top,
 * tucked under the course above). Returns the surface slope in v and a depth
 * used for baked contact shading.
 */
function lapProfile(t: number): { slope: number; shade: number } {
  if (t < 0.035) return { slope: -1.15, shade: 0.58 }; // underside of the butt edge
  if (t < 0.075) return { slope: 0.55, shade: 0.78 }; // shadowed wall just below the lap
  const k = (t - 0.075) / 0.925;
  return { slope: -0.1 - 0.16 * k, shade: 0.94 + 0.06 * k };
}

export function sidingMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const map = memo('siding-albedo', () => {
    const s = surface(512);
    const rnd = mulberry32(1337);
    const boardTone: number[] = Array.from({ length: COURSES * 3 }, () => 0.965 + rnd() * 0.05);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const course = Math.floor(v * COURSES);
      const t = v * COURSES - course;
      const { shade } = lapProfile(t);
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        // Long, low-frequency grain along the board plus a fine vertical fibre.
        const grain = tileFbm2(u * 7, v * 96, 7, 96, 3, 11) - 0.5;
        const fibre = tileNoise2(u * 220, v * 26, 220, 26, 29) - 0.5;
        const seam = boardTone[(course * 3 + Math.floor(u * 3)) % boardTone.length];
        const value = clamp01(shade * seam + grain * 0.045 + fibre * 0.02);
        const i = (y * s.size + x) * 4;
        // Near-neutral: material.color supplies the hue, so one tile serves
        // siding, soffit and trim.
        writeRgb(s.data, i, [value * 255, value * 254, value * 251]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('siding-normal', () => {
    const s = surface(512);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const course = Math.floor(v * COURSES);
      const t = v * COURSES - course;
      const { slope } = lapProfile(t);
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const gx = (tileNoise2(u * 180, v * 30, 180, 30, 5) - 0.5) * 0.12;
        const gy = (tileFbm2(u * 9, v * 110, 9, 110, 2, 7) - 0.5) * 0.16;
        writeNormal(s.data, (y * s.size + x) * 4, gx, slope + gy, 1.9);
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
   Architectural shingles — 1 m tile, five courses of staggered tabs.
   ------------------------------------------------------------------------- */

export function shingleMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const rows = 5;
  const tabs = 3;

  const map = memo('shingle-albedo', () => {
    const s = surface(512);
    const rnd = mulberry32(90210);
    const tone: number[] = Array.from({ length: rows * tabs * 4 }, () => 0.78 + rnd() * 0.3);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const row = Math.floor(v * rows);
      const t = v * rows - row;
      for (let x = 0; x < s.size; x++) {
        const offset = row % 2 === 0 ? 0 : 0.5 / tabs;
        const u = (x / s.size + offset) % 1;
        const tab = Math.floor(u * tabs);
        const tu = u * tabs - tab;
        const key = tone[(row * tabs + tab) % tone.length];
        // Granules.
        const g = tileFbm2(x / 5, y / 5, 102, 102, 2, 17);
        let value = 0.62 * key + g * 0.2;
        if (t < 0.11) value *= 0.62; // keyway shadow under each course
        if (tu < 0.018 || tu > 0.982) value *= 0.6; // tab slots
        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 246, value * 244, value * 240]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('shingle-normal', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const row = Math.floor(v * rows);
      const t = v * rows - row;
      const slope = t < 0.1 ? -0.9 : -0.06;
      for (let x = 0; x < s.size; x++) {
        const gx = (tileNoise2(x / 2.2, y / 2.2, 116, 116, 4) - 0.5) * 0.5;
        const gy = (tileNoise2(x / 2.2 + 40, y / 2.2, 116, 116, 4) - 0.5) * 0.5;
        writeNormal(s.data, (y * s.size + x) * 4, gx, slope + gy, 2.2);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Foundation — poured/parged concrete with a faint form line.
   ------------------------------------------------------------------------- */

export function concreteMaps(kind: 'foundation' | 'flatwork'): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
} {
  const seed = kind === 'foundation' ? 401 : 733;
  const map = memo(`concrete-${kind}-albedo`, () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const broad = tileFbm2(u * 4, v * 4, 4, 4, 4, seed);
        const fine = tileNoise2(u * 128, v * 128, 128, 128, seed + 9);
        let value = 0.72 + (broad - 0.5) * 0.17 + (fine - 0.5) * 0.06;
        if (kind === 'flatwork') {
          // Control joints every quarter tile.
          const j = Math.min(Math.abs((u * 4) % 1 - 0.5), Math.abs((v * 4) % 1 - 0.5));
          if (j > 0.492) value *= 0.72;
        }
        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 252, value * 249, value * 243]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo(`concrete-${kind}-normal`, () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      for (let x = 0; x < s.size; x++) {
        const gx = (tileNoise2(x / 3, y / 3, 85, 85, seed + 3) - 0.5) * 0.35;
        const gy = (tileNoise2(x / 3 + 17, y / 3, 85, 85, seed + 3) - 0.5) * 0.35;
        writeNormal(s.data, (y * s.size + x) * 4, gx, gy, 2.6);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Ledgestone veneer — the water table and porch base, per the reference.
   Irregular courses of varying-width stones with a recessed mortar joint.
   ------------------------------------------------------------------------- */

export function stoneMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const courses = 7;
  const joint = 0.055;

  /** Which stone a texel belongs to, and where it sits inside it. */
  function cell(u: number, v: number): { course: number; idx: number; su: number; sv: number; wide: number } {
    const course = Math.floor(v * courses);
    const sv = v * courses - course;
    const rnd = mulberry32(course * 7919 + 13);
    // Walk the course to find the stone under u; widths vary but always tile.
    const counts = [4, 5, 3, 6, 4, 5, 4];
    const n = counts[course % counts.length];
    const widths: number[] = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.6 + rnd() * 0.8;
      widths.push(w);
      total += w;
    }
    const offset = rnd() * 0.5;
    let acc = 0;
    const uu = (u + offset) % 1;
    for (let i = 0; i < n; i++) {
      const w = widths[i] / total;
      if (uu < acc + w) return { course, idx: i, su: (uu - acc) / w, sv, wide: w };
      acc += w;
    }
    return { course, idx: n - 1, su: 0.5, sv, wide: 1 / n };
  }

  const map = memo('stone-albedo', () => {
    const s = surface(512);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const c = cell(u, v);
        const inJoint =
          c.sv < joint || c.sv > 1 - joint || c.su < joint / (c.wide * courses) || c.su > 1 - joint / (c.wide * courses);
        const tone = mulberry32(c.course * 131 + c.idx * 17)();
        const grain = tileFbm2(u * 46, v * 46, 46, 46, 4, c.course * 3 + c.idx);
        let value = inJoint ? 0.42 : 0.6 + tone * 0.34 + (grain - 0.5) * 0.3;
        // Cool grey stone with a warm minority, like real ledgestone.
        const warm = tone > 0.72 ? 1 : 0;
        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [
          value * (warm ? 214 : 196),
          value * (warm ? 200 : 196),
          value * (warm ? 180 : 195),
        ]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('stone-normal', () => {
    const s = surface(512);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const c = cell(u, v);
        const edgeV = Math.min(c.sv, 1 - c.sv);
        const eu = joint / (c.wide * courses);
        const edgeU = Math.min(c.su, 1 - c.su);
        let gx = 0;
        let gy = 0;
        if (edgeV < joint) gy = c.sv < 0.5 ? -1.4 : 1.4;
        if (edgeU < eu) gx = c.su < 0.5 ? -1.3 : 1.3;
        const rough = (tileFbm2(u * 90, v * 90, 90, 90, 3, 5) - 0.5) * 0.7;
        writeNormal(s.data, (y * s.size + x) * 4, gx + rough, gy + rough * 0.8, 2.0);
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
        const value = clamp01(0.52 + (clump - 0.5) * 0.4 + (blade - 0.5) * 0.22 + mow * 0.07);
        const i = (y * s.size + x) * 4;
        writeRgb(s.data, i, [value * 128, value * 150, value * 92]);
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

export function mulchMap(): THREE.Texture {
  return memo('mulch-albedo', () => {
    const s = surface(128);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const chip = tileFbm2(u * 22, v * 14, 22, 14, 3, 88);
        const value = clamp01(0.4 + (chip - 0.5) * 0.7);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 122, value * 84, value * 62]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });
}

/** Composite decking: 140 mm boards with a 5 mm gap, brushed grain. */
export function deckMaps(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const boards = 7;
  const map = memo('deck-albedo', () => {
    const s = surface(256);
    const rnd = mulberry32(2024);
    const tone = Array.from({ length: boards }, () => 0.9 + rnd() * 0.16);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const b = Math.floor(v * boards);
      const t = v * boards - b;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const grain = tileFbm2(u * 4, v * 140, 4, 140, 3, 31) - 0.5;
        let value = 0.72 * tone[b] + grain * 0.14;
        if (t < 0.045 || t > 0.955) value *= 0.45; // the gap between boards
        value = clamp01(value);
        writeRgb(s.data, (y * s.size + x) * 4, [value * 255, value * 250, value * 242]);
      }
    }
    return toTexture(s, THREE.SRGBColorSpace);
  });

  const normalMap = memo('deck-normal', () => {
    const s = surface(256);
    for (let y = 0; y < s.size; y++) {
      const v = 1 - y / s.size;
      const t = (v * boards) % 1;
      const slope = t < 0.05 ? -0.8 : t > 0.95 ? 0.8 : 0;
      for (let x = 0; x < s.size; x++) {
        const u = x / s.size;
        const gx = (tileFbm2(u * 6, v * 150, 6, 150, 2, 41) - 0.5) * 0.35;
        writeNormal(s.data, (y * s.size + x) * 4, gx, slope, 2.3);
      }
    }
    return toTexture(s, THREE.NoColorSpace);
  });

  return { map, normalMap };
}

/* -------------------------------------------------------------------------
   Studio environment — a soft gradient equirect used for image-based light.
   Warm bounce near the horizon, cool sky above, so metal and glass have
   something believable to reflect without shipping an HDR.
   ------------------------------------------------------------------------- */

export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const key = 'env';
  const hit = cache.get(key);
  if (hit) return hit;

  const w = 256;
  const h = 128;
  const data = new Uint8ClampedArray(w * h * 4);
  const sky: Rgb = [214, 226, 244];
  const zenith: Rgb = [176, 198, 231];
  const horizon: Rgb = [248, 241, 229];
  const ground: Rgb = [150, 142, 126];

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 = zenith
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c: Rgb;
      if (v < 0.5) {
        const k = Math.pow(v / 0.5, 1.4);
        c = [
          zenith[0] + (horizon[0] - zenith[0]) * k,
          zenith[1] + (horizon[1] - zenith[1]) * k,
          zenith[2] + (horizon[2] - zenith[2]) * k,
        ];
        // A gentle warm pool where the sun sits, for directional falloff.
        const u = x / w;
        const sun = Math.exp(-(((u - 0.62) * 6) ** 2) - (((v - 0.3) * 7) ** 2));
        c = [c[0] + sun * 40, c[1] + sun * 30, c[2] + sun * 12];
      } else {
        const k = Math.pow((v - 0.5) / 0.5, 0.7);
        c = [
          horizon[0] + (ground[0] - horizon[0]) * k,
          horizon[1] + (ground[1] - horizon[1]) * k,
          horizon[2] + (ground[2] - horizon[2]) * k,
        ];
      }
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
      void sky;
    }
  }

  const src = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  src.mapping = THREE.EquirectangularReflectionMapping;
  src.colorSpace = THREE.SRGBColorSpace;
  src.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(src).texture;
  pmrem.dispose();
  src.dispose();
  env.name = key;
  cache.set(key, env);
  return env;
}
