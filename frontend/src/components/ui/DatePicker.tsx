'use client';

// Styled replacement for the bare native `<input type="date">` used across
// InvoiceForm/QuoteBuilderForm/ProjectForm — the native control renders a
// different, unstylable picker per OS/browser (and looks particularly rough
// on Windows/Android). Value/onChange stay 'YYYY-MM-DD' strings so call
// sites don't change at all, just the trigger swaps from <input> to this.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const POPOVER_WIDTH = 280;
const VIEWPORT_MARGIN = 12;

function parseValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthLabel(date: Date): string {
  const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildGrid(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Sélectionner une date',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const selected = parseValue(value);
  const today = new Date();
  const [viewDate, setViewDate] = useState(selected ?? today);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function openPicker() {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect && rect.left + POPOVER_WIDTH + VIEWPORT_MARGIN > window.innerWidth) {
      setAlign('right');
    } else {
      setAlign('left');
    }
    setViewDate(selected ?? today);
    setOpen(true);
  }

  function pick(date: Date) {
    onChange(toValue(date));
    setOpen(false);
  }

  const grid = buildGrid(viewDate);
  const currentMonth = viewDate.getMonth();

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={`flex w-full items-center justify-between gap-2 rounded-md border border-border bg-input px-3 py-2.5 text-left text-sm focus:ring-2 focus:ring-primary/40 focus:outline-none ${className}`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected
            ? selected.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : placeholder}
        </span>
        <Icon i="calendar" size={15} className="flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className={`absolute top-full z-30 mt-2 w-[280px] rounded-lg border border-border bg-canvas p-3 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mois précédent"
              onClick={() =>
                setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
              }
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Icon i="chevron-left" size={16} />
            </button>
            <p className="font-body text-sm font-semibold text-foreground capitalize">
              {monthLabel(viewDate)}
            </p>
            <button
              type="button"
              aria-label="Mois suivant"
              onClick={() =>
                setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
              }
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Icon i="chevron-right" size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((d) => (
              <span
                key={d}
                className="flex h-7 items-center justify-center font-body text-[11px] font-medium text-muted-foreground"
              >
                {d}
              </span>
            ))}
            {grid.map((d, i) => {
              const inMonth = d.getMonth() === currentMonth;
              const isToday = isSameDay(d, today);
              const isSelected = selected ? isSameDay(d, selected) : false;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(d)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full font-body text-xs transition-colors ${
                    isSelected
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : isToday
                        ? 'border border-primary/50 font-medium text-foreground'
                        : inMonth
                          ? 'text-foreground hover:bg-secondary'
                          : 'text-muted-foreground/40 hover:bg-secondary'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              className="font-body text-xs font-medium text-primary hover:underline"
            >
              Aujourd&apos;hui
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="font-body text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Effacer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
