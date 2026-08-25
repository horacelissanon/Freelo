import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = { title: 'Mentions légales — Zeloom' };

export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout title="Mentions légales" updatedAt="25 août 2026">
      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">Éditeur du site</h2>
        <p className="text-muted-foreground">
          Le site et l’application Zeloom (ci-après « Zeloom ») sont édités par :
        </p>
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          <li>
            Raison sociale / nom de l’exploitant :{' '}
            <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
          <li>
            Statut juridique (entreprise individuelle, SARL, etc.) :{' '}
            <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
          <li>
            Siège / adresse : <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
          <li>
            Pays d’immatriculation : <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
          <li>
            Numéro d’immatriculation (IFU / RCCM ou équivalent) :{' '}
            <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
          <li>
            Email de contact : <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
          <li>
            Directeur de publication : <strong className="text-foreground">[À COMPLÉTER]</strong>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">Hébergement</h2>
        <p className="text-muted-foreground">
          L’application est hébergée par Vercel Inc. (440 N Barranca Ave #4133, Covina, CA 91723,
          États-Unis). La base de données est hébergée par Neon (région Europe — Francfort).
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Protection des données personnelles
        </h2>
        <p className="text-muted-foreground">
          Conformément à la loi n° 2017-20 du 20 avril 2018 portant Code du numérique en République
          du Bénin (Livre V), le traitement des données personnelles réalisé par Zeloom fait l’objet
          d’une déclaration auprès de l’Autorité de Protection des Données Personnelles (APDP) —{' '}
          <strong className="text-foreground">[À COMPLÉTER : numéro de récépissé APDP]</strong>.
          Pour le détail des traitements, voir notre{' '}
          <a href="/confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Propriété intellectuelle
        </h2>
        <p className="text-muted-foreground">
          L’ensemble des éléments du site (textes, logos, interface) est protégé par le droit
          d’auteur. Toute reproduction non autorisée est interdite.
        </p>
      </section>
    </LegalPageLayout>
  );
}
