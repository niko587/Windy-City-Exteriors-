import { createElement, useEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * Sets `data-shown` once an element has entered the viewport, so CSS can do
 * the animating. One observer per element, disconnected after it fires: the
 * motion is a single arrival, not something that replays on every scroll.
 */
export function useReveal<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.setAttribute('data-shown', 'true');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.setAttribute('data-shown', 'true');
            io.disconnect();
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

export function Reveal({
  as = 'div',
  className = '',
  delay = 0,
  children,
  style,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  delay?: number;
  children: ReactNode;
  style?: React.CSSProperties;
} & Record<string, unknown>): React.JSX.Element {
  const ref = useReveal<HTMLDivElement>();
  return createElement(
    as,
    {
      ...rest,
      ref,
      className: `reveal ${className}`.trim(),
      'data-shown': 'false',
      style: delay ? { ...style, transitionDelay: `${delay}ms` } : style,
    },
    children,
  );
}
