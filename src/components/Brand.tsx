/**
 * The supplied mark, placed rather than redrawn.
 *
 * `public/brand/*.png` carry wide transparent margins, so each is shown
 * through a window sized to the artwork's measured bounding box (see the
 * `.brand__crop` rules). Aspect ratio is preserved exactly; nothing is
 * stretched, recoloured or traced. The company name beside the monogram is set
 * in the interface sans so it reads as a masthead label and never impersonates
 * the serif wordmark inside the logo itself.
 */

import { Link } from 'react-router-dom';

const base = import.meta.env.BASE_URL;

export interface BrandProps {
  /** 'mark' is the monogram for tight spaces; 'full' is the complete lockup. */
  variant?: 'mark' | 'full';
  /** Height of the artwork itself, in pixels. */
  size?: number;
  withName?: boolean;
  invert?: boolean;
  to?: string;
}

export function Brand({
  variant = 'mark',
  size,
  withName = true,
  invert = false,
  to = '/',
}: BrandProps): React.JSX.Element {
  const full = variant === 'full';
  const style = full
    ? ({ '--fh': `${size ?? 120}px` } as React.CSSProperties)
    : ({ '--mh': `${size ?? 38}px` } as React.CSSProperties);

  const art = (
    <span className={`brand__crop brand__crop--${full ? 'full' : 'mark'}`} style={style}>
      <img
        src={`${base}brand/wce-${full ? 'full' : 'mark'}.png`}
        alt={full || !withName ? 'Windy City Exteriors' : ''}
        aria-hidden={full || !withName ? undefined : true}
        draggable={false}
      />
    </span>
  );

  return (
    <Link className={`brand${invert ? ' brand--invert' : ''}`} to={to} aria-label="Windy City Exteriors, home">
      {art}
      {!full && withName && (
        <span className="brand__type" aria-hidden="true">
          <b>Windy City</b>
          <i>Exteriors</i>
        </span>
      )}
    </Link>
  );
}
