import { Icon } from '@/components/ui/Icon';

export function InvoicesEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tag-green">
        <Icon i="receipt" size={26} className="text-tag-green-fg" />
      </div>
      <div>
        <p className="font-headings text-base font-semibold text-foreground">
          Envoie ton premier devis en FCFA
        </p>
        <p className="mt-1 max-w-xs font-body text-sm text-muted-foreground">
          Crée un devis ou une facture et partage-le avec ton client.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground"
      >
        <Icon i="file-plus" size={16} />
        Créer un devis
      </button>
    </div>
  );
}
