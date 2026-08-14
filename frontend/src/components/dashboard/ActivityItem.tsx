import { Icon } from '@/components/ui/Icon';

const TYPE_ICONS: Record<string, string> = {
  comment: 'message-square',
  payment: 'credit-card',
  link_opened: 'link',
  quote_accepted: 'file-check',
  discharge_signed: 'pen-line',
};

export interface ActivityItemData {
  id: string;
  type: string;
  text: string;
  timeLabel: string;
  unread: boolean;
}

export function ActivityItem({ activity }: { activity: ActivityItemData }) {
  const icon = TYPE_ICONS[activity.type] ?? 'bell';
  return (
    <div className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
          activity.unread ? 'bg-tag-orange' : 'bg-secondary'
        }`}
      >
        <Icon
          i={icon}
          size={14}
          className={activity.unread ? 'text-tag-orange-fg' : 'text-muted-foreground'}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm leading-snug text-foreground">{activity.text}</p>
        <p className="mt-0.5 font-body text-xs text-muted-foreground">{activity.timeLabel}</p>
      </div>
    </div>
  );
}
