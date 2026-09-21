/**
 * What the hero becomes when WebGL is unavailable or the context is lost.
 *
 * Not an apology and not a blank canvas: a drawn elevation of the same house,
 * with the same services, the same message and the same calls to action. A
 * visitor on a locked-down browser still gets a working page.
 */

import { Link } from 'react-router-dom';
import { company } from '../content';
import { serviceFocusOrder } from './services';

const LABELS: Record<string, string> = {
  siding: 'Siding',
  windows: 'Windows',
  doors: 'Doors',
  decks: 'Decks',
  gutters: 'Gutters',
};

/** A measured line elevation of the property, drawn to the same proportions. */
function Elevation(): React.JSX.Element {
  const line = 'rgba(8,42,92,0.55)';
  return (
    <svg viewBox="0 0 720 360" role="img" aria-label="Line elevation of a two-storey suburban home with an attached garage, gabled entry porch and projecting front gable.">
      <g fill="none" stroke={line} strokeWidth="1.1" strokeLinejoin="round">
        {/* ground */}
        <line x1="0" y1="318" x2="720" y2="318" stroke="rgba(8,42,92,0.25)" />

        {/* garage wing */}
        <path d="M74 318V196h150v122" fill="#eee7db" />
        <path d="M60 198 149 128l89 70" fill="#dfd6c6" stroke={line} />
        <rect x="100" y="228" width="98" height="90" fill="#1b2a41" stroke="none" />
        <g stroke="rgba(255,255,255,0.28)">
          <line x1="100" y1="250" x2="198" y2="250" />
          <line x1="100" y1="272" x2="198" y2="272" />
          <line x1="100" y1="294" x2="198" y2="294" />
        </g>

        {/* main block */}
        <path d="M238 318V150h250v168" fill="#f2ece1" />
        <path d="M228 152 363 46l135 106" fill="#dfd6c6" />

        {/* projecting bay */}
        <path d="M498 318V150h136v168" fill="#eee7db" />
        <path d="M486 152 566 90l80 62" fill="#d8cec0" />

        {/* stone base */}
        <rect x="74" y="300" width="560" height="18" fill="#cdc8be" stroke="none" />

        {/* windows */}
        <g fill="#233246" stroke="none">
          <rect x="268" y="188" width="34" height="46" />
          <rect x="330" y="188" width="34" height="46" />
          <rect x="268" y="252" width="72" height="50" />
          <rect x="522" y="186" width="32" height="46" />
          <rect x="578" y="186" width="32" height="46" />
          <rect x="526" y="248" width="82" height="54" />
          <rect x="550" y="124" width="30" height="22" />
        </g>

        {/* entry and porch */}
        <rect x="396" y="240" width="40" height="62" fill="#16233a" stroke="none" />
        <path d="M368 244 416 206l48 38" fill="#dfd6c6" />
        <line x1="372" y1="244" x2="372" y2="302" />
        <line x1="460" y1="244" x2="460" y2="302" />
        <line x1="360" y1="302" x2="472" y2="302" />

        {/* gutters */}
        <g stroke="rgba(8,42,92,0.4)">
          <line x1="228" y1="154" x2="486" y2="154" />
          <line x1="486" y1="154" x2="486" y2="300" />
          <line x1="646" y1="154" x2="646" y2="300" />
        </g>
      </g>
    </svg>
  );
}

export function PropertyFallback(): React.JSX.Element {
  return (
    <div className="fallback">
      <div className="fallback__inner">
        <div>
          <p className="hero__eyebrow">Family owned · {company.base}</p>
          <h1 className="display-l" style={{ marginBlock: '18px 20px' }}>
            Every detail. A better property.
          </h1>
          <p className="lede">
            Exterior remodeling for homeowners, property managers and commercial clients across{' '}
            {company.serviceArea.charAt(0).toLowerCase() + company.serviceArea.slice(1)}
          </p>
          <div className="hero__actions" style={{ marginTop: 28 }}>
            <Link className="btn btn--primary" to="/estimate">
              <span>Get a free estimate</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <a className="btn" href={company.phoneHref}>
              <span>Call or text {company.phoneDisplay}</span>
            </a>
          </div>
          <p className="fallback__note">
            {serviceFocusOrder.map((id) => LABELS[id]).join(' · ')} · Interiors
          </p>
          <p className="fallback__note">
            Interactive 3D is unavailable in this browser. Everything else on the site works normally.
          </p>
        </div>
        <Elevation />
      </div>
    </div>
  );
}
