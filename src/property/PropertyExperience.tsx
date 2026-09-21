/**
 * The stage: everything the visitor meets in the first thirty seconds.
 *
 * Loads the renderer lazily so the rest of the site — and the test run — never
 * pays for Three.js, detects WebGL before mounting it at all, and layers the
 * interface over the canvas rather than inside it.
 */

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { company } from '../content';
import { BeforeAfter } from './BeforeAfter';
import { FocusPanel } from './FocusPanel';
import { PropertyFallback } from './PropertyFallback';
import { ServiceControls } from './ServiceControls';
import { ServiceHotspots } from './ServiceHotspots';
import { WallInspector, WallLabels, WallVeil } from './WallInspector';
import { experience, useExperience } from './store';
import './property.css';

const PropertyScene = lazy(() => import('./PropertyScene'));

function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return false;
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function Arrow(): React.JSX.Element {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none" aria-hidden="true">
      <path d="M1 6h14M10.5 1.2 15.4 6l-4.9 4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DragCue(): React.JSX.Element {
  return (
    <div className="dragcue" aria-hidden="true">
      <svg width="34" height="22" viewBox="0 0 34 22" fill="none">
        <path d="M3 15.5C6.4 8.6 11.4 5.2 17 5.2s10.6 3.4 14 10.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M13.4 2.2 17 5.3l-3.6 3.1M20.6 2.2 17 5.3l3.6 3.1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Drag to rotate
    </div>
  );
}

export function PropertyExperience(): React.JSX.Element {
  const [supported] = useState(hasWebGL);
  const [triangles, setTriangles] = useState(0);
  const ready = useExperience((s) => s.ready);
  const failed = useExperience((s) => s.failed);
  const mode = useExperience((s) => s.mode);
  const manual = useExperience((s) => s.manual);
  const compact = useExperience((s) => s.compact);
  const stage = useRef<HTMLElement>(null);

  /* Environment: reduced motion and compact layout both change the
     experience rather than merely styling it, so they live in the store. */
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const small = window.matchMedia('(max-width: 980px)');
    const sync = () => {
      experience.setReducedMotion(motion.matches);
      experience.setCompact(small.matches);
    };
    sync();
    motion.addEventListener('change', sync);
    small.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      small.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (!supported) experience.fail();
  }, [supported]);

  /* Any deliberate input during the opening drops straight into control. */
  useEffect(() => {
    if (mode !== 'intro') return;
    const skip = () => experience.skipIntro();
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [mode]);

  useEffect(() => () => experience.reset_all(), []);

  return (
    <section className="stage" id="property" ref={stage} data-mode={mode} data-manual={manual}>
      {supported && !failed && (
        <div className="stage__canvas">
          <Suspense fallback={null}>
            <PropertyScene onBuilt={setTriangles} />
          </Suspense>
        </div>
      )}

      <div className="stage__scrim" aria-hidden="true" />
      <div className="stage__sky" aria-hidden="true" />
      <div className="stage__floor" aria-hidden="true" />

      <div className="stage__ui">
        <div className="hero">
          <div className="hero__inner">
            <p className="hero__eyebrow">Family owned · {company.base}</p>
            <h1>
              <span>
                <i>Every detail.</i>
              </span>
              <span>
                <i>A better</i>
              </span>
              <span>
                <i>property.</i>
              </span>
            </h1>
            <p className="hero__lede">
              {compact
                ? 'Siding, windows, doors, decks and gutters — Lake Villa and across Chicagoland.'
                : 'Siding, windows, doors, decks and gutters for homeowners, property managers and commercial clients — in Lake Villa and across Chicagoland.'}
            </p>
            <div className="hero__actions">
              <button type="button" className="discbtn" onClick={() => experience.toggleExplore()}>
                <span className="discbtn__disc">
                  <Arrow />
                </span>
                <span className="discbtn__text">
                  <b>Explore the property</b>
                  <span>Drag to rotate</span>
                </span>
              </button>
              <Link className="btn btn--primary" to="/estimate">
                <span>Free estimate</span>
                <span className="btn-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
              <a className="tlink" href={company.phoneHref}>
                Call or text {company.phoneDisplay}
              </a>
            </div>
          </div>
        </div>

        <ServiceControls />
      </div>

      <ServiceHotspots />
      <FocusPanel />
      <BeforeAfter />
      <WallVeil />
      <WallLabels />
      <WallInspector />
      {supported && !failed && <DragCue />}

      <p className="demotag">
        Interactive demonstration · {triangles ? `${(triangles / 1000).toFixed(0)}k triangles` : 'prototype visualization'}
      </p>

      {supported && !failed && (
        <div className="stage__boot" data-done={ready}>
          <div className="boot">
            <img src={`${import.meta.env.BASE_URL}brand/wce-mark.png`} alt="" width="76" height="58" style={{ objectFit: 'contain', opacity: 0.9 }} />
            <span className="boot__bar">
              <i />
            </span>
            <span className="boot__label">Building the property</span>
          </div>
        </div>
      )}

      {(failed || !supported) && <PropertyFallback />}
    </section>
  );
}
