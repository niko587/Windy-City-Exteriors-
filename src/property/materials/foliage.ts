/**
 * Leaf cards.
 *
 * A shrub was a displaced sphere, and a displaced sphere cannot read as a
 * plant. Foliage is recognised by its edge: the eye checks the silhouette
 * against thousands of remembered plants before it looks at anything else,
 * and a closed convex outline fails that check instantly, however well the
 * surface is shaded. Every lobe added to the old blobs made it rounder.
 *
 * So the planting is built from alpha-cut cards instead, and this file draws
 * what goes on them: four tiles, each a cluster of a couple of hundred leaves
 * with nothing but transparency between and around them. Scattered on small
 * spheres and given outward normals by `house.ts`, they shade like a mass and
 * cut like a plant.
 *
 * The cut is hard rather than blended — alpha testing, not transparency — for
 * two reasons. Transparent foliage needs sorting, and sorting a merged mesh is
 * not possible; and an alpha-tested material casts a shadow with holes in it,
 * which is most of what makes dappled light under a tree look right.
 */

import * as THREE from 'three';
import { mulberry32 } from '../lib/noise';

/** Four tiles across a 2×2 atlas, so neighbouring cards are never the same. */
export const LEAF_TILES = 2;

const SIZE = 1024;
const TILE = SIZE / LEAF_TILES;

let cached: THREE.CanvasTexture | null = null;

/**
 * One leaf: a tapered blade drawn as two quadratic curves off a midrib, with
 * a lighter half and a darker half so it catches a direction even when the
 * card it sits on is facing away from the sun.
 */
function leaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  angle: number,
  hue: number,
  light: number,
  sat: number,
): void {
  const w = length * (0.3 + (hue % 7) / 44);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(w, length * 0.36, 0, length);
  ctx.quadraticCurveTo(-w, length * 0.36, 0, 0);
  ctx.closePath();

  const grad = ctx.createLinearGradient(-w, 0, w, length);
  grad.addColorStop(0, `hsl(${hue} ${sat}% ${light * 1.24}%)`);
  grad.addColorStop(1, `hsl(${hue - 6} ${sat + 6}% ${light * 0.68}%)`);
  ctx.fillStyle = grad;
  ctx.fill();

  // The midrib. One pixel of structure per leaf is the difference between a
  // green flake and something that grew.
  ctx.strokeStyle = `hsl(${hue + 4} ${sat}% ${light * 1.5}%)`;
  ctx.lineWidth = Math.max(0.6, length * 0.035);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, length * 0.06);
  ctx.lineTo(0, length * 0.92);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * The cluster that fills one tile.
 *
 * Density falls off toward the edge of the tile, and the falloff is noisy
 * rather than radial: a clean circular fade puts a round outline back on the
 * card and undoes the whole point of the exercise.
 */
function cluster(ctx: CanvasRenderingContext2D, ox: number, oy: number, seed: number): void {
  const rnd = mulberry32(seed);
  const half = TILE / 2;
  const count = 540;

  // A few coarse lobes give the cluster somewhere to be dense, so the gaps
  // fall between masses of leaves rather than evenly across the tile.
  const lobes = Array.from({ length: 5 }, () => ({
    x: (rnd() - 0.5) * TILE * 0.52,
    y: (rnd() - 0.5) * TILE * 0.52,
    r: TILE * (0.22 + rnd() * 0.22),
  }));

  for (let i = 0; i < count; i++) {
    const lobe = lobes[Math.floor(rnd() * lobes.length)];
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.62) * lobe.r;
    const x = ox + half + lobe.x + Math.cos(a) * d;
    const y = oy + half + lobe.y + Math.sin(a) * d * 0.88;

    // Keep the blade inside its own tile, or it bleeds into the neighbour
    // when the atlas is sampled with a linear filter.
    const length = TILE * (0.055 + rnd() * 0.06);
    if (x < ox + length || x > ox + TILE - length || y < oy + length || y > oy + TILE - length) continue;

    // Depth in the canopy: leaves drawn first sit behind and are darker, the
    // way a real canopy loses light toward its middle.
    const depth = i / count;
    // Blue-green, not lime. Garden shrubs sit around a hue of 100-130; the
    // yellow end of green belongs to new spring growth and to plastic.
    const hue = 96 + rnd() * 36 - depth * 8;
    const sat = 20 + rnd() * 20 + depth * 8;
    // The map carries the colour, so it is drawn at the lightness a leaf
    // actually has in daylight. Drawn dark it reads as a dead hedge once the
    // material tint, the occlusion and the shading have each taken a share.
    const light = (25 + rnd() * 13) * (0.72 + depth * 0.54);
    leaf(ctx, x, y, length, rnd() * Math.PI * 2, hue, light, sat);
  }
}

/**
 * The leaf atlas. One texture for every plant on the site: the cards vary by
 * which tile they take and how they are turned, not by having their own map.
 */
export function leafAtlas(): THREE.CanvasTexture {
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    let seed = 1471;
    for (let ty = 0; ty < LEAF_TILES; ty++) {
      for (let tx = 0; tx < LEAF_TILES; tx++) {
        cluster(ctx, tx * TILE, ty * TILE, (seed += 977));
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  cached = texture;
  return texture;
}

/**
 * Turn a material that was shading solid lobes into one that shades cards.
 *
 * Applied from outside rather than written into the material library, because
 * the atlas is geometry's business: it exists to give `house.ts` something to
 * cut the cards out of, and the library has no other use for it.
 */
export function applyLeafAtlas(material: THREE.MeshStandardMaterial): void {
  const atlas = leafAtlas();
  material.map = atlas;
  // Not `alphaMap`: three reads that from the GREEN channel, so handing it a
  // texture whose transparency lives in the alpha channel cuts the plants out
  // by how green they are — which, for leaves, removes all of them. `map`
  // already multiplies the fragment's alpha by the texture's own.
  material.alphaMap = null;
  material.alphaTest = 0.5;
  material.transparent = false;
  material.side = THREE.DoubleSide;
  // Cards are flat, so a lit card and the card behind it would otherwise be
  // two clearly different greens. Flat shading is off and the normals come
  // from the cluster, so what is left is to stop the sheen reading as plastic.
  // Near-white, because the atlas is already green. Left at the material
  // library's own green the leaves are tinted twice and go black.
  material.color.setHex(0xe8eee0);
  material.roughness = 0.88;
  material.metalness = 0;
  material.flatShading = false;
  material.needsUpdate = true;
}
