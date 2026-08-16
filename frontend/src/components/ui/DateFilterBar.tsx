'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  DATE_FILTER_OPTIONS,
  formatDateFilterPeriodLabel,
  localDateValue,
  type DateFilterValue,
} from '@/lib/dateFilter';

export function DateFilterBar({
  value,
  onChange,
}: {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const periodLabel = formatDateFilterPeriodLabel(value);
  const today = localDateValue();
  const activeOption = DATE_FILTER_OPTIONS.find((o) => o.key === value.key);

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

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-border bg-input px-3 py-2.5 font-body text-sm font-medium text-foreground"
      >
        <Icon i="calendar" size={15} className="flex-shrink-0 text-muted-foreground" />
        {activeOption?.label ?? 'Tout'}
        {periodLabel && (
          <span className="hidden font-normal text-muted-foreground sm:inline">
            · {periodLabel}
          </span>
        )}
        <Icon i="chevron-down" size={14} className="flex-shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-2 w-72 rounded-lg border border-border bg-canvas p-1.5 shadow-xl">
          {DATE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                if (opt.key === 'custom') {
                  onChange({
                    key: 'custom',
                    custom: value.custom ?? { start: today, end: today },
                  });
                } else {
                  onChange({ key: opt.key });
                  setOpen(false);
                }
              }}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 font-body text-sm ${
                value.key === opt.key
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-foreground hover:bg-secondary'
              }`}
            >
              {opt.label}
              {value.key === opt.key && (
                <Icon i="check-circle" size={15} className="text-primary" />
              )}
            </button>
          ))}

          {value.key === 'custom' && (
            <div className="mt-1 flex flex-col gap-3 border-t border-border p-2 pt-3">
              <div>
                <p className="mb-1 font-body text-xs font-medium text-muted-foreground">Début</p>
                <DatePicker
                  value={value.custom?.start ?? today}
                  onChange={(start) =>
                    onChange({ key: 'custom', custom: { start, end: value.custom?.end ?? start } })
                  }
                />
              </div>
              <div>
                <p className="mb-1 font-body text-xs font-medium text-muted-foreground">Fin</p>
                <DatePicker
                  value={value.custom?.end ?? today}
                  onChange={(end) =>
                    onChange({ key: 'custom', custom: { start: value.custom?.start ?? end, end } })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-primary px-3 py-2 font-body text-sm font-medium text-primary-foreground"
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
