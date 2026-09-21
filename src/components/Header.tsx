import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { company, navLinks } from '../content';
import { useExperience } from '../property/store';
import { Brand } from './Brand';

/**
 * Transparent over the property, solid once the page scrolls under it.
 * The mobile sheet is a real dialog: focus moves into it and Escape closes it.
 */
export function Header(): React.JSX.Element {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  /**
   * The wall stage drops the scene to near black under a transparent header,
   * which leaves navy links on black and the supplied mark all but invisible.
   * Going solid is the one treatment that fixes both without touching the
   * artwork: every element keeps the background it was drawn for.
   */
  const onStage = useExperience((s) => s.mode === 'wall');
  const location = useLocation();
  const burger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        burger.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header className={`header${solid || open || onStage ? ' header--solid' : ''}`}>
        <div className="header__inner">
          <Brand size={36} />

          <nav className="header__nav" aria-label="Primary">
            {navLinks.map((l) => (
              <NavLink key={l.to} className="navitem" to={l.to}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="header__actions">
            <a className="header__phone" href={company.phoneHref}>
              {company.phoneDisplay}
            </a>
            <Link className="btn btn--primary btn--sm" to="/estimate">
              <span>Free estimate</span>
              <span className="btn-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          </div>

          <button
            ref={burger}
            type="button"
            className="burger"
            aria-expanded={open}
            aria-controls="wce-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
          </button>
        </div>
      </header>

      <div id="wce-mobile-nav" className="mobilenav" data-open={open} hidden={!open}>
        {navLinks.map((l) => (
          <Link key={l.to} to={l.to}>
            {l.label}
          </Link>
        ))}
        <div className="mobilenav__actions">
          <Link className="btn btn--primary" to="/estimate">
            <span>Free estimate</span>
          </Link>
          <a className="btn" href={company.phoneHref}>
            <span>Call or text {company.phoneDisplay}</span>
          </a>
        </div>
      </div>
    </>
  );
}
