import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function AlertBanner({ text, href }: { text: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg bg-tag-orange px-4 py-3 font-body text-sm font-medium text-tag-orange-fg"
    >
      <Icon i="alert-circle" size={16} className="flex-shrink-0" />
      <span className="flex-1">{text}</span>
      <span className="flex-shrink-0 text-xs font-semibold whitespace-nowrap underline">
        Voir →
      </span>
    </Link>
  );
}
