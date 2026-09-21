import { Link } from 'react-router-dom';
import { company } from '../content';
import './home.css';

export function NotFound(): React.JSX.Element {
  return (
    <section className="pagehead" style={{ borderBottom: 0, minHeight: '68svh' }}>
      <div className="shell pagehead__inner">
        <p className="eyebrow eyebrow--accent">404</p>
        <h1>That page is not part of the prototype.</h1>
        <p className="lede">
          The property, the services, the projects page, the about page and the estimate walkthrough all exist. This
          did not.
        </p>
        <div className="hero__actions" style={{ marginTop: 10 }}>
          <Link className="btn btn--primary" to="/">
            <span>Back to the property</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
          <a className="btn" href={company.phoneHref}>
            <span>Call or text {company.phoneDisplay}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
