import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = { title: 'CGV — ZeFacto' };

export default function CgvPage() {
  return (
    <LegalPageLayout title="Conditions Générales de Vente" updatedAt="25 août 2026">
      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">1. Objet</h2>
        <p className="text-muted-foreground">
          Les présentes Conditions Générales de Vente (CGV) s’appliquent à la souscription d’un
          abonnement payant ZeFacto (plan Pro), donnant accès à des fonctionnalités supplémentaires
          par rapport au plan gratuit.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">2. Prix</h2>
        <p className="text-muted-foreground">
          Les tarifs en vigueur sont affichés dans l’application, page « Abonnement », avant toute
          confirmation de paiement. Les prix sont exprimés dans la devise indiquée et peuvent
          évoluer ; toute modification est communiquée avant son entrée en vigueur pour les
          abonnements en cours.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">3. Paiement</h2>
        <p className="text-muted-foreground">
          Le paiement s’effectue en ligne par carte bancaire ou mobile money, via nos prestataires
          de paiement (Bictorys / FedaPay). ZeFacto ne stocke aucune donnée de carte bancaire —
          celles-ci sont traitées directement par le prestataire de paiement.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          4. Durée et renouvellement
        </h2>
        <p className="text-muted-foreground">
          L’abonnement est souscrit pour la période choisie (mensuelle ou annuelle) et se renouvelle
          automatiquement à échéance, sauf annulation préalable depuis les réglages du compte.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">5. Annulation</h2>
        <p className="text-muted-foreground">
          Vous pouvez annuler votre abonnement à tout moment depuis les réglages du compte.
          L’annulation prend effet à la fin de la période déjà payée : l’accès au plan Pro reste
          actif jusqu’à cette date, sans reconduction ultérieure. Aucun remboursement au prorata de
          la période en cours n’est effectué, sauf disposition légale contraire.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">6. Facturation</h2>
        <p className="text-muted-foreground">
          Une facture est émise pour chaque paiement d’abonnement et reste consultable depuis les
          réglages du compte.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">7. Rétractation</h2>
        <p className="text-muted-foreground">
          En souscrivant à l’abonnement Pro, vous demandez expressément l’accès immédiat aux
          fonctionnalités payantes dès validation du paiement. Une fois le service commencé avec
          votre accord exprès, le droit de rétractation applicable aux contenus/services numériques
          ne s’exerce plus, conformément à la réglementation en vigueur.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          8. Droit applicable
        </h2>
        <p className="text-muted-foreground">
          Les présentes CGV sont soumises au droit béninois. Voir aussi nos{' '}
          <a href="/cgu" className="text-primary hover:underline">
            CGU
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
