import { Link } from 'react-router-dom';
import { company, services } from '../content';
import { Brand } from './Brand';

export function Footer(): React.JSX.Element {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer__grid">
          <div>
            <Brand variant="full" size={104} to="/" />
            <p style={{ maxWidth: '34ch', marginTop: 22, color: 'rgba(244,239,230,0.72)' }}>
              {company.estimatePromise} {company.serviceArea}
            </p>
          </div>

          <div>
            <h4>Exterior</h4>
            <ul>
              {services
                .filter((s) => s.category === 'Exterior')
                .map((s) => (
                  <li key={s.id}>
                    <a href={`#service-${s.id}`}>{s.name}</a>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h4>Interior</h4>
            <ul>
              {services
                .filter((s) => s.category === 'Interior')
                .map((s) => (
                  <li key={s.id}>
                    <a href={`#service-${s.id}`}>{s.name}</a>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h4>Get in touch</h4>
            <ul>
              <li>
                <a href={company.phoneHref}>{company.phoneDisplay}</a>
              </li>
              <li>
                <a href={company.smsHref}>Send a text</a>
              </li>
              <li>
                <a href={company.emailHref}>{company.email}</a>
              </li>
              <li>
                <Link to="/estimate">Request an estimate</Link>
              </li>
              <li>
                <a href={company.googleUrl} target="_blank" rel="noreferrer noopener">
                  Google profile
                </a>
              </li>
              <li>
                <a href={company.facebookUrl} target="_blank" rel="noreferrer noopener">
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <span>
            {company.name} · {company.base}
          </span>
          <span>
            Prototype. 3D scenes are illustrative demonstrations, not photographs of completed customer projects.
          </span>
        </div>
      </div>
    </footer>
  );
}
