import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildProperty } from './house';
import { bay, bay_ridgeY, garage, garage_ridgeY, main, main_ridgeY, porch_peakY } from './dims';

const built = buildProperty();

describe('the property builds', () => {
  it('produces geometry for every surface the house needs', () => {
    for (const key of ['siding', 'trim', 'roof', 'glass', 'stone', 'gutter', 'deck', 'lawn', 'flatwork']) {
      const g = built.geometries.get(key as never);
      expect(g, key).toBeDefined();
      expect(g!.attributes.position.count, key).toBeGreaterThan(0);
    }
  });

  it('contains no NaN positions', () => {
    for (const [key, g] of built.geometries) {
      const a = g.attributes.position.array as ArrayLike<number>;
      let bad = 0;
      for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
      expect(bad, key).toBe(0);
    }
  });

  it('stays inside a believable envelope for a two-storey suburban house', () => {
    // The envelope is the building's, so planting is excluded rather than
    // merely hoped to be short: a treeline is taller than a house, and the
    // whole-scene bounds would otherwise be measuring the landscape.
    const planting = new Set(['lawn', 'mulch', 'shrub', 'foliage', 'bark']);
    const envelope = new THREE.Box3();
    for (const [key, g] of built.geometries) {
      if (planting.has(key)) continue;
      g.computeBoundingBox();
      if (g.boundingBox) envelope.union(g.boundingBox);
    }

    expect(envelope.max.y).toBeGreaterThan(main_ridgeY);
    expect(envelope.max.y).toBeLessThan(main_ridgeY + 1.5);
    expect(envelope.min.y).toBeGreaterThanOrEqual(-0.2);

    // Nothing on the site, planting included, towers over the house. Planting
    // is allowed below grade — the leaf cards a shrub is built from bed into
    // the mulch rather than balancing on it — but only by a hand's width.
    expect(built.bounds.max.y).toBeLessThan(main_ridgeY * 2.4);
    expect(built.bounds.min.y).toBeGreaterThanOrEqual(-0.7);
  });

  it('keeps the roof geometry consistent with the walls it sits on', () => {
    // 8:12 over a 8 m deep block puts the ridge a shade under 8.4 m.
    expect(main_ridgeY).toBeCloseTo(main.eave + 4 * (8 / 12), 5);
    expect(main_ridgeY).toBeGreaterThan(8.2);
    expect(main_ridgeY).toBeLessThan(8.6);

    // Subordinate masses have to stay under the main ridge, or the massing reads wrong.
    expect(bay_ridgeY).toBeLessThan(main_ridgeY - 1);
    expect(garage_ridgeY).toBeLessThan(main_ridgeY - 2.5);
    expect(garage_ridgeY).toBeLessThan(main.eave);
    expect(porch_peakY).toBeLessThan(main.yMid + 0.8);

    // The bay projects in front of the main wall and sits within its width.
    expect(bay.zF).toBeGreaterThan(main.zF);
    expect(bay.xL).toBeGreaterThan(main.xL);
    expect(bay.xR).toBeLessThanOrEqual(main.xR);

    // The garage is recessed behind the front wall, never a snout.
    expect(garage.zF).toBeLessThan(main.zF);
  });

  it('is cheap enough to render twice per frame', () => {
    expect(built.triangles).toBeGreaterThan(8000);
    expect(built.triangles).toBeLessThan(260000);
    // One draw call per material, not per architectural element.
    expect(built.geometries.size).toBeLessThanOrEqual(24);
  });
});
