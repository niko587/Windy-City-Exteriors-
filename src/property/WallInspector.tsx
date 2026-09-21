/**
 * The wall inspection interface.
 *
 * Three pieces, deliberately separate: a veil that covers the handover between
 * the property and the stage, the labels that ride on the layers themselves,
 * and the panel that lists the assembly in build order.
 *
 * The panel is a dialog in every way that matters — it takes focus when it
 * opens, Escape steps back out of it, and focus returns to whatever opened it —
 * but it is not `aria-modal`, because the model behind it stays live and
 * orbitable by keyboard the whole time. Claiming modality would be a lie to a
 * screen reader about an interface that is still there.
 */

import { useEffect, useRef } from 'react';
import { experience, useExperience } from './store';
import { stagePresence, WALL_LAYERS, wallProjected, type LayerKey } from './wallLayers';

/** Covers the crossfade, so the house never pops out from under the stage. */
export function WallVeil(): React.JSX.Element {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const node = el.current;
      if (!node) return;
      // Opaque exactly at the halfway point, which is where the swap happens.
      const p = stagePresence.value;
      const v = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
      node.style.opacity = String(v * v);
      node.style.visibility = v < 0.01 ? 'hidden' : 'visible';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div className="wallveil" ref={el} aria-hidden="true" />;
}

/** The numbered flags that ride on the separated layers. */
export function WallLabels(): React.JSX.Element {
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const selected = useExperience((s) => s.wallLayer);
  const active = useExperience((s) => s.mode === 'wall');

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      for (let i = 0; i < nodes.current.length; i++) {
        const node = nodes.current[i];
        const p = wallProjected[i];
        if (!node || !p) continue;
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        // The leader is drawn by a pseudo-element hanging off the flag; its
        // length is the projected distance down to the layer's own top edge.
        node.style.setProperty('--stem', `${Math.round(p.stem)}px`);
        node.style.opacity = String(p.visible);
        node.style.visibility = p.visible < 0.02 ? 'hidden' : 'visible';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="walllabels" aria-hidden="true">
      {WALL_LAYERS.map((layer, i) => (
        <div
          key={layer.key}
          className="walllabel"
          data-active={active && selected === layer.key}
          data-dim={active && selected !== null && selected !== layer.key}
          ref={(node) => {
            nodes.current[i] = node;
          }}
        >
          <span className="walllabel__no">{layer.index}</span>
          <span className="walllabel__name">{layer.name}</span>
        </div>
      ))}
    </div>
  );
}

/** The panel: the assembly in build order, and what each layer is for. */
export function WallInspector(): React.JSX.Element {
  const open = useExperience((s) => s.mode === 'wall');
  const selected = useExperience((s) => s.wallLayer);
  const separation = useExperience((s) => s.wallSeparation);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  /* Focus in on open, back to the opener on close. */
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      const id = window.setTimeout(() => panel.current?.focus(), 260);
      return () => window.clearTimeout(id);
    }
    const back = returnTo.current;
    returnTo.current = null;
    if (back && document.contains(back)) back.focus();
    return undefined;
  }, [open]);

  /* Escape steps back one level: out of a layer, then out of the wall. */
  useEffect(() => {
    if (!open) return undefined;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (selected) experience.selectWallLayer(null);
      else experience.exitWall();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, selected]);

  const toggle = (key: LayerKey) => experience.selectWallLayer(selected === key ? null : key);
  const detail = WALL_LAYERS.find((l) => l.key === selected) ?? null;

  return (
    <section
      className="wallpanel"
      data-open={open}
      aria-hidden={!open}
      role="dialog"
      aria-label="Inside the wall: the assembly behind your siding"
      tabIndex={-1}
      ref={panel}
    >
      <div className="wallpanel__head">
        <div>
          <p className="wallpanel__kicker">Inside the wall</p>
          <h3>Five layers, one wall</h3>
        </div>
        <button
          type="button"
          className="panel__close"
          tabIndex={open ? 0 : -1}
          aria-label="Close the wall assembly and return to the siding studio"
          onClick={() => experience.exitWall()}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <p className="wallpanel__lede">
        A siding job is the outermost of these. Select a layer to bring it forward — the rest stay where
        they belong, in the order they go on.
      </p>

      <ol className="walllist">
        {WALL_LAYERS.map((layer) => (
          <li key={layer.key}>
            <button
              type="button"
              className="walllist__btn"
              data-active={selected === layer.key}
              aria-pressed={selected === layer.key}
              tabIndex={open ? 0 : -1}
              onClick={() => toggle(layer.key)}
            >
              <span className="walllist__no" aria-hidden="true">
                {layer.index}
              </span>
              <span className="walllist__text">
                <b>{layer.name}</b>
                <span>{layer.trade}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="wallpanel__blurb" aria-live="polite">
        {detail ? detail.blurb : 'Five layers, each doing one job. Nothing here is decorative.'}
      </p>

      <div className="wallpanel__foot">
        <label className="wallpanel__slider">
          <span className="sr-only">
            How far the assembly is separated. 0 per cent is a built wall, 100 per cent is fully exploded.
          </span>
          <input
            className="slider-native"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(separation * 100)}
            tabIndex={open ? 0 : -1}
            data-interactive
            onChange={(e) => experience.setWallSeparation(Number(e.target.value) / 100)}
          />
          <span className="wallpanel__ticks" aria-hidden="true">
            <span>Built</span>
            <span>Separated</span>
          </span>
        </label>
        <button
          type="button"
          className="pillbtn"
          tabIndex={open ? 0 : -1}
          onClick={() => experience.exitWall()}
        >
          Back to the studio
        </button>
      </div>
    </section>
  );
}
