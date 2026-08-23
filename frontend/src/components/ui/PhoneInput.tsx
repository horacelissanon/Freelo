'use client';

// Country-prefix phone input: a flag+dial-code dropdown (defaults to the
// visitor's own country via guessDefaultCountry's timezone heuristic) next
// to a plain text field whose placeholder mirrors that country's typical
// number grouping. `value`/`onChange` carry the composed "+<dial> <local>"
// string (empty until the visitor actually types a local number) — same
// shape as every other free-text `phone` field in this app, so call sites
// don't need to know this renders two inputs internally.
import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, guessDefaultCountry, type Country } from '@/lib/countries';
import { Icon } from '@/components/ui/Icon';
import { FlagIcon } from '@/components/ui/FlagIcon';

const fieldClass =
  'rounded-md border border-border bg-input px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/40 focus:outline-none';

const COUNTRIES_BY_DIAL_LENGTH_DESC = [...COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

function parseValue(value: string): { country: Country; local: string } {
  const fallback = guessDefaultCountry();
  const match = value.match(/^\+(\d+)\s?(.*)$/);
  if (!match?.[1]) return { country: fallback, local: value };
  const dial = match[1];
  const rest = match[2] ?? '';
  const country = COUNTRIES_BY_DIAL_LENGTH_DESC.find((c) => dial.startsWith(c.dialCode));
  if (!country) return { country: fallback, local: value };
  return { country, local: (dial.slice(country.dialCode.length) + rest).trim() };
}

export function PhoneInput({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [country, setCountry] = useState<Country>(() => parseValue(value).country);
  const [local, setLocal] = useState(() => parseValue(value).local);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function emit(nextCountry: Country, nextLocal: string) {
    const trimmed = nextLocal.trim();
    onChange(trimmed ? `+${nextCountry.dialCode} ${trimmed}` : '');
  }

  function selectCountry(c: Country) {
    setCountry(c);
    setOpen(false);
    setSearch('');
    emit(c, local);
  }

  const filtered = COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.dialCode.includes(search),
  );

  return (
    <div className={`flex gap-2 ${className}`} ref={wrapperRef}>
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Indicatif : ${country.name} (+${country.dialCode})`}
          className={`flex h-full items-center gap-1.5 ${fieldClass}`}
        >
          <FlagIcon iso2={country.iso2} />
          <span className="text-muted-foreground">+{country.dialCode}</span>
          <Icon i="chevron-down" size={12} className="text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute top-full left-0 z-30 mt-2 w-64 rounded-lg border border-border bg-canvas shadow-xl">
            <div className="p-2">
              <input
                autoFocus
                type="text"
                placeholder="Rechercher un pays…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${fieldClass} w-full`}
              />
            </div>
            <div className="max-h-56 overflow-y-auto pb-1.5">
              {filtered.map((c) => (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => selectCountry(c)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-body text-sm text-foreground hover:bg-secondary"
                >
                  <FlagIcon iso2={c.iso2} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-muted-foreground">+{c.dialCode}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 font-body text-sm text-muted-foreground">Aucun résultat.</p>
              )}
            </div>
          </div>
        )}
      </div>
      <input
        type="tel"
        autoComplete="tel-national"
        placeholder={country.format}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          emit(country, e.target.value);
        }}
        className={`${fieldClass} w-full`}
      />
    </div>
  );
}
