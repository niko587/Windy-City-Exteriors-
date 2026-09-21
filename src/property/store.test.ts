import { beforeEach, describe, expect, it } from 'vitest';
import { compositionKeyFor, experience, getState, limitKeyFor } from './store';
import { composition, hotspots, limits, serviceFocusOrder } from './services';

beforeEach(() => experience.reset_all());

describe('experience state', () => {
  it('opens into the scripted approach and settles on the overview', () => {
    experience.ready(false);
    expect(getState().mode).toBe('intro');
    expect(compositionKeyFor(getState())).toBe('approach');

    experience.introComplete();
    expect(getState().mode).toBe('overview');
    expect(getState().traveling).toBe(false);
  });

  it('skips the opening entirely when reduced motion is requested', () => {
    experience.ready(true);
    expect(getState().mode).toBe('overview');
    expect(getState().traveling).toBe(false);
    expect(getState().progress).toBe(1);
  });

  it('routes every service to its own composition', () => {
    experience.ready(true);
    for (const id of serviceFocusOrder) {
      experience.selectFocus(id);
      expect(getState().mode).toBe('focus');
      expect(compositionKeyFor(getState())).toBe(id);
      expect(getState().traveling).toBe(true);
    }
  });

  it('locks the orbit down in the comparison and frees it in explore', () => {
    experience.ready(true);
    experience.selectFocus('siding');
    expect(limitKeyFor(getState())).toBe('guided');

    experience.enterTransform();
    expect(getState().mode).toBe('transform');
    expect(limitKeyFor(getState())).toBe('locked');
    expect(compositionKeyFor(getState())).toBe('siding');

    experience.toggleExplore();
    expect(limitKeyFor(getState())).toBe('free');
  });

  it('leaves the comparison when another service is chosen', () => {
    experience.ready(true);
    experience.enterTransform();
    experience.selectFocus('gutters');
    expect(getState().mode).toBe('focus');
    expect(getState().focus).toBe('gutters');
  });

  it('hands the camera over when the viewer grabs the model, and takes it back on reset', () => {
    experience.ready(true);
    experience.selectFocus('decks');
    experience.takeControl();
    expect(getState().manual).toBe(true);
    expect(getState().traveling).toBe(false);

    experience.reset();
    expect(getState().mode).toBe('overview');
    expect(getState().focus).toBeNull();
    expect(getState().manual).toBe(false);
    expect(getState().traveling).toBe(true);
  });

  it('clamps the comparison to 0–1', () => {
    experience.setSplit(-3);
    expect(getState().split).toBe(0);
    experience.setSplit(9);
    expect(getState().split).toBe(1);
    experience.setSplit(0.42);
    expect(getState().split).toBeCloseTo(0.42);
  });
});

describe('camera compositions', () => {
  const keys = ['approach', 'overview', 'explore', ...serviceFocusOrder] as const;

  it('are finite and sensibly framed on both layouts', () => {
    for (const key of keys) {
      for (const compact of [false, true]) {
        const c = composition(key, compact);
        expect(c.target.every(Number.isFinite), key).toBe(true);
        expect(c.distance).toBeGreaterThan(4);
        expect(c.distance).toBeLessThan(90);
        expect(c.fov).toBeGreaterThan(14);
        expect(c.fov).toBeLessThanOrEqual(52);
        // Never underground, never straight down.
        expect(c.polar).toBeGreaterThan(0.5);
        expect(c.polar).toBeLessThan(Math.PI - 0.5);
      }
    }
  });

  it('keeps the comparison composition inside the locked orbit envelope', () => {
    const c = composition('siding', false);
    expect(c.azimuth).toBeGreaterThanOrEqual(limits.locked.minAzimuth);
    expect(c.azimuth).toBeLessThanOrEqual(limits.locked.maxAzimuth);
    expect(c.polar).toBeGreaterThanOrEqual(limits.locked.minPolar);
    expect(c.polar).toBeLessThanOrEqual(limits.locked.maxPolar);
    expect(c.distance).toBeGreaterThanOrEqual(limits.locked.minDistance);
    expect(c.distance).toBeLessThanOrEqual(limits.locked.maxDistance);
  });

  it('gives every hotspot a service that the rail also offers', () => {
    expect(hotspots).toHaveLength(serviceFocusOrder.length);
    for (const h of hotspots) {
      expect(serviceFocusOrder).toContain(h.id);
      expect(h.at.every(Number.isFinite)).toBe(true);
    }
  });
});
