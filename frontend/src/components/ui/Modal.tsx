'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';

const MAX_WIDTH = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-3xl',
};

export function Modal({
  title,
  onClose,
  size = 'md',
  children,
}: {
  title: string;
  onClose: () => void;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-black/40"
      />
      <div
        className={`animate-scale-in relative flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-lg border border-border bg-canvas p-6 shadow-xl sm:rounded-lg ${MAX_WIDTH[size]}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-headings text-lg font-bold text-foreground">{title}</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <Icon i="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
