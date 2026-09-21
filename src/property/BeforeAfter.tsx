/**
 * The siding comparison.
 *
 * The drag surface covers the whole stage, the divider is drawn at the same
 * fraction the renderer scissors at, and the finish swatches repaint only the
 * renovated side. There is no `<input type=range>` in the visible control — but
 * there is one, visually hidden and fully operable, so the comparison is
 * reachable by keyboard and by assistive technology without a drag.
 */

import { useCallback, useEffect, useRef } from 'react';
import { SIDING_COLORS } from './sidingColours';
import { experience, useExperience } from './store';

function Chevrons(): React.JSX.Element {
  return (
    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true">
      <path d="M7.4 1.6 2.4 7l5 5.4M14.6 1.6 19.6 7l-5 5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BeforeAfter(): React.JSX.Element {
  const open = useExperience((s) => s.mode === 'transform');
  const split = useExperience((s) => s.split);
  const colour = useExperience((s) => s.sidingColour);
  const surface = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const el = surface.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    experience.setSplit((clientX - r.left) / r.width);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = surface.current;
    if (!el) return;

    const down = (e: PointerEvent) => {
      dragging.current = true;
      root.current?.setAttribute('data-dragging', 'true');
      el.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
      e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      setFromClientX(e.clientX);
      e.stopPropagation();
    };
    const up = (e: PointerEvent) => {
      dragging.current = false;
      root.current?.setAttribute('data-dragging', 'false');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [open, setFromClientX]);

  // `split` is where the divider sits; what the viewer is being told is how
  // much of the frame is the finished work, which is the other way round.
  const after = Math.round((1 - split) * 100);

  return (
    <>
      <div className="compare" data-open={open} data-dragging="false" ref={root} aria-hidden={!open}>
        <div className="compare__surface" ref={surface} data-interactive />
        <span className="compare__tag compare__tag--before" style={{ opacity: split > 0.12 ? 1 : 0 }}>
          Before
        </span>
        <span className="compare__tag compare__tag--after" style={{ opacity: split < 0.88 ? 1 : 0 }}>
          After
        </span>
        <div className="compare__line" style={{ left: `${split * 100}%` }}>
          <button
            type="button"
            className="compare__handle"
            tabIndex={-1}
            aria-hidden="true"
            onPointerDown={(e) => {
              e.preventDefault();
              surface.current?.dispatchEvent(new PointerEvent('pointerdown', e.nativeEvent));
            }}
          >
            <Chevrons />
          </button>
        </div>
      </div>

      <div className="transform" data-open={open} aria-hidden={!open}>
        <div className="transform__top">
          <div className="transform__title">
            <b>Siding replacement</b>
            <span>Same wall · same light · same camera</span>
          </div>
          <div className="transform__readout" aria-hidden="true">
            {after < 4 ? 'Before' : after > 96 ? 'After' : `${after}% after`}
          </div>
        </div>

        <label className="sr-only" htmlFor="wce-compare">
          Comparison position. 0 per cent shows the existing siding, 100 per cent shows the completed replacement.
        </label>
        <input
          id="wce-compare"
          className="slider-native"
          type="range"
          min={0}
          max={100}
          step={1}
          value={after}
          tabIndex={open ? 0 : -1}
          data-interactive
          onChange={(e) => experience.setSplit(1 - Number(e.target.value) / 100)}
        />

        <div className="swatches" role="group" aria-label="Replacement siding finish">
          <span className="swatches__label">Finish</span>
          {SIDING_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="swatch"
              data-active={colour === c.id}
              aria-pressed={colour === c.id}
              style={{ background: c.hex }}
              tabIndex={open ? 0 : -1}
              aria-label={c.name}
              onClick={() => experience.setSidingColour(c.id)}
            >
              <span className="sr-only">{c.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="pillbtn"
            style={{ marginLeft: 'auto' }}
            tabIndex={open ? 0 : -1}
            onClick={() => experience.exitTransform()}
          >
            Leave comparison
          </button>
        </div>
      </div>
    </>
  );
}
