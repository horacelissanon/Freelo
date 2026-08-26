import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = { title: 'Cookies — ZeFacto' };

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Politique de cookies" updatedAt="25 août 2026">
      <p className="text-muted-foreground">
        ZeFacto n’utilise que des cookies et technologies de stockage local strictement nécessaires
        au fonctionnement du service. Aucun cookie publicitaire, aucun traceur tiers et aucun outil
        de mesure d’audience (Google Analytics ou équivalent) n’est déposé.
      </p>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          1. Cookies strictement nécessaires
        </h2>
        <p className="text-muted-foreground">
          Ces cookies sont indispensables au fonctionnement de votre compte et ne peuvent pas être
          désactivés sans empêcher l’accès au service :
        </p>
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">app-token</code> — jeton de
            session (15 minutes) qui vous garde connecté·e d’une page à l’autre.
          </li>
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">app-refresh</code> — jeton de
            renouvellement (7 jours, restreint à <code>/api/auth</code>) qui prolonge votre session
            sans que vous ayez à vous reconnecter en permanence.
          </li>
          <li>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">app-csrf</code> — jeton
            anti-falsification de requête (7 jours), qui protège vos actions (créer un devis,
            valider un paiement…) contre les attaques provenant d’un autre site.
          </li>
        </ul>
        <p className="mt-2 text-muted-foreground">
          Ces trois cookies sont techniques (<code>httpOnly</code> pour les deux premiers, transmis
          en HTTPS), ne servent à aucune finalité publicitaire et sont automatiquement supprimés à
          leur expiration ou lors de la déconnexion.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          2. Stockage local (préférences d’affichage)
        </h2>
        <p className="text-muted-foreground">
          En complément des cookies, ZeFacto utilise le stockage local de votre navigateur (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">localStorage</code>) pour retenir
          des préférences purement visuelles, propres à cet appareil : thème clair/sombre, couleur
          et forme de la barre latérale, devise d’affichage, mode grille/liste sur vos listes de
          clients/projets/factures, ou encore le masquage des montants. Ces informations ne quittent
          jamais votre navigateur et ne sont pas transmises à nos serveurs.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          3. Aucun cookie publicitaire ou de tracking tiers
        </h2>
        <p className="text-muted-foreground">
          ZeFacto ne dépose aucun cookie à des fins publicitaires, ne partage aucune donnée de
          navigation avec des régies publicitaires, et n’intègre aucun pixel de réseau social. Voir
          notre{' '}
          <a href="/confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </a>{' '}
          pour la liste complète de nos prestataires techniques.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          4. Comment gérer ces cookies
        </h2>
        <p className="text-muted-foreground">
          Les cookies strictement nécessaires ne peuvent pas être désactivés individuellement sans
          casser le fonctionnement de votre compte — vous pouvez néanmoins les effacer à tout moment
          via les réglages de votre navigateur (cela vous déconnectera de ZeFacto). Les préférences
          d’affichage stockées localement peuvent être réinitialisées en vidant les données de site
          de votre navigateur pour zefacto.app.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          5. Modifications de cette politique
        </h2>
        <p className="text-muted-foreground">
          Cette politique peut évoluer si de nouveaux cookies techniques deviennent nécessaires ; la
          date de mise à jour en tête de page fait foi. Voir aussi nos{' '}
          <a href="/cgu" className="text-primary hover:underline">
            CGU
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
