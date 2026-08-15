'use client';

// Small rotating word for the hero eyebrow — cycles through freelance
// professions so the "who this is for" line stays inclusive of everyone
// Freelo actually serves (not just designers) without needing a full
// project-category rework. Remounts the <span> on each change (key={index})
// to retrigger the existing `animate-fade-in` utility from globals.css —
// no new keyframes, no manual timers to clean up.
import { useEffect, useState } from 'react';

export function RotatingWord({
  words,
  intervalMs = 2400,
}: {
  words: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [words, intervalMs]);

  return (
    <span key={index} className="animate-fade-in inline-block font-semibold">
      {words[index]}
    </span>
  );
}
