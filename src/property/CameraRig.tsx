/**
 * The camera is part of the interface.
 *
 * State is spherical — target, azimuth, polar, distance, field of view — and
 * every scripted move interpolates all five with an ease that accelerates out
 * of the old composition and settles into the new one, plus a small arc in
 * distance so a long travel pulls back before it pushes in. The viewer can
 * read the route, which is the point: they should always know where on the
 * house they just went.
 *
 * Orbit is damped and always live. Grabbing the model during a scripted move
 * hands control over immediately and cleanly rather than fighting the tween.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { composition, limits, type Composition } from './services';
import { compositionKeyFor, experience, getState, limitKeyFor, useExperience } from './store';

interface Orbit {
  target: THREE.Vector3;
  azimuth: number;
  polar: number;
  distance: number;
  fov: number;
}

function read(c: Composition): Orbit {
  return {
    target: new THREE.Vector3(...c.target),
    azimuth: c.azimuth,
    polar: c.polar,
    distance: c.distance,
    fov: c.fov,
  };
}

/** Smooth acceleration out and deceleration in, with a long tail. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Shortest signed angular difference. */
function shortest(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const DRAG_SPEED = 0.0052;
const DAMPING = 0.09;

/**
 * How far to slide the rendered frame sideways, as a fraction of viewport
 * width. The overview keeps the headline on the left and the house to the
 * right of it, as the approved direction does; a service focus does the
 * opposite so the detail panel is not sitting on the subject. Done with the
 * projection offset rather than by moving the camera, so the composition
 * itself never changes.
 */
/**
 * On a phone the headline owns the top of the stage, so the building is
 * pushed into the lower half rather than sitting behind the type.
 */
/**
 * Positive pushes the subject down the frame, negative lifts it — the same
 * convention as the sideways shift, where positive moves it right.
 */
function frameShiftY(mode: string, compact: boolean): number {
  if (!compact) return 0;
  // The headline owns the top of a phone screen, so the building sits below
  // it rather than behind it.
  if (mode === 'intro' || mode === 'overview') return 0.14;
  if (mode === 'explore') return 0.05;
  // The detail card is a bottom sheet, so the subject is lifted clear of it
  // instead of being explained from behind it.
  if (mode === 'focus' || mode === 'transform') return -0.1;
  return 0;
}

function frameShift(mode: string, compact: boolean): number {
  // A phone is too narrow to move the building sideways without cropping it;
  // there the copy and the subject are separated vertically instead.
  if (compact) return 0;
  if (mode === 'intro' || mode === 'overview') return 0.15;
  if (mode === 'explore') return 0.06;
  if (mode === 'focus') return -0.11;
  // The assembly stage has a panel down the right-hand side too.
  if (mode === 'wall') return -0.13;
  return 0;
}

export function CameraRig(): null {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const compact = useExperience((s) => s.compact);

  const current = useRef<Orbit>(read(composition('approach', compact)));
  const from = useRef<Orbit>(current.current);
  const to = useRef<Orbit>(current.current);
  const t = useRef(1);
  const duration = useRef(1);
  const arc = useRef(0);
  const velocity = useRef({ az: 0, polar: 0 });
  const dragging = useRef(false);
  const lastKey = useRef<string>('');
  const reported = useRef(-1);
  const shift = useRef(0);
  const shiftY = useRef(0);

  // A scene-graph-free helper so the pointer handlers stay out of React state.
  const grab = useRef({ x: 0, y: 0, active: false, moved: 0, pinch: 0 });

  const target = useExperience((s) => `${compositionKeyFor(s)}|${s.mode}`);
  const limitKey = useExperience((s) => limitKeyFor(s));
  const reduced = useExperience((s) => s.reducedMotion);
  const mode = useExperience((s) => s.mode);

  const bounds = useMemo(() => limits[limitKey], [limitKey]);

  /* -- scripted moves ---------------------------------------------------- */

  useEffect(() => {
    const key = compositionKeyFor(getState());
    if (lastKey.current === `${key}` && t.current >= 1) return;
    lastKey.current = key;

    const next = composition(key, compact);
    from.current = { ...current.current, target: current.current.target.clone() };
    to.current = read(next);

    const travelDistance = from.current.target.distanceTo(to.current.target);
    const swing = Math.abs(shortest(from.current.azimuth, to.current.azimuth));
    const effort = travelDistance / 12 + swing / 1.2;

    // Reset before the reduced-motion branch too, or the step filter below
    // swallows the one progress report a snapped move ever makes and the
    // panels never learn the move finished.
    reported.current = -1;

    if (reduced) {
      duration.current = 0.001;
      arc.current = 0;
      t.current = 0;
      return;
    }

    duration.current = THREE.MathUtils.clamp((next.travel ?? 1.6) * (0.65 + effort * 0.45), 0.7, 3.4);
    // Long moves rise away from the building and come back in; short ones do not.
    arc.current = THREE.MathUtils.clamp(effort * 0.14, 0, 0.26);
    t.current = 0;
    experience.travel(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, compact, reduced]);

  /* -- pointer, wheel and keyboard orbit --------------------------------- */

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = 'none';

    const stopScript = () => {
      if (t.current < 1) {
        // Freeze the tween where it is; the viewer now owns the camera.
        t.current = 1;
        from.current = { ...current.current, target: current.current.target.clone() };
        to.current = { ...current.current, target: current.current.target.clone() };
      }
      experience.takeControl();
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      grab.current = { x: e.clientX, y: e.clientY, active: true, moved: 0, pinch: 0 };
      dragging.current = true;
      el.setPointerCapture(e.pointerId);
    };

    const move = (e: PointerEvent) => {
      if (!grab.current.active) return;
      const dx = e.clientX - grab.current.x;
      const dy = e.clientY - grab.current.y;
      grab.current.x = e.clientX;
      grab.current.y = e.clientY;
      grab.current.moved += Math.abs(dx) + Math.abs(dy);
      if (grab.current.moved > 6) {
        if (t.current < 1 || getState().mode === 'intro') stopScript();
        velocity.current.az -= dx * DRAG_SPEED;
        velocity.current.polar -= dy * DRAG_SPEED * 0.72;
      }
    };

    const up = (e: PointerEvent) => {
      grab.current.active = false;
      dragging.current = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (t.current < 1) stopScript();
      const k = Math.exp(e.deltaY * 0.0012);
      current.current.distance = THREE.MathUtils.clamp(
        current.current.distance * k,
        bounds.minDistance,
        bounds.maxDistance,
      );
      to.current.distance = current.current.distance;
    };

    const key = (e: KeyboardEvent) => {
      const step = 0.14;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':
          velocity.current.az += step;
          break;
        case 'ArrowRight':
          velocity.current.az -= step;
          break;
        case 'ArrowUp':
          velocity.current.polar += step * 0.55;
          break;
        case 'ArrowDown':
          velocity.current.polar -= step * 0.55;
          break;
        case '+':
        case '=':
          current.current.distance = Math.max(bounds.minDistance, current.current.distance * 0.9);
          break;
        case '-':
        case '_':
          current.current.distance = Math.min(bounds.maxDistance, current.current.distance * 1.1);
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        if (t.current < 1) stopScript();
      }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('keydown', key);
    };
  }, [gl, bounds]);

  /* -- per-frame integration --------------------------------------------- */

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = current.current;

    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / duration.current);
      const e = ease(t.current);
      const f = from.current;
      const g = to.current;
      c.target.lerpVectors(f.target, g.target, e);
      c.azimuth = f.azimuth + shortest(f.azimuth, g.azimuth) * e;
      c.polar = THREE.MathUtils.lerp(f.polar, g.polar, e);
      const arced = 1 + Math.sin(Math.PI * e) * arc.current;
      c.distance = THREE.MathUtils.lerp(f.distance, g.distance, e) * arced;
      c.fov = THREE.MathUtils.lerp(f.fov, g.fov, e);
      // Progress is published in steps rather than every frame: two DOM panels
      // subscribe to it, and re-rendering them sixty times a second during the
      // one move that has to look smooth is the wrong trade. The travel bar
      // carries a short transition, so the steps are invisible.
      const step = t.current >= 1 ? 1 : Math.floor(t.current * 20) / 20;
      if (step !== reported.current) {
        reported.current = step;
        experience.travel(step);
      }
      if (t.current >= 1 && getState().mode === 'intro') experience.introComplete();
    } else {
      // Damped free orbit.
      c.azimuth += velocity.current.az;
      c.polar += velocity.current.polar;
      const k = dragging.current ? 0.55 : DAMPING;
      velocity.current.az *= 1 - k;
      velocity.current.polar *= 1 - k;
      if (Math.abs(velocity.current.az) < 1e-5) velocity.current.az = 0;
      if (Math.abs(velocity.current.polar) < 1e-5) velocity.current.polar = 0;

      // A barely-there drift keeps the overview alive without being motion for
      // its own sake. It stops the moment anyone touches the model.
      if (mode === 'overview' && !getState().manual && !reduced) {
        c.azimuth += dt * 0.0075;
      }
    }

    c.polar = THREE.MathUtils.clamp(c.polar, bounds.minPolar, bounds.maxPolar);
    if (bounds.maxAzimuth - bounds.minAzimuth < Math.PI * 1.9) {
      c.azimuth = THREE.MathUtils.clamp(c.azimuth, bounds.minAzimuth, bounds.maxAzimuth);
    }
    c.distance = THREE.MathUtils.clamp(c.distance, bounds.minDistance, bounds.maxDistance);

    // Ease the frame offset so switching modes slides rather than jumps.
    const wanted = frameShift(mode, compact);
    shift.current += (wanted - shift.current) * Math.min(1, dt * 3.4);
    const wantedY = frameShiftY(mode, compact);
    shiftY.current += (wantedY - shiftY.current) * Math.min(1, dt * 3.4);
    const { width, height } = size;
    if (width > 0 && height > 0) {
      if (Math.abs(shift.current) < 0.002 && Math.abs(shiftY.current) < 0.002) {
        if (camera.view?.enabled) camera.clearViewOffset();
      } else {
        camera.setViewOffset(width, height, -shift.current * width, -shiftY.current * height, width, height);
      }
    }

    const sp = Math.sin(c.polar);
    camera.position.set(
      c.target.x + c.distance * sp * Math.sin(c.azimuth),
      c.target.y + c.distance * Math.cos(c.polar),
      c.target.z + c.distance * sp * Math.cos(c.azimuth),
    );
    // Never let the eye drop below the lawn, whatever the viewer does.
    camera.position.y = Math.max(camera.position.y, 0.85);
    camera.lookAt(c.target);
    if (Math.abs(camera.fov - c.fov) > 0.001) {
      camera.fov = c.fov;
    }
    camera.updateProjectionMatrix();
  });

  return null;
}
