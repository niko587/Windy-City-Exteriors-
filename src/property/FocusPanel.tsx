/**
 * The contextual panel that arrives with a service focus.
 *
 * It enters after the camera has committed to the move rather than at the same
 * instant, so the two read as one coordinated transition instead of two
 * animations that happened to fire together.
 */

import { Link } from 'react-router-dom';
import { focusNotes } from './services';
import { experience, useExperience } from './store';

export function FocusPanel(): React.JSX.Element {
  const mode = useExperience((s) => s.mode);
  const focus = useExperience((s) => s.focus);
  const progress = useExperience((s) => s.progress);

  const open = mode === 'focus' && !!focus && progress > 0.45;
  const note = focus ? focusNotes[focus] : null;

  return (
    <aside className="panel" data-open={open} aria-hidden={!open} aria-label="Service detail">
      {note && (
        <>
          <div className="panel__head">
            <div>
              <p className="panel__kicker">{note.kicker}</p>
              <h3>{note.title}</h3>
            </div>
            <button
              type="button"
              className="panel__close"
              tabIndex={open ? 0 : -1}
              aria-label="Return to the whole property"
              onClick={() => experience.reset()}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <p className="panel__body">{note.body}</p>

          <ul className="panel__points">
            {note.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>

          <div className="panel__actions">
            {focus === 'siding' ? (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                tabIndex={open ? 0 : -1}
                onClick={() => experience.enterTransform()}
              >
                <span>See it replaced</span>
                <span className="btn-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ) : (
              <Link className="btn btn--navy btn--sm" to="/estimate" tabIndex={open ? 0 : -1}>
                <span>Get an estimate</span>
              </Link>
            )}
            <a className="btn btn--sm" href="#services" tabIndex={open ? 0 : -1}>
              <span>Read the detail</span>
            </a>
          </div>
        </>
      )}
    </aside>
  );
}
