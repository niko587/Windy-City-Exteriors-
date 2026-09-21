import { Link } from 'react-router-dom';
import { Reveal } from '../components/Reveal';
import { company, gallerySlots, services } from '../content';
import { ClosingCta, DemoShot } from './Home';
import './home.css';

export function Projects(): React.JSX.Element {
  return (
    <>
      <header className="pagehead">
        <div className="shell pagehead__inner">
          <p className="eyebrow eyebrow--accent">Our work</p>
          <h1>Demonstrations now. Real projects when they are photographed.</h1>
          <p className="lede">
            We would rather show you nothing than show you someone else&rsquo;s house. Every image on this page is a
            view of the interactive property built for this prototype, and it is labelled that way.
          </p>
        </div>
      </header>

      <section className="section shell">
        <div className="gallery">
          {gallerySlots.map((g) => (
            <DemoShot key={g.id} title={g.title} service={g.service} size={g.size} still={g.still} />
          ))}
        </div>
      </section>

      <section className="section section--tight shell">
        <div className="values">
          <Reveal className="section__head" style={{ marginBottom: 0 }}>
            <p className="eyebrow eyebrow--accent">What goes here next</p>
            <h2 className="display-m">A gallery worth scrolling.</h2>
            <p className="lede">
              The layout is built and waiting. As jobs are photographed with the homeowner&rsquo;s permission, each one
              drops in with the trades involved, the town and a before and after on the same elevation.
            </p>
          </Reveal>

          <Reveal className="values__list" delay={80}>
            {services
              .filter((s) => s.category === 'Exterior')
              .map((s, i) => (
                <div className="value" key={s.id}>
                  <span className="value__no">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{s.name}</h3>
                    <p>{s.summary}</p>
                  </div>
                </div>
              ))}
          </Reveal>
        </div>

        <p className="lede" style={{ marginTop: 34 }}>
          In the meantime, the reviews on{' '}
          <a className="tlink" href={company.googleUrl} target="_blank" rel="noreferrer noopener">
            Google
          </a>{' '}
          and{' '}
          <a className="tlink" href={company.facebookUrl} target="_blank" rel="noreferrer noopener">
            Facebook
          </a>{' '}
          are written by people we have actually worked for. Or{' '}
          <Link className="tlink" to="/">
            go back and take the property apart
          </Link>
          .
        </p>
      </section>

      <ClosingCta />
    </>
  );
}
