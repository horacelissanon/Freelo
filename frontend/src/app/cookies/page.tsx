import type { Metadata } from 'next';
import { LegalPageLayout } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = { title: 'Politique de cookies — ZeFacto' };

const COOKIES: { name: string; purpose: string; duration: string }[] = [
  {
    name: 'app-token',
    purpose: 'Session de connexion (jeton d’accès).',
    duration: '15 minutes',
  },
  {
    name: 'app-refresh',
    purpose: 'Renouvelle la session sans redemander le mot de passe.',
    duration: '7 jours',
  },
  {
    name: 'app-csrf',
    purpose: 'Protège les actions du compte contre les attaques CSRF.',
    duration: '7 jours',
  },
];

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Politique de cookies" updatedAt="25 août 2026">
      <p className="text-muted-foreground">
        ZeFacto utilise uniquement des cookies strictement nécessaires au fonctionnement du service
        — aucun cookie publicitaire, aucun traceur tiers à des fins marketing. Ces cookies ne
        nécessitent pas de consentement préalable puisqu’ils sont indispensables à la fourniture du
        service que vous demandez (rester connecté, sécuriser votre compte).
      </p>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">Cookies utilisés</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Finalité</th>
                <th className="py-2 font-medium">Durée</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name} className="border-b border-border/60 text-muted-foreground">
                  <td className="py-2 pr-4">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{c.name}</code>
                  </td>
                  <td className="py-2 pr-4">{c.purpose}</td>
                  <td className="py-2">{c.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-muted-foreground">
          Ces cookies sont marqués{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">httpOnly</code> (illisibles par un
          script) et <code className="rounded bg-muted px-1 py-0.5 text-xs">Secure</code> — ils ne
          transitent qu’en HTTPS.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Stockage local (localStorage)
        </h2>
        <p className="text-muted-foreground">
          En complément des cookies, votre navigateur conserve localement quelques préférences
          d’affichage (forme du menu, couleur, montants masqués…). Ces informations restent sur
          votre appareil et ne sont jamais envoyées à nos serveurs.
        </p>
      </section>

      <section>
        <h2 className="font-headings text-base font-semibold text-foreground">
          Comment les désactiver
        </h2>
        <p className="text-muted-foreground">
          Les cookies de session étant nécessaires au fonctionnement de ZeFacto, les bloquer vous
          déconnectera du service. Vous pouvez les supprimer à tout moment depuis les réglages de
          votre navigateur.
        </p>
      </section>
    </LegalPageLayout>
  );
}
