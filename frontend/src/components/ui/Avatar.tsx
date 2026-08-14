// Initials avatar — replaces Banani's `@global/UserAvatar` illustration
// service, which isn't available outside the Banani editor.
import { cn } from '@/lib/utils';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary font-headings font-bold text-primary-foreground',
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
