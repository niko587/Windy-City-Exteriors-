/**
 * Experience state for the interactive property.
 *
 * Deliberately not React context: the before/after handle writes `split` on
 * every pointer move, and the camera rig writes travel progress every frame.
 * A tiny external store with `useSyncExternalStore` lets each piece of UI
 * subscribe to only what it draws, so dragging the comparison handle never
 * re-renders the service rail.
 */

import { useSyncExternalStore } from 'react';
import type { ServiceFocus } from './services';
import type { LayerKey } from './wallLayers';

export type ExperienceMode = 'boot' | 'intro' | 'overview' | 'explore' | 'focus' | 'transform' | 'wall';

/** The layers of the wall assembly, inside out. Defined with their copy. */
export type WallLayer = LayerKey;

export interface ExperienceState {
  mode: ExperienceMode;
  focus: ServiceFocus | null;
  hovered: ServiceFocus | null;
  /** Divider position across the frame: the existing house is drawn to its
   *  left, the replacement to its right. 0 therefore shows the finished work
   *  edge to edge, 1 shows the house exactly as it stands today. */
  split: number;
  /** True while the camera is running a scripted move. */
  traveling: boolean;
  /** 0–1 progress of the current move, for the transition cue. */
  progress: number;
  /** The viewer has grabbed the model; scripted movement has yielded. */
  manual: boolean;
  /** Geometry built, first frame presented. */
  ready: boolean;
  /** WebGL unavailable or the context was lost. */
  failed: boolean;
  reducedMotion: boolean;
  compact: boolean;
  quality: 1 | 2 | 3;
  /** Id from `sidingColours.ts`; the renderer repaints when it changes. */
  sidingColour: string;
  /** Cladding profile id; the renderer swaps the maps when it changes. */
  sidingProfile: string;
  /** 0 = the wall is assembled, 1 = the layers are fully separated. */
  wallSeparation: number;
  /** The layer being inspected, or null for the whole assembly. */
  wallLayer: WallLayer | null;
}

const initial: ExperienceState = {
  mode: 'boot',
  focus: null,
  hovered: null,
  split: 0.5,
  traveling: false,
  progress: 1,
  manual: false,
  ready: false,
  failed: false,
  reducedMotion: false,
  compact: false,
  quality: 3,
  sidingColour: 'harbor',
  sidingProfile: 'lap',
  wallSeparation: 0,
  wallLayer: null,
};

let state: ExperienceState = initial;
const listeners = new Set<() => void>();

function set(patch: Partial<ExperienceState>): void {
  let changed = false;
  for (const k of Object.keys(patch) as (keyof ExperienceState)[]) {
    if (state[k] !== patch[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState(): ExperienceState {
  return state;
}

export function useExperience<T>(select: (s: ExperienceState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(initial),
  );
}

/* -- transitions ---------------------------------------------------------- */

export const experience = {
  /** Called once the property has finished building. */
  ready(reducedMotion: boolean) {
    set({
      ready: true,
      reducedMotion,
      mode: reducedMotion ? 'overview' : 'intro',
      progress: reducedMotion ? 1 : 0,
      traveling: !reducedMotion,
    });
  },

  fail() {
    set({ failed: true, ready: true });
  },

  introComplete() {
    if (state.mode === 'intro') set({ mode: 'overview', traveling: false, progress: 1 });
  },

  /** Any pointer or key during the intro drops the viewer straight into control. */
  skipIntro() {
    if (state.mode === 'intro') set({ mode: 'overview', traveling: false, progress: 1 });
  },

  selectFocus(focus: ServiceFocus) {
    if (state.mode === 'wall') {
      set({ mode: 'focus', focus, manual: false, traveling: true, progress: 0, wallSeparation: 0, wallLayer: null });
      return;
    }
    if (state.mode === 'transform' && focus !== 'siding') {
      set({ mode: 'focus', focus, manual: false, traveling: true, progress: 0 });
      return;
    }
    if (state.focus === focus && state.mode === 'focus') return;
    set({ mode: 'focus', focus, manual: false, traveling: true, progress: 0 });
  },

  enterTransform() {
    set({ mode: 'transform', focus: 'siding', manual: false, traveling: true, progress: 0, split: 0.5 });
  },

  exitTransform() {
    set({ mode: 'focus', focus: 'siding', manual: false, traveling: true, progress: 0 });
  },

  toggleExplore() {
    if (state.mode === 'explore') {
      set({ mode: 'overview', focus: null, manual: false, traveling: true, progress: 0 });
    } else {
      set({ mode: 'explore', focus: null, manual: false, traveling: true, progress: 0 });
    }
  },

  reset() {
    if (state.mode === 'overview' && !state.manual && !state.focus) return;
    set({
      mode: 'overview',
      focus: null,
      manual: false,
      traveling: true,
      progress: 0,
      wallSeparation: 0,
      wallLayer: null,
    });
  },

  setSplit(split: number) {
    set({ split: Math.min(1, Math.max(0, split)) });
  },

  hover(hovered: ServiceFocus | null) {
    set({ hovered });
  },

  /** The rig reports every frame while a move runs. */
  travel(progress: number) {
    set({ progress, traveling: progress < 1 });
  },

  /** Orbiting during a scripted move cancels it cleanly rather than fighting it. */
  takeControl() {
    if (state.mode === 'intro') {
      set({ mode: 'overview', traveling: false, progress: 1, manual: true });
      return;
    }
    set({ manual: true, traveling: false, progress: 1 });
  },

  setCompact(compact: boolean) {
    set({ compact });
  },

  setReducedMotion(reducedMotion: boolean) {
    set({ reducedMotion });
  },

  setQuality(quality: 1 | 2 | 3) {
    set({ quality });
  },

  setSidingColour(sidingColour: string) {
    set({ sidingColour });
  },

  setSidingProfile(sidingProfile: string) {
    set({ sidingProfile });
  },

  /* -- the wall assembly ------------------------------------------------- */

  /**
   * Entering separates the layers straight away: an assembled wall on a dark
   * stage says nothing, and the viewer asked to look inside it.
   */
  enterWall() {
    set({
      mode: 'wall',
      focus: null,
      hovered: null,
      manual: false,
      traveling: true,
      progress: 0,
      wallSeparation: 1,
      wallLayer: null,
    });
  },

  exitWall() {
    if (state.mode !== 'wall') return;
    set({
      mode: 'transform',
      focus: 'siding',
      manual: false,
      traveling: true,
      progress: 0,
      wallSeparation: 0,
      wallLayer: null,
    });
  },

  selectWallLayer(wallLayer: WallLayer | null) {
    if (state.mode !== 'wall') return;
    set({ wallLayer, wallSeparation: 1 });
  },

  /** Closing the assembly is how the viewer sees the layers belong together. */
  setWallSeparation(wallSeparation: number) {
    set({ wallSeparation: Math.min(1, Math.max(0, wallSeparation)) });
  },

  /** Used by tests and by remounts. */
  reset_all() {
    state = initial;
    for (const l of listeners) l();
  },
};

/** Which orbit envelope applies to the current mode. */
export function limitKeyFor(s: ExperienceState): 'free' | 'guided' | 'locked' | 'stage' {
  if (s.mode === 'transform') return 'locked';
  if (s.mode === 'wall') return 'stage';
  if (s.mode === 'explore') return 'free';
  return 'guided';
}

/** Which camera composition the current state asks for. */
export function compositionKeyFor(
  s: ExperienceState,
): 'approach' | 'overview' | 'explore' | 'wall' | ServiceFocus {
  if (s.mode === 'intro') return 'approach';
  if (s.mode === 'wall') return 'wall';
  if (s.mode === 'explore') return 'explore';
  if (s.mode === 'transform') return 'siding';
  if (s.mode === 'focus' && s.focus) return s.focus;
  return 'overview';
}
