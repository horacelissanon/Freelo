'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface FilterTab {
  key: string;
  label: string;
  count: number;
}

export function FilterTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: FilterTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [tabs]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto border-b border-border font-body"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex-shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {tab.label} <span className="text-xs text-muted-foreground">({tab.count})</span>
          </button>
        ))}
      </div>

      {canScrollLeft && (
        <div className="pointer-events-none absolute top-0 bottom-0 left-0 flex w-8 items-center bg-gradient-to-r from-background to-transparent">
          <Icon i="chevron-left" size={14} className="text-muted-foreground" />
        </div>
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute top-0 bottom-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-background to-transparent">
          <Icon i="chevron-right" size={14} className="text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
