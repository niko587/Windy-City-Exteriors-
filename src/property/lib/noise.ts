/** Deterministic random + value-noise helpers used by procedural textures and foliage. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 3D value noise in [0, 1].
 *
 * Written out rather than looped through a helper: these run tens of millions
 * of times while the property's textures are generated, all on the main
 * thread before the first frame, and a closure allocated per call is most of
 * what that time was being spent on.
 */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const x1 = xi + 1;
  const y1 = yi + 1;
  const z1 = zi + 1;
  return mix(
    mix(
      mix(hash3(xi, yi, zi), hash3(x1, yi, zi), u),
      mix(hash3(xi, y1, zi), hash3(x1, y1, zi), u),
      v,
    ),
    mix(
      mix(hash3(xi, yi, z1), hash3(x1, yi, z1), u),
      mix(hash3(xi, y1, z1), hash3(x1, y1, z1), u),
      v,
    ),
    w,
  );
}

export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * Tileable 2D value noise in [0, 1]: lattice wraps every `period` cells so
 * textures repeat without a seam.
 */
export function tileNoise2(x: number, y: number, periodX: number, periodY: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  // The wrap is inlined for the same reason noise3 is: this is the innermost
  // loop of every procedural map on the property.
  let x0 = xi % periodX;
  if (x0 < 0) x0 += periodX;
  let x1 = (xi + 1) % periodX;
  if (x1 < 0) x1 += periodX;
  let y0 = yi % periodY;
  if (y0 < 0) y0 += periodY;
  let y1 = (yi + 1) % periodY;
  if (y1 < 0) y1 += periodY;
  return mix(
    mix(hash3(x0, y0, seed), hash3(x1, y0, seed), u),
    mix(hash3(x0, y1, seed), hash3(x1, y1, seed), u),
    v,
  );
}

export function tileFbm2(x: number, y: number, periodX: number, periodY: number, octaves = 4, seed = 0): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise2(x * f, y * f, periodX * f, periodY * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
