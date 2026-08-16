'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { exportRowsToExcel } from '@/lib/export/excel';
import { exportRowsToPdf } from '@/lib/export/pdf';
import type { ExportColumn } from '@/lib/export/types';

export function ExportButtons<T>({
  filename,
  title,
  subtitle,
  columns,
  rows,
}: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function handleExcel() {
    setBusy(true);
    try {
      await exportRowsToExcel(filename, columns, rows);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function handlePdf() {
    setBusy(true);
    try {
      await exportRowsToPdf(filename, title, subtitle, columns, rows);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={rows.length === 0 || busy}
        className="flex h-[42px] items-center gap-2 rounded-md border border-border bg-input px-3 font-body text-sm font-medium text-foreground disabled:opacity-50"
      >
        <Icon i="download" size={15} />
        <span className="hidden sm:inline">Exporter</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-48 rounded-lg border border-border bg-canvas p-1.5 shadow-xl">
          <button
            type="button"
            onClick={() => void handlePdf()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 font-body text-sm text-foreground hover:bg-secondary"
          >
            <Icon i="file-text" size={16} className="text-muted-foreground" />
            Exporter en PDF
          </button>
          <button
            type="button"
            onClick={() => void handleExcel()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 font-body text-sm text-foreground hover:bg-secondary"
          >
            <Icon i="file-spreadsheet" size={16} className="text-muted-foreground" />
            Exporter en Excel
          </button>
        </div>
      )}
    </div>
  );
}
