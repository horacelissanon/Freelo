import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export interface UpcomingDeadlineItem {
  id: string;
  name: string;
  daysLeft: number;
}

export function UpcomingDeadlinesCard({ items }: { items: UpcomingDeadlineItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-canvas shadow-card p-5">
      <h2 className="mb-3 font-headings text-base font-semibold text-foreground">
        Échéances à venir
      </h2>
      <div className="flex flex-col gap-2.5">
        {items.map((item) => {
          const urgent = item.daysLeft <= 2;
          return (
            <Link
              key={item.id}
              href={`/projects/${item.id}`}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon
                  i="clock"
                  size={14}
                  className={
                    urgent ? 'flex-shrink-0 text-tag-red-fg' : 'flex-shrink-0 text-muted-foreground'
                  }
                />
                <p className="truncate font-body text-sm text-foreground">{item.name}</p>
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 font-body text-xs font-medium ${
                  urgent ? 'bg-tag-red text-tag-red-fg' : 'bg-muted text-muted-foreground'
                }`}
              >
                {item.daysLeft === 0 ? "Aujourd'hui" : `${item.daysLeft} j`}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
