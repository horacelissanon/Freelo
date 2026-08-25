import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = { title: 'Politique de confidentialité — ZeFacto' };

export default function ConfidentialitePage() {
  return (
    <LegalPageLayout title="Politique de confidentialité" updatedAt="25 août 2026">
      <p className="text-muted-foreground">
        Cette politique explique quelles données ZeFacto collecte, pourquoi, et comment elles sont
        protégées — conformément à la loi n° 2017-20 du 20 avril 2018 portant Code du numérique en
        République du Bénin (Livre V, relatif à la protection des données à caractère personnel) et
        aux exigences de l’Autorité de Protection des Données Personnelles (APDP).
      </p>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Responsable de traitement
        </h2>
        <p className="text-muted-foreground">
          <strong className="text-foreground">
            [À COMPLÉTER : raison sociale, adresse, email de contact]
          </strong>{' '}
          — voir les{' '}
          <a href="/mentions-legales" className="text-primary hover:underline">
            mentions légales
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Données que nous collectons
        </h2>
        <p className="text-muted-foreground">Deux catégories de personnes sont concernées :</p>
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Le freelance (titulaire du compte)</strong> : nom,
            email, téléphone, mot de passe (haché, jamais stocké en clair), informations
            d’entreprise (nom, logo, adresse, régime fiscal), préférences (devise, secteur, langue).
          </li>
          <li>
            <strong className="text-foreground">Les clients du freelance</strong> : nom, contact,
            adresse, saisis par le freelance pour établir devis/factures, ainsi que les commentaires
            qu’ils laissent sur la page de suivi publique d’un projet (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/suivi/[lien]</code>). Ces
            données sont sous la responsabilité du freelance, ZeFacto agissant comme sous-traitant
            technique pour son compte.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Finalités du traitement
        </h2>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>Fournir le service (comptes, devis, projets, factures, suivi client).</li>
          <li>Traiter les paiements (abonnement, acomptes/soldes de projets).</li>
          <li>Envoyer les notifications transactionnelles (email) liées à l’activité du compte.</li>
          <li>Assurer la sécurité du service (authentification, prévention de la fraude).</li>
          <li>Support client et amélioration du service.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Destinataires et sous-traitants
        </h2>
        <p className="text-muted-foreground">
          Certaines données sont partagées avec des prestataires techniques, strictement pour les
          besoins du service :
        </p>
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          <li>Vercel — hébergement de l’application.</li>
          <li>Neon — hébergement de la base de données (Europe, Francfort).</li>
          <li>Upstash — cache et limitation de débit.</li>
          <li>Cloudinary — stockage des images (logos, avatars).</li>
          <li>Resend — envoi des emails transactionnels.</li>
          <li>Bictorys / FedaPay — traitement des paiements et abonnements.</li>
          <li>Sentry — supervision des erreurs techniques.</li>
        </ul>
        <p className="mt-2 text-muted-foreground">
          Certains de ces prestataires traitent des données en dehors du Bénin (Europe, États-Unis)
          ; nous nous assurons qu’ils offrent des garanties de sécurité appropriées. Vos données ne
          sont ni vendues, ni utilisées à des fins publicitaires par des tiers.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Durée de conservation
        </h2>
        <p className="text-muted-foreground">
          Les données sont conservées tant que le compte est actif. Après suppression d’un compte,
          elles sont effacées ou anonymisées, sous réserve des durées de conservation imposées par
          la réglementation comptable et fiscale applicable aux factures.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">Vos droits</h2>
        <p className="text-muted-foreground">
          Conformément au Code du numérique, vous disposez d’un droit d’accès, de rectification,
          d’opposition et d’effacement de vos données. Pour l’exercer, contactez-nous à{' '}
          <strong className="text-foreground">[À COMPLÉTER : email de contact]</strong>. Vous pouvez
          également saisir l’APDP (Autorité de Protection des Données Personnelles du Bénin) en cas
          de litige.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">Sécurité</h2>
        <p className="text-muted-foreground">
          Les mots de passe sont hachés, les échanges chiffrés (HTTPS), et les cookies de session
          sont configurés en <code className="rounded bg-muted px-1 py-0.5 text-xs">httpOnly</code>
          pour ne pas être accessibles par un script. Voir aussi notre{' '}
          <a href="/cookies" className="text-primary hover:underline">
            politique de cookies
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
