import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = { title: 'CGU — ZeFacto' };

export default function CguPage() {
  return (
    <LegalPageLayout title="Conditions Générales d’Utilisation" updatedAt="25 août 2026">
      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">1. Objet</h2>
        <p className="text-muted-foreground">
          Les présentes Conditions Générales d’Utilisation (CGU) régissent l’accès et l’usage de
          ZeFacto, un outil de gestion pour freelances (clients, devis, projets, factures, suivi
          client). Elles s’appliquent à tout utilisateur créant un compte.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">2. Acceptation</h2>
        <p className="text-muted-foreground">
          En créant un compte, vous acceptez sans réserve les présentes CGU ainsi que nos{' '}
          <a href="/cgv" className="text-primary hover:underline">
            Conditions Générales de Vente
          </a>{' '}
          et notre{' '}
          <a href="/confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          3. Création de compte
        </h2>
        <p className="text-muted-foreground">
          Vous devez fournir des informations exactes et à jour, et êtes responsable de la
          confidentialité de votre mot de passe et de toute activité effectuée depuis votre compte.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          4. Rôle de ZeFacto
        </h2>
        <p className="text-muted-foreground">
          ZeFacto est un outil mis à disposition des freelances pour gérer leur activité. ZeFacto
          n’est pas partie aux transactions conclues entre un freelance et ses propres clients : les
          devis, projets et factures créés reflètent des accords commerciaux dont le freelance reste
          seul responsable. Lorsqu’un paiement est enregistré manuellement (ex. espèces, virement,
          mobile money reçu hors plateforme), ZeFacto se limite à en garder la trace et n’en
          garantit ni la réception ni l’exactitude.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          5. Obligations de l’utilisateur
        </h2>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>Utiliser le service conformément à la loi et aux bonnes mœurs.</li>
          <li>
            Ne pas utiliser ZeFacto pour des activités frauduleuses (fausses factures, blanchiment,
            usurpation d’identité).
          </li>
          <li>
            Ne pas tenter de contourner les mesures de sécurité (authentification, limitation de
            débit) ou d’accéder aux données d’un autre compte.
          </li>
          <li>
            Respecter les droits des tiers, notamment la vie privée des clients dont vous
            enregistrez les coordonnées.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          6. Disponibilité du service
        </h2>
        <p className="text-muted-foreground">
          ZeFacto met en œuvre des moyens raisonnables pour assurer la disponibilité du service,
          sans garantie de fonctionnement ininterrompu. Des interruptions pour maintenance peuvent
          survenir, si possible annoncées à l’avance.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          7. Suspension et résiliation
        </h2>
        <p className="text-muted-foreground">
          Vous pouvez supprimer votre compte à tout moment depuis les réglages. ZeFacto peut
          suspendre ou résilier un compte en cas de manquement grave aux présentes CGU, après
          notification lorsque cela est possible.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          8. Limitation de responsabilité
        </h2>
        <p className="text-muted-foreground">
          Dans les limites permises par la loi, ZeFacto ne pourra être tenu responsable des dommages
          indirects résultant de l’utilisation du service, ni des litiges commerciaux entre un
          freelance et ses clients.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          9. Modification des CGU
        </h2>
        <p className="text-muted-foreground">
          Ces CGU peuvent être modifiées ; la date de mise à jour en tête de page fait foi. Une
          utilisation continue du service après modification vaut acceptation.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          10. Droit applicable
        </h2>
        <p className="text-muted-foreground">
          Les présentes CGU sont soumises au droit béninois. Tout litige relève des juridictions
          compétentes du Bénin, sauf disposition légale impérative contraire.
        </p>
      </section>
    </LegalPageLayout>
  );
}
