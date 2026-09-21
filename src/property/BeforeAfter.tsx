/**
 * The siding project studio.
 *
 * The comparison and the configuration are one thing, because they are one
 * thing to the person using them: the profile and the finish they pick are
 * what the right-hand side of the divider is wearing, and the summary under
 * them is the job that gets carried into the estimate.
 *
 * The drag surface covers the whole stage and the divider is drawn at the same
 * fraction the renderer scissors at. There is no `<input type=range>` in the
 * visible control — but there is one, visually hidden and fully operable, so
 * none of this needs a drag, a hover or a mouse.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { carryToEstimate } from '../estimate/handoff';
import { SIDING_COLORS } from './sidingColours';
import { SIDING_PROFILES } from './sidingProfiles';
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
  const profile = useExperience((s) => s.sidingProfile);
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

  const chosenProfile = SIDING_PROFILES.find((p) => p.id === profile) ?? SIDING_PROFILES[0];
  const chosenColour = SIDING_COLORS.find((c) => c.id === colour) ?? SIDING_COLORS[0];
  const specification = `${chosenProfile.name} siding in ${chosenColour.name}`;

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
            /* At the ends there is no seam to grab, and a handle half off the
               frame reads as a rendering fault rather than a control. */
            style={{ opacity: split < 0.02 || split > 0.98 ? 0 : 1 }}
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
            <b>Siding project studio</b>
            <span>Front-right elevation · same light, same camera</span>
          </div>
          <div className="transform__readout" aria-hidden="true">
            {after < 4 ? 'Before' : after > 96 ? 'After' : `${after}% after`}
          </div>
          <button
            type="button"
            className="panel__close"
            tabIndex={open ? 0 : -1}
            aria-label="Close the siding studio and return to the property"
            onClick={() => experience.exitTransform()}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <label className="sr-only" htmlFor="wce-compare">
          Comparison position. 0 per cent shows the existing siding, 100 per cent shows the completed
          replacement.
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

        <div className="chiprow" role="group" aria-label="Siding profile">
          <span className="chiprow__label">Profile</span>
          <div className="chiprow__items">
            {SIDING_PROFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                data-active={profile === p.id}
                aria-pressed={profile === p.id}
                tabIndex={open ? 0 : -1}
                aria-label={`${p.name} — ${p.note}`}
                onClick={() => experience.setSidingProfile(p.id)}
              >
                <span className="chip__face" data-profile={p.id} aria-hidden="true" />
                <span className="chip__text" aria-hidden="true">
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="chiprow" role="group" aria-label="Replacement siding finish">
          <span className="chiprow__label">Finish</span>
          <div className="chiprow__items">
            {SIDING_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip chip--finish"
                data-active={colour === c.id}
                aria-pressed={colour === c.id}
                tabIndex={open ? 0 : -1}
                aria-label={c.name}
                onClick={() => experience.setSidingColour(c.id)}
              >
                <span
                  className="chip__face chip__face--finish"
                  data-profile={profile}
                  aria-hidden="true"
                  style={
                    {
                      '--chip': c.hex,
                      '--chip-accent': c.accent,
                    } as React.CSSProperties
                  }
                />
                <span className="chip__text" aria-hidden="true">
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="studio__foot">
          <div className="studio__spec">
            <span className="studio__spec-label">Your project</span>
            <p>{specification}, front-right elevation</p>
          </div>
          <div className="studio__actions">
            <button
              type="button"
              className="pillbtn"
              tabIndex={open ? 0 : -1}
              onClick={() => experience.enterWall()}
            >
              Look inside the wall
            </button>
            <Link
              className="btn btn--primary btn--sm"
              to="/estimate"
              tabIndex={open ? 0 : -1}
              onClick={() =>
                carryToEstimate({
                  serviceIds: ['siding'],
                  details: `${specification}. Configured on the interactive property, front-right elevation.`,
                })
              }
            >
              <span>Continue to estimate</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <button
              type="button"
              className="pillbtn"
              tabIndex={open ? 0 : -1}
              onClick={() => experience.exitTransform()}
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
