/**
 * Shared channel between the renderer and the DOM hotspot layer.
 *
 * Hotspots are DOM, not sprites — they need real focus, real hover and real
 * accessible names. So the scene projects their world anchors to screen space
 * each frame into this plain array, and the overlay writes transforms straight
 * onto the elements in its own animation frame. Nothing here goes through
 * React state, which is what keeps five labels from re-rendering the page at
 * 60 Hz. Deliberately free of Three.js so the page shell never loads it.
 */

import { hotspots } from './services';

export interface Projected {
  x: number;
  y: number;
  /** 0 when the anchor faces away or is behind the camera. */
  visible: number;
  /** Nearer anchors read slightly larger. */
  scale: number;
}

export const projected: Projected[] = hotspots.map(() => ({ x: 0, y: 0, visible: 0, scale: 1 }));
