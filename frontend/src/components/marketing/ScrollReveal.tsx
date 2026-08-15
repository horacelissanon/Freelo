'use client';

// Progressive-enhancement scroll reveal for the landing page. Deliberately
// not a real animation library — the landing page is server-rendered with
// zero required client JS to stay fast on 2G/3G (see app/page.tsx's header
// comment), so this is the smallest possible client component: native
// IntersectionObserver, no dependency, and content is visible by default
// (opacity/transform only apply once `.reveal` is present client-side), so
// a user with JS disabled sees the page immediately, just without the
// entrance animation.
import { useEffect, useRef, useState } from 'react';

export function ScrollReveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
