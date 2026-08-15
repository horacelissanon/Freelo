'use client';

// "Pensé pour" persona cards — client component because the right-to-left
// auto-scroll needs to duplicate the card track for a seamless CSS loop
// (see the `animate-marquee` keyframe in globals.css), and that duplication
// should only happen once we know prefers-reduced-motion allows it. Falls
// back to a static, non-duplicated layout by default (SSR + no-JS visitors,
// and anyone with reduced motion) — same progressive-enhancement pattern as
// ScrollReveal elsewhere on this page. Every card carries an explicit
// "Profil type" badge instead of a star rating: these are illustrative
// target personas, not attributed customer reviews (see page.tsx's header
// comment) — first-person copy is a style choice, not a verified-review claim.
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

export interface Persona {
  name: string;
  role: string;
  pain: string;
  solution: string;
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <div className="relative w-[82vw] max-w-sm flex-shrink-0 overflow-hidden rounded-lg border border-border bg-canvas p-5 shadow-card sm:w-96">
      <Icon
        i="message-circle"
        size={60}
        className="pointer-events-none absolute -top-3 -right-3 text-tag-green/40"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={persona.name} className="h-10 w-10 flex-shrink-0 text-sm" />
          <div>
            <p className="font-body text-sm font-semibold text-foreground">{persona.name}</p>
            <p className="font-body text-xs text-muted-foreground">{persona.role}</p>
          </div>
        </div>
        <span className="flex-shrink-0 rounded-full bg-secondary px-2 py-0.5 font-body text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Profil type
        </span>
      </div>
      <p className="relative mt-4 font-body text-sm text-muted-foreground">« {persona.pain} »</p>
      <p className="relative mt-3 font-body text-sm text-foreground">{persona.solution}</p>
    </div>
  );
}

export function PersonasMarquee({ personas }: { personas: Persona[] }) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimate(true);
    }
  }, []);

  if (!animate) {
    return (
      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-5 sm:flex-row sm:justify-center">
        {personas.map((persona) => (
          <PersonaCard key={persona.name} persona={persona} />
        ))}
      </div>
    );
  }

  return (
    <div className="group relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className="animate-marquee flex w-max gap-5 group-hover:[animation-play-state:paused]">
        {[...personas, ...personas].map((persona, i) => (
          <PersonaCard key={`${persona.name}-${i}`} persona={persona} />
        ))}
      </div>
    </div>
  );
}
