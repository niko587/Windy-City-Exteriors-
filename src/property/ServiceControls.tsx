/**
 * The service rail and the mode controls.
 *
 * One row of tracked capitals along the bottom, as in the approved direction.
 * Selecting a service is the single entry point into the guided experience:
 * the rail, the hotspots and the keyboard all route through
 * `experience.selectFocus`, so the camera, the panel and the emphasis can
 * never disagree about what is selected.
 */

import { Link } from 'react-router-dom';
import { serviceFocusOrder, type ServiceFocus } from './services';
import { experience, useExperience } from './store';

const LABELS: Record<ServiceFocus, string> = {
  siding: 'Siding',
  windows: 'Windows',
  doors: 'Doors',
  decks: 'Decks',
  gutters: 'Gutters',
};

export function ServiceControls(): React.JSX.Element {
  const focus = useExperience((s) => s.focus);
  const mode = useExperience((s) => s.mode);
  const progress = useExperience((s) => s.progress);
  const traveling = useExperience((s) => s.traveling);

  const exploring = mode === 'explore';
  const atRest = mode === 'overview' && !focus;

  return (
    <div className="rail">
      <div className="rail__items" role="group" aria-label="Explore a service on the property">
        {serviceFocusOrder.map((id) => (
          <button
            key={id}
            type="button"
            className="rail__btn"
            data-active={focus === id}
            aria-pressed={focus === id}
            onClick={() => experience.selectFocus(id)}
            onPointerEnter={() => experience.hover(id)}
            onPointerLeave={() => experience.hover(null)}
          >
            {LABELS[id]}
          </button>
        ))}
        <span className="rail__sep" aria-hidden="true" />
        <Link className="rail__btn" to="/#services" onClick={() => experience.hover(null)}>
          Interiors
        </Link>
      </div>

      <div className="rail__tools">
        <button
          type="button"
          className="pillbtn"
          data-active={exploring}
          aria-pressed={exploring}
          onClick={() => experience.toggleExplore()}
        >
          <span className="pillbtn__dot" aria-hidden="true" />
          {exploring ? 'Exploring' : 'Explore'}
        </button>
        <button type="button" className="pillbtn" onClick={() => experience.reset()} disabled={atRest}>
          Reset view
        </button>
      </div>

      {/* Travel cue: the only thing that tells you the camera is still moving. */}
      <div className="travelbar" aria-hidden="true">
        <span
          style={{
            transform: `scaleX(${traveling ? progress : 1})`,
            opacity: traveling ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}
