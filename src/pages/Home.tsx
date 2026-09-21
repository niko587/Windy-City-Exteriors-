import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal, useReveal } from '../components/Reveal';
import { company, gallerySlots, services, values } from '../content';
import { PropertyExperience } from '../property/PropertyExperience';
import './home.css';

/* ------------------------------------------------------------------ values */

function Positioning(): React.JSX.Element {
  return (
    <section className="section shell" id="company">
      <div className="values">
        <Reveal className="section__head" style={{ marginBottom: 0 }}>
          <p className="eyebrow eyebrow--accent">Why homeowners call us back</p>
          <h2 className="display-l">The people whose name is on the work.</h2>
          <p className="lede">
            {company.name} is family owned and owner operated, out of {company.base}. {company.estimatePromise}
          </p>
        </Reveal>

        <div className="values__list">
          {values.map((v, i) => (
            <Reveal key={v.title} className="value" delay={i * 70}>
              <span className="value__no">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------- craftsmanship study */

const LAYERS = [
  { id: 'studs', label: 'Framing', z: -200, stage: 1 },
  { id: 'sheathing', label: 'Sheathing', z: -120, stage: 1 },
  { id: 'wrap', label: 'Weather barrier', z: -48, stage: 1 },
  { id: 'siding', label: 'Siding', z: 32, stage: 0 },
  { id: 'trim', label: 'Window and trim', z: 112, stage: 2 },
] as const;

const FINISHES = [
  { id: 'harbor', name: 'Navy', hex: '#31415a' },
  { id: 'porcelain', name: 'Porcelain', hex: '#ddd8cd' },
  { id: 'sandstone', name: 'Sandstone', hex: '#b9ab93' },
] as const;

const STAGES = ['Exterior', 'Structure', 'Finishing'] as const;

function Craftsmanship(): React.JSX.Element {
  const [stage, setStage] = useState(0);
  const [finish, setFinish] = useState<string>(FINISHES[0].hex);
  const ref = useReveal<HTMLDivElement>(0.3);

  return (
    <section className="section craft" id="craft">
      <div className="shell craft__grid">
        <Reveal>
          <p className="eyebrow">Real materials</p>
          <h2 style={{ marginTop: 16 }}>
            Built right.
            <br />
            Down to the detail.
          </h2>
          <div className="craft__rule" />
          <p className="craft__lede">
            A wall is a stack of decisions. The barrier, the flashing and the fastening are the parts nobody sees and
            the parts that decide whether the finish still looks right in ten winters.
          </p>

          <div className="craft__steps" role="tablist" aria-label="Wall assembly stage">
            {STAGES.map((s, i) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={stage === i}
                className="craft__step"
                data-active={stage === i}
                onClick={() => setStage(i)}
              >
                <i aria-hidden="true" />
                {String(i + 1).padStart(2, '0')} {s}
              </button>
            ))}
          </div>

          <div className="craft__picker" role="group" aria-label="Siding finish preview">
            {FINISHES.map((f) => (
              <button
                key={f.id}
                type="button"
                className="craft__chip"
                data-active={finish === f.hex}
                onClick={() => setFinish(f.hex)}
              >
                <i style={{ background: f.hex }} aria-hidden="true" />
                {f.name}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="assembly" ref={ref} data-shown="false" aria-hidden="true">
          <div className="assembly__stack" style={{ ['--craft-siding' as string]: finish }}>
            {LAYERS.map((l) => (
              <div
                key={l.id}
                className={`layer layer--${l.id}`}
                data-dim={l.stage !== stage}
                style={{ transform: `translateZ(${l.z}px) translateX(${(l.z / 200) * 26}px)` }}
              >
                {l.id === 'wrap' && <span>Weather barrier</span>}
                <span className="layer__label">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- services */

function Services(): React.JSX.Element {
  return (
    <section className="section shell" id="services">
      <Reveal className="section__head">
        <p className="eyebrow eyebrow--accent">What we do</p>
        <h2 className="display-l">Exterior work, and the interior work that goes with it.</h2>
        <p className="lede">
          Five exterior trades plus selected interior work, so one contractor stays accountable from the estimate to
          the final walkthrough.
        </p>
      </Reveal>

      <div className="srv">
        {services.map((s, i) => (
          <Reveal key={s.id} className="srv__row" id={`service-${s.id}`} delay={Math.min(i, 4) * 50}>
            <span className="srv__no">{String(i + 1).padStart(2, '0')}</span>
            <div className="srv__name">
              <span className="srv__cat">{s.category}</span>
              <h3>{s.name}</h3>
              <p style={{ fontSize: 14.5, color: 'var(--slate)', maxWidth: '34ch' }}>{s.summary}</p>
            </div>
            <div className="srv__body">
              <p>{s.lead}</p>
              <ul className="srv__scope">
                {s.scope.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <div className="srv__actions">
                <Link className="btn btn--sm" to="/estimate">
                  <span>Get an estimate</span>
                </Link>
                {s.category === 'Exterior' && (
                  <a className="btn btn--sm btn--quiet" href="#property">
                    <span>See it on the property</span>
                    <span className="btn-arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- projects */

const SHOT_BG: Record<string, string> = {
  siding: 'linear-gradient(150deg, #47566e, #2c3a4f)',
  windows: 'linear-gradient(150deg, #dfe4ec, #b9c2cf)',
  doors: 'linear-gradient(150deg, #7d8798, #3c4757)',
  decks: 'linear-gradient(150deg, #c0a487, #8a7057)',
  gutters: 'linear-gradient(150deg, #e7e3da, #b6b3ab)',
};

export function DemoShot({
  title,
  service,
  size,
}: {
  title: string;
  service: string;
  size: 'wide' | 'tall' | 'std';
}): React.JSX.Element {
  return (
    <Reveal className={`shot shot--${size}`}>
      <span
        className="shot__art"
        style={{ ['--shot-bg' as string]: SHOT_BG[service] ?? SHOT_BG.windows }}
        aria-hidden="true"
      />
      <span className="shot__meta">
        <b>{title}</b>
        <span>Interactive demonstration</span>
      </span>
    </Reveal>
  );
}

function Projects(): React.JSX.Element {
  return (
    <section className="section shell" id="projects">
      <Reveal className="section__head">
        <p className="eyebrow eyebrow--accent">Our work</p>
        <h2 className="display-l">Prototype visualizations, labelled as such.</h2>
        <p className="lede">
          This prototype does not show photographs of finished customer projects. Everything below is a demonstration
          view of the interactive property, so nothing here claims to be something it is not.
        </p>
      </Reveal>

      <div className="gallery">
        {gallerySlots.map((g) => (
          <DemoShot key={g.id} title={g.title} service={g.service} size={g.size} />
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <Link className="tlink" to="/projects">
          More about how we will show real work →
        </Link>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- reviews */

function Reviews(): React.JSX.Element {
  return (
    <section className="section section--tight shell" id="reviews">
      <div className="reviews">
        <Reveal>
          <p className="eyebrow eyebrow--accent">Reviews</p>
          <h2 className="display-m" style={{ margin: '16px 0 18px' }}>
            Read them where they were written.
          </h2>
          <p className="lede">
            We are not going to print testimonials on our own website and ask you to take our word for it. The
            reviews live on Google and Facebook, under real names, and you can read them there.
          </p>
        </Reveal>

        <Reveal className="reviews__links" delay={90}>
          <a className="extlink" href={company.googleUrl} target="_blank" rel="noreferrer noopener">
            <span>
              <b>Google</b>
              <span>Reviews and directions</span>
            </span>
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          </a>
          <a className="extlink" href={company.facebookUrl} target="_blank" rel="noreferrer noopener">
            <span>
              <b>Facebook</b>
              <span>Recent posts and recommendations</span>
            </span>
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- CTA */

export function ClosingCta(): React.JSX.Element {
  return (
    <section className="section cta" id="contact">
      <div className="shell cta__grid">
        <Reveal>
          <p className="eyebrow">Start here</p>
          <h2 style={{ marginTop: 16 }}>
            Free, accurate,
            <br />
            same-day estimates.
          </h2>
          <div className="cta__actions">
            <Link className="btn btn--primary" to="/estimate">
              <span>Request an estimate</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </Link>
            <a className="btn" href={company.phoneHref}>
              <span>Call {company.phoneDisplay}</span>
            </a>
            <a className="btn" href={company.smsHref}>
              <span>Send a text</span>
            </a>
          </div>
        </Reveal>

        <Reveal className="cta__facts" delay={90}>
          <div className="cta__fact">
            <span>Based in</span>
            <b>{company.base}</b>
          </div>
          <div className="cta__fact">
            <span>Service area</span>
            <b style={{ maxWidth: '22ch' }}>{company.serviceArea}</b>
          </div>
          <div className="cta__fact">
            <span>Phone and text</span>
            <b>{company.phoneDisplay}</b>
          </div>
          <div className="cta__fact">
            <span>Email</span>
            <b>{company.email}</b>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function Home(): React.JSX.Element {
  return (
    <>
      <PropertyExperience />
      <Positioning />
      <Craftsmanship />
      <Services />
      <Projects />
      <Reviews />
      <ClosingCta />
    </>
  );
}
