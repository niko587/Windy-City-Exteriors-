/**
 * Architectural hotspots.
 *
 * Real buttons in the DOM — focusable, labelled, keyboard reachable — placed
 * each frame from the projection the renderer publishes. They are numbered red
 * discs, as in the approved direction, and they never carry navigation on their
 * own: everything they do is also on the service rail.
 */

import { useEffect, useRef } from 'react';
import { projected } from './hotspotProjection';
import { hotspots } from './services';
import { experience, useExperience } from './store';

export function ServiceHotspots(): React.JSX.Element | null {
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const mode = useExperience((s) => s.mode);
  const focus = useExperience((s) => s.focus);
  const ready = useExperience((s) => s.ready);
  const compact = useExperience((s) => s.compact);

  // Hidden while the camera is establishing the shot and during the
  // comparison, where anything on the wall would read as part of the render.
  // On a phone the opening shot is mostly headline, so the discs would land on
  // the copy rather than on the building: there they wait for the viewer to
  // start exploring.
  const shown =
    ready && (mode === 'explore' || mode === 'focus' || (mode === 'overview' && !compact));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      for (let i = 0; i < nodes.current.length; i++) {
        const el = nodes.current[i];
        const p = projected[i];
        if (!el || !p) continue;
        const visible = shown ? p.visible : 0;
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${p.scale})`;
        el.style.opacity = String(visible);
        el.style.visibility = visible < 0.02 ? 'hidden' : 'visible';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  return (
    <div className="hotspots" aria-hidden={!shown}>
      {hotspots.map((h, i) => (
        <div
          key={h.id}
          className="hotspot"
          data-active={focus === h.id}
          ref={(el) => {
            nodes.current[i] = el;
          }}
        >
          <button
            type="button"
            className="hotspot__btn"
            tabIndex={shown ? 0 : -1}
            aria-label={`${h.label}: ${h.note}. Move the camera to this part of the property.`}
            onClick={() => experience.selectFocus(h.id)}
            onPointerEnter={() => experience.hover(h.id)}
            onPointerLeave={() => experience.hover(null)}
            onFocus={() => experience.hover(h.id)}
            onBlur={() => experience.hover(null)}
          >
            {i + 1}
          </button>
          <span className="hotspot__label" aria-hidden="true">
            <b>{h.label}</b>
            <span>{h.note}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
