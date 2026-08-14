// Shared loading/empty/error states for list pages — part of the design
// contract per the banani-design-implementation skill (Banani mocks never
// show these, they're ours to design).
import { Icon } from '@/components/ui/Icon';

export function LoadingState() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-canvas shadow-card px-6 py-10 text-center">
      <Icon i="alert-circle" size={24} className="text-tag-red-fg" />
      <p className="font-body text-sm text-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border px-4 py-2 font-body text-sm font-medium text-foreground"
      >
        Réessayer
      </button>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-canvas shadow-card px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
        <Icon i={icon} size={22} className="text-muted-foreground" />
      </div>
      <p className="font-headings text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-xs font-body text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
