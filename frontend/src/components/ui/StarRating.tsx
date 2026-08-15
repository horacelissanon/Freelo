'use client';

// Shared 1-5 star control — read-only display (freelance-side review cards,
// the /reviews list) when `onChange` is omitted, interactive input (the
// public review form on /suivi/[token]) when it's provided. One component
// for both rather than splitting them: every usage site in this app is
// already a client component, so there's no server/client boundary to
// preserve by keeping them separate.
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export function StarRating({
  value,
  onChange,
  size = 20,
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!onChange) {
    return (
      <div className="flex items-center gap-0.5" aria-label={`${value} sur 5 étoiles`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon
            key={n}
            i="star"
            size={size}
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'fill-none text-border'}
          />
        ))}
      </div>
    );
  }

  const display = hovered ?? value;

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Note sur 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          className="p-0.5"
        >
          <Icon
            i="star"
            size={size}
            className={n <= display ? 'fill-amber-400 text-amber-400' : 'fill-none text-border'}
          />
        </button>
      ))}
    </div>
  );
}
