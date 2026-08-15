// Landing page (PRD §3.13) — the app's public entry point for visitors.
// Server-rendered; the only client JS is two small progressive-enhancement
// islands (ScrollReveal for the fade-in-on-scroll effect, PricingToggle for
// the Mensuel/Annuel switch) so it stays fast on the low-end-phone / 2G-3G
// connections the PRD calls out — everything else, including content, works
// with zero JS. Content is scoped to what's ACTUALLY shipped today — no
// fabricated user counts or testimonials, and no overclaiming payment
// processing that doesn't exist: Freelo does NOT collect payment from a
// freelancer's client on their behalf — a freelancer indicates their
// preferred payment method (Wave, Orange Money, MTN…) and it's displayed on
// the devis/facture; the client settles directly, outside the app. Every
// payment-related line on this page is worded around that, not around
// in-app processing. The "Pensé pour" section uses named personas framed
// explicitly as target personas ("Profil type" badge on every card, see
// PersonasMarquee.tsx), not attributed customer quotes — first-person copy
// and the scrolling marquee are a style choice, not a claim that a real
// person said this. Restructured/rewritten 2026-08-15, inspired by a competitor's
// landing structure (numbered steps, capability strip, comparison table,
// tiered pricing with a billing toggle, richer FAQ) but with entirely
// original copy and zero fabricated blocks — no fake trust numbers, no
// WhatsApp community banner (no real link to give), no "free courses"
// section (no such feature exists in this app).
export const runtime = 'nodejs';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingToggle } from '@/components/marketing/PricingToggle';
import { ComparisonTable, type ComparisonRow } from '@/components/marketing/ComparisonTable';
import { RotatingWord } from '@/components/marketing/RotatingWord';
import { PersonasMarquee } from '@/components/marketing/PersonasMarquee';
import { InstallPromptWidget } from '@/components/InstallPromptWidget';

// Rotates in the hero H1 so "who this is for" stays visible and inclusive
// — Freelo isn't scoped to graphic designers specifically, unlike the
// competitor this page took structural inspiration from.
const TARGET_PROFESSIONS = [
  'designers',
  'développeurs',
  'rédacteurs',
  'consultants',
  'vidéastes',
  'community managers',
];

const HERO_PILLS: { icon: string; label: string }[] = [
  { icon: 'file-text', label: 'Devis' },
  { icon: 'receipt', label: 'Factures' },
  { icon: 'link', label: 'Suivi client' },
  { icon: 'layout-dashboard', label: 'Tableau de bord' },
  { icon: 'bell', label: 'Alertes & rappels' },
];

const CAPABILITIES: { icon: string; title: string; description: string }[] = [
  {
    icon: 'globe',
    title: 'FCFA · EUR · USD',
    description: 'Devis et factures pros dans la devise du client — zéro Canva, zéro Photoshop.',
  },
  {
    icon: 'link',
    title: 'Zéro inscription client',
    description: 'Un lien suffit — aucun compte à créer côté client.',
  },
  {
    icon: 'download',
    title: 'App installable',
    description: 'Freelo sur ton écran d’accueil, comme une app native.',
  },
];

const STEPS: { icon: string; title: string; description: string }[] = [
  {
    icon: 'users',
    title: 'Ajoute ton client',
    description: 'Un code unique par client — plus jamais de confusion entre deux Aïssatou.',
  },
  {
    icon: 'layout-dashboard',
    title: 'Structure le projet',
    description: 'Des étapes personnalisables que ton client voit avancer en temps réel.',
  },
  {
    icon: 'file-text',
    title: 'Envoie ton devis',
    description:
      'Un lien pro que ton client ouvre en un clic, pas un PDF qui se perd dans les emails.',
  },
  {
    icon: 'banknote',
    title: 'Sois payé, sans confusion',
    description:
      'Ton moyen de paiement (Wave, Orange Money, MTN…) apparaît clairement sur le devis ou la facture.',
  },
];

// `inverted` keeps the exact same card shell (rounded-lg p-5 shadow-card,
// same icon-badge size, same text sizes) as every other tile — only the
// color tokens flip (solid bg-primary fill instead of bg-canvas + a pale
// bg-tag-green badge) so "Une validation qui fait foi" still stands out
// without being a different size or a separate spotlight bar. `pinBelowHighlight`
// forces that card's lg (3-col) position to sit directly under it (grid
// auto-flow alone would put the last item in column 1 of the next row, not
// column 2) — source order already handles this correctly at the sm 2-col
// breakpoint, so the explicit column-start only applies at lg.
const FEATURES: {
  icon: string;
  title: string;
  description: string;
  inverted?: boolean;
  pinBelowHighlight?: boolean;
}[] = [
  {
    icon: 'users',
    title: 'CRM clients simple',
    description:
      'Chaque client reçoit un code unique — plus jamais de confusion entre deux clients du même nom.',
  },
  {
    icon: 'layout-dashboard',
    title: 'Projets & étapes personnalisables',
    description:
      'Ajoute, retire ou réordonne les étapes de chaque projet. Ton client voit l’avancement en temps réel.',
  },
  {
    icon: 'file-text',
    title: 'Devis multi-offres',
    description:
      'Propose plusieurs formules sur un même devis, chacune avec son acompte — ton client choisit en un clic.',
  },
  {
    icon: 'receipt',
    title: 'Factures multi-devises',
    description:
      'Un design pro généré automatiquement en FCFA, EUR ou USD selon le client — plus besoin de Canva ou Photoshop pour composer un devis.',
  },
  {
    icon: 'file-check',
    title: 'Une validation qui fait foi',
    description:
      'Le client choisit et valide lui-même l’offre depuis son lien — prix et contenu figés dès l’acceptation. Fini les « je n’étais pas au courant » ou les prix remis en question après coup.',
    inverted: true,
  },
  {
    icon: 'link',
    title: 'Lien de suivi client',
    description:
      'Un lien unique, sans inscription : ton client consulte l’avancement, commente, et voit tes moyens de paiement.',
  },
  {
    icon: 'bell',
    title: 'Alertes automatiques',
    description:
      'Échéance de projet qui approche, facture en retard — Freelo te prévient avant que ton client s’en inquiète.',
    pinBelowHighlight: true,
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    category: 'Organisation',
    headline: 'Un espace, pas cinq',
    freelo: 'Clients, projets, devis et factures réunis au même endroit.',
    patchwork: 'WhatsApp pour les échanges, Excel pour les chiffres, un carnet pour les contacts.',
  },
  {
    category: 'Suivi client',
    headline: 'Un lien, zéro relance',
    freelo: 'Ton client suit son projet en temps réel, sans jamais créer de compte.',
    patchwork: 'PDF envoyés par email, relances manuelles répétées pour savoir où ça en est.',
  },
  {
    category: 'Devises',
    headline: 'Prêt pour tes clients d’ici et d’ailleurs',
    freelo: 'Devis et factures générés directement en FCFA, EUR ou USD selon le client.',
    patchwork: 'Une maquette Canva ou Photoshop à refaire à la main pour chaque devise.',
  },
  {
    category: 'Accès',
    headline: 'Toujours à portée de main',
    freelo: 'App installable, rapide même sur une connexion faible.',
    patchwork: 'Outils lourds à rouvrir, fichiers à retrouver à chaque fois.',
  },
];

// First-person, as if Aminata/Koffi are speaking — but each card carries an
// explicit "Profil type" badge (see PersonasMarquee.tsx) rather than a star
// rating or any other verified-review signal. These stay illustrative
// target personas, not attributed customer testimonials (see this file's
// header comment) — first-person phrasing is a copy style, not a claim that
// a real person said this. Koffi's pain point used to be about clients
// paying in different currencies/methods; swapped out for now since online
// payment collection for a freelance's clients is currently pulled from the
// product — revisit once that's back.
const PERSONAS: { name: string; role: string; pain: string; solution: string }[] = [
  {
    name: 'Aminata',
    role: 'Graphiste freelance, Abidjan',
    pain: 'Je composais mes devis sur Canva, mes factures sur Excel, mes échanges sur WhatsApp — j’ai fini par oublier de facturer un client.',
    solution:
      'Depuis Freelo, chaque projet a son devis, sa facture et son lien de suivi rattachés : plus rien ne se perd entre deux outils.',
  },
  {
    name: 'Koffi',
    role: 'Designer UI/UX freelance, Cotonou',
    pain: 'Un client me redemandait sans arrêt des retouches, en disant ne jamais avoir validé le prix de départ.',
    solution:
      'Depuis, il valide lui-même l’offre choisie sur son lien de suivi — le prix est figé, plus de discussion sans fin sur ce qui avait été convenu.',
  },
  {
    name: 'Fatou',
    role: 'Rédactrice freelance, Dakar',
    pain: 'Je perdais le fil des échéances — une facture en retard, un projet dont la deadline approchait sans que je m’en rende compte.',
    solution:
      'Freelo me prévient automatiquement avant qu’une échéance de projet approche ou qu’une facture traîne trop longtemps.',
  },
  {
    name: 'Ibrahima',
    role: 'Consultant freelance, Douala',
    pain: 'Mes clients m’appelaient sans arrêt pour savoir où en était leur projet.',
    solution:
      'Maintenant ils suivent l’avancement en temps réel depuis leur lien, sans même avoir besoin de créer un compte.',
  },
  {
    name: 'Léa',
    role: 'Vidéaste freelance, clientèle internationale',
    pain: 'Chaque facture pour un client à l’étranger voulait dire refaire toute la mise en page à la main pour une autre devise.',
    solution:
      'Freelo génère mes factures directement en FCFA, EUR ou USD selon le client — plus rien à recomposer.',
  },
];

const FREE_FEATURES = [
  '1 client',
  '2 projets actifs',
  'Devis & factures en FCFA',
  'Lien de suivi en lecture seule',
];

const PRO_FEATURES = [
  'Clients & projets illimités',
  'Devis & factures en FCFA, EUR, USD',
  'Lien de suivi interactif avec tes moyens de paiement indiqués',
  'Sans filigrane sur les documents',
];

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'Freelo est-il vraiment gratuit ?',
    answer:
      'Oui. Le plan Gratuit permet de gérer 1 client et 2 projets actifs, avec devis et factures en FCFA — de quoi réellement travailler. Le plan Pro (3 500 FCFA/mois ou 35 000 FCFA/an) lève ces limites.',
  },
  {
    question: 'Mes clients doivent-ils créer un compte ?',
    answer:
      'Non. Le lien de suivi que tu partages s’ouvre directement — aucune inscription, aucun mot de passe côté client.',
  },
  {
    question:
      'Comment éviter qu’un client dise ne pas être au courant du prix ou de ce qui a été convenu ?',
    answer:
      'Ton client choisit et valide lui-même l’offre depuis son lien de suivi, sans compte à créer. Une fois le devis envoyé, son contenu est figé — impossible de le modifier après coup, côté freelance comme côté client. En cas de désaccord sur le prix ou de demande de modification, tu as toujours une référence claire de ce qui a réellement été accepté.',
  },
  {
    question: 'Mes clients paient-ils directement depuis Freelo ?',
    answer:
      'Pas encore — Freelo n’encaisse pas à ta place. Tu indiques le moyen de paiement de ton choix (Wave, Orange Money, MTN…) directement sur le devis ou la facture, et ton client te règle en direct. Une intégration de paiement en ligne est prévue pour une prochaine version.',
  },
  {
    question: 'Puis-je facturer en euros ou en dollars ?',
    answer:
      'Le plan Gratuit facture en FCFA uniquement. Le plan Pro débloque l’émission en EUR et USD, utile pour les clients de la diaspora.',
  },
  {
    question: 'Freelo fonctionne-t-il sur mobile ?',
    answer:
      'Oui — Freelo est une application installable (PWA). Ajoute-la à l’écran d’accueil de ton téléphone ou de ton ordinateur pour l’utiliser comme une app native, sans passer par un store.',
  },
  {
    question: 'Que se passe-t-il si je dépasse les limites du plan Gratuit ?',
    answer:
      'Tu peux passer au plan Pro à tout moment depuis Paramètres → Abonnement. Aucune interruption, tes données restent intactes.',
  },
  {
    question: 'Suis-je prévenu si un client tarde à payer ?',
    answer:
      'Oui. Freelo surveille les échéances de tes projets et de tes factures et t’alerte automatiquement — dans l’app et sur ton tableau de bord — avant qu’un retard ne devienne un problème.',
  },
];

const inputCardClass = 'rounded-lg border border-border bg-canvas p-5 shadow-card';

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* ── Header ──────────────────────────────────────────────────── */}
      {/* Floating, not flush — inset from the viewport edges with its own
          rounded pill + shadow. Uses position: fixed (not sticky) so it
          stays visible through the entire scroll — sticky was tried first
          and reported as disappearing mid-scroll. Fixed removes it from
          document flow, hence the extra hero top-padding below. */}
      <header className="fixed inset-x-0 top-3 z-30 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-border bg-background/90 px-4 py-2.5 shadow-lg backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <span className="font-headings text-base font-bold text-primary-foreground">F</span>
            </div>
            <span className="font-headings text-lg font-bold tracking-tight text-foreground">
              Freelo
            </span>
          </div>
          <nav className="hidden items-center gap-6 font-body text-sm text-muted-foreground md:flex">
            <a href="#comment-ca-marche" className="hover:text-foreground">
              Comment ça marche
            </a>
            <a href="#comparatif" className="hover:text-foreground">
              Comparatif
            </a>
            <a href="#tarifs" className="hover:text-foreground">
              Tarifs
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden font-body text-sm font-medium text-foreground sm:inline"
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-4 py-2 font-body text-sm font-medium text-primary-foreground"
            >
              Commencer gratuitement
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      {/* Extra top padding clears the now-fixed (not in-flow) header pill —
          pt-14/20 was sized for the old sticky-in-flow header, which
          reserved its own space; a fixed header doesn't. */}
      <section className="relative mx-auto max-w-6xl px-4 pt-28 pb-16 sm:px-6 sm:pt-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-tag-green/60 to-transparent"
        />
        <div className="animate-fade-in mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
          {/* No region name here on purpose — the app supports FCFA/EUR/USD
              natively, so it reads as international by what it does, not by
              a geographic claim that could read as "not for you" to a
              client or freelance based elsewhere. */}
          <span className="rounded-full bg-tag-green px-3 py-1 font-body text-xs font-medium text-tag-green-fg">
            FCFA · EUR · USD
          </span>
          {/* Headline itself names the target (dynamic — cycles through
              professions so it reads as "made for you" for more visitors,
              not just designers), Canva-style. */}
          <h1 className="font-headings text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Le CRM taillé sur mesure pour les freelances{' '}
            <RotatingWord words={TARGET_PROFESSIONS} className="text-primary" />.
          </h1>
          <p className="max-w-xl font-body text-base text-muted-foreground sm:text-lg">
            Moins de temps sur l’administratif, plus de temps sur ton travail : devis, factures
            (FCFA, EUR, USD) et suivi client réunis en un seul endroit.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-md bg-primary px-6 py-3 font-body text-sm font-semibold text-primary-foreground"
            >
              Commencer gratuitement
            </Link>
            <a
              href="#tarifs"
              className="rounded-md border border-border px-6 py-3 font-body text-sm font-semibold text-foreground"
            >
              Voir les tarifs
            </a>
          </div>
          <p className="font-body text-xs text-muted-foreground">
            Gratuit pour démarrer · Aucune carte bancaire requise
          </p>

          {/* Capability pills — real, shipped features only (no "Contrats" /
              "Formulaires" style pills for capabilities Freelo doesn't have). */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {HERO_PILLS.map((pill) => (
              <a
                key={pill.label}
                href="#fonctionnalites"
                className="flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3.5 py-1.5 font-body text-xs font-medium text-foreground shadow-card transition-colors hover:border-primary/40"
              >
                <Icon i={pill.icon} size={13} className="text-primary" />
                {pill.label}
              </a>
            ))}
          </div>
        </div>

        {/* Product preview — built from the app's own visual language rather
            than a screenshot, so it never goes stale as the UI evolves.
            Sidebar rows are icon-plus-bar placeholders, never real nav
            labels — the mockup stays accurate even after the real menu
            changes. Desktop + mobile side by side (desktop only — cramming
            both next to each other on a phone screen would be unreadable,
            so the phone visitor just sees the wide dashboard mockup). */}
        <div className="animate-slide-up-in mx-auto mt-14 flex max-w-6xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center">
          <div className="relative w-full max-w-2xl">
            <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-card">
              <div className="flex items-center gap-1.5 border-b border-border bg-secondary/60 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-tag-red-fg/50" />
                <span className="h-2.5 w-2.5 rounded-full bg-tag-orange-fg/50" />
                <span className="h-2.5 w-2.5 rounded-full bg-tag-green-fg/50" />
                <span className="ml-3 truncate font-body text-xs text-muted-foreground">
                  freelo.app/dashboard
                </span>
              </div>
              <div className="flex">
                <div className="flex w-14 flex-shrink-0 flex-col gap-1.5 bg-sidebar p-2.5 sm:w-40 sm:p-3">
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary">
                      <span className="font-headings text-[10px] font-bold text-primary-foreground">
                        F
                      </span>
                    </div>
                    <span className="hidden font-headings text-xs font-bold text-sidebar-foreground sm:block">
                      Freelo
                    </span>
                  </div>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-md px-2 py-2 ${i === 0 ? 'bg-sidebar-muted' : ''}`}
                    >
                      <span
                        className={`h-2.5 w-2.5 flex-shrink-0 rounded-sm ${i === 0 ? 'bg-sidebar-foreground' : 'bg-sidebar-foreground/40'}`}
                      />
                      <span
                        className={`hidden h-1.5 rounded-full sm:block ${i === 0 ? 'w-16 bg-sidebar-foreground/90' : 'w-10 bg-sidebar-foreground/30'}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-headings text-sm font-bold text-foreground">
                      Tableau de bord
                    </p>
                    <span className="rounded-full bg-tag-green px-2 py-0.5 font-body text-[9px] font-medium text-tag-green-fg">
                      En ligne
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg bg-primary p-3">
                      <p className="font-body text-[10px] text-primary-foreground/80">
                        Revenus ce mois
                      </p>
                      <p className="font-headings text-lg font-bold text-primary-foreground">
                        850 000
                      </p>
                    </div>
                    <div className={inputCardClass}>
                      <p className="font-body text-[10px] text-muted-foreground">Projets actifs</p>
                      <p className="font-headings text-lg font-bold text-foreground">4</p>
                    </div>
                    <div className={inputCardClass}>
                      <p className="font-body text-[10px] text-muted-foreground">
                        Factures impayées
                      </p>
                      <p className="font-headings text-lg font-bold text-foreground">2</p>
                    </div>
                    <div className={inputCardClass}>
                      <p className="font-body text-[10px] text-muted-foreground">
                        Nouveaux clients
                      </p>
                      <p className="font-headings text-lg font-bold text-foreground">+3</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-border p-3">
                    <p className="font-body text-[10px] text-muted-foreground">
                      Revenus de la semaine
                    </p>
                    <div className="mt-3 flex h-16 items-end gap-1.5 sm:gap-2">
                      {[40, 65, 50, 70, 90, 55, 45].map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-t ${i === 4 ? 'bg-primary' : 'bg-tag-green'}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sketchy teaser of the client-facing tracking link —
                deliberately a skeleton, not a finished mockup like the
                dashboard above: the point is to make someone curious enough
                to click through and look, not to hand over the whole
                design. */}
            <div className="absolute -bottom-6 -left-3 hidden w-36 overflow-hidden rounded-xl border border-border bg-canvas shadow-xl sm:block">
              <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
                <Icon i="link" size={10} className="flex-shrink-0 text-primary" />
                <span className="font-body text-[9px] font-semibold text-foreground">
                  Suivi client
                </span>
              </div>
              <div className="flex flex-col gap-1.5 p-2.5">
                <div className="h-1.5 w-3/4 rounded-full bg-muted" />
                <div className="h-1.5 w-1/2 rounded-full bg-muted" />
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-2/3 rounded-full bg-primary/50" />
                </div>
                <div className="h-1.5 w-2/3 rounded-full bg-muted" />
              </div>
              <div className="flex items-center justify-center gap-1 border-t border-border bg-secondary/50 py-1.5">
                <Icon i="search" size={10} className="text-muted-foreground" />
                <span className="font-body text-[9px] font-medium text-muted-foreground">
                  Aperçu
                </span>
              </div>
            </div>
          </div>

          {/* Same product, on a phone — a realistic modern-iPhone frame
              (Dynamic Island, status bar, home indicator), not a shrunk-down
              rectangle. Deliberately kept SMALLER than the desktop mockup
              (h-72 vs. the desktop card's ~300px+) — a supporting visual,
              not the dominant one. */}
          <div className="relative hidden h-72 w-36 flex-shrink-0 rounded-[2rem] border-[6px] border-foreground bg-foreground shadow-2xl lg:block">
            <div className="absolute top-2 left-1/2 z-10 h-3.5 w-14 -translate-x-1/2 rounded-full bg-foreground" />
            <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[1.5rem] bg-canvas">
              <div className="flex items-center justify-between px-3 pt-2.5 pb-0.5">
                <span className="font-body text-[9px] font-semibold text-foreground">9:41</span>
                <div className="flex items-center gap-0.5">
                  <Icon i="signal" size={9} className="text-foreground" />
                  <Icon i="wifi" size={9} className="text-foreground" />
                  <Icon i="battery-full" size={11} className="text-foreground" />
                </div>
              </div>
              <div className="flex-1 overflow-hidden px-2.5 pt-2 pb-9">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-primary">
                      <span className="font-headings text-[7px] font-bold text-primary-foreground">
                        F
                      </span>
                    </div>
                    <span className="font-headings text-[10px] font-bold text-foreground">
                      Freelo
                    </span>
                  </div>
                  <Icon i="bell" size={11} className="text-muted-foreground" />
                </div>
                <div className="rounded-lg bg-primary p-2">
                  <p className="font-body text-[7px] text-primary-foreground/80">Revenus ce mois</p>
                  <p className="font-headings text-sm font-bold text-primary-foreground">
                    850 000 FCFA
                  </p>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border border-border p-1.5">
                    <p className="font-body text-[7px] text-muted-foreground">Projets</p>
                    <p className="font-headings text-xs font-bold text-foreground">4</p>
                  </div>
                  <div className="rounded-md border border-border p-1.5">
                    <p className="font-body text-[7px] text-muted-foreground">Impayées</p>
                    <p className="font-headings text-xs font-bold text-foreground">2</p>
                  </div>
                </div>
                <div className="mt-1.5 rounded-md border border-border p-1.5">
                  <p className="font-body text-[7px] text-muted-foreground">Revenus semaine</p>
                  <div className="mt-1 flex h-8 items-end gap-1">
                    {[40, 65, 50, 70, 90].map((h, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t ${i === 4 ? 'bg-primary' : 'bg-tag-green'}`}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating bottom nav sketch — mirrors the real app's
                  capsule-shaped BottomNav (Sidebar.tsx/BottomNav.tsx), same
                  icon-only-no-labels rule as the desktop sidebar sketch
                  above so it stays accurate if the real nav items change. */}
              <div className="absolute inset-x-4 bottom-4 flex items-center justify-around rounded-full bg-sidebar px-2 py-2 shadow-lg">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>

              <div className="flex justify-center pb-1.5">
                <div className="h-0.5 w-14 rounded-full bg-foreground/30" />
              </div>
            </div>
          </div>
        </div>

        {/* Capability strip — no fabricated numbers: every claim maps to a
            shipped feature (see FEATURES / CAPABILITIES). Payment-method
            mentions were removed from the hero entirely per feedback — that
            story is told once, honestly, in the FAQ instead. */}
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tag-green">
                <Icon i={cap.icon} size={17} className="text-tag-green-fg" />
              </div>
              <p className="font-body text-xs font-semibold text-foreground">{cap.title}</p>
              <p className="font-body text-xs text-muted-foreground">{cap.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problème / solution ────────────────────────────────────── */}
      {/* Section rhythm: alternates white (bg-background, no class) with a
          full-strength pale mint wash (bg-tag-green — #ecfdf5, a genuinely
          different hue from the near-white background/secondary tokens,
          not just a few points of lightness apart). bg-secondary/40 was
          too close to bg-background to read as a distinct section on
          screenshot, which is what prompted this pass. The one saturated
          bg-primary fill stays reserved for the CTA finale + the featured
          Pro pricing card — this wash is deliberately calmer than those. */}
      <section className="border-y border-border bg-tag-green">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
          <Icon i="message-circle" size={30} className="mx-auto mb-4 text-primary/30" />
          <p className="font-headings text-lg font-medium text-foreground italic sm:text-xl">
            « Fini Canva pour la facture, Excel pour les chiffres, WhatsApp pour les échanges — et
            la mise en page à refaire à chaque fois qu’un client paie dans une autre devise. »
          </p>
          <p className="mt-4 font-headings text-base font-bold text-primary sm:text-lg">
            Freelo remplace les 5 outils par un seul espace de travail.
          </p>
        </div>
      </section>

      {/* ── Comment ça marche ──────────────────────────────────────── */}
      <ScrollReveal>
        <section id="comment-ca-marche" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
              De la prise de contact au paiement, en quatre étapes
            </h2>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              Pas de configuration compliquée — le premier lien peut partir aujourd’hui.
            </p>
          </div>
          <div className="relative mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            <div
              aria-hidden
              className="absolute top-6 right-[12%] left-[12%] hidden h-0.5 bg-gradient-to-r from-primary via-primary/40 to-primary lg:block"
            />
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent font-headings text-base font-bold text-primary-foreground shadow-sm ring-4 ring-background">
                  {i + 1}
                </div>
                <div className="mt-3 flex h-9 w-9 items-center justify-center rounded-lg bg-tag-green">
                  <Icon i={step.icon} size={16} className="text-tag-green-fg" />
                </div>
                <h3 className="mt-3 font-headings text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-1.5 max-w-[220px] font-body text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ── Fonctionnalités ─────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="fonctionnalites" className="border-t border-border bg-tag-green">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
                Tout ce qu’il te faut, rien de superflu
              </h2>
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Chaque fonctionnalité répond à un vrai blocage du quotidien freelance.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className={`${
                    feature.inverted
                      ? 'rounded-lg border border-primary bg-primary p-5 shadow-card'
                      : inputCardClass
                  } ${feature.pinBelowHighlight ? 'lg:col-start-2' : ''}`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      feature.inverted ? 'bg-canvas' : 'bg-tag-green'
                    }`}
                  >
                    <Icon
                      i={feature.icon}
                      size={18}
                      className={feature.inverted ? 'text-primary' : 'text-tag-green-fg'}
                    />
                  </div>
                  <h3
                    className={`mt-4 font-headings text-base font-semibold ${
                      feature.inverted ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className={`mt-1.5 font-body text-sm ${
                      feature.inverted ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Comparatif ──────────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="comparatif" className="border-t border-border px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
                Freelo remplace le patchwork, pas ta façon de travailler
              </h2>
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Ce que change concrètement un seul espace de travail, poste par poste.
              </p>
            </div>
            <div className="mt-10">
              <ComparisonTable rows={COMPARISON_ROWS} />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Personas ("Pensé pour") ─────────────────────────────────── */}
      <ScrollReveal>
        <section className="border-t border-border bg-tag-green">
          <div className="mx-auto max-w-2xl px-4 pt-16 text-center sm:px-6">
            <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
              Pensé pour des freelances comme toi
            </h2>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              Des profils types que Freelo a été conçu pour servir.
            </p>
          </div>
          {/* Bleeds full-width (no max-w container) — the horizontal scroll
              reads as intentional edge-to-edge motion, not a marquee
              cramped inside the page's usual content column. */}
          <div className="pb-16">
            <PersonasMarquee personas={PERSONAS} />
          </div>
        </section>
      </ScrollReveal>

      {/* ── Tarifs ──────────────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="tarifs" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          {/* Light panel, not a full green wash — green is reserved for the
              featured Pro card itself so it's the one thing that actually
              stands out, not competing with a saturated background. Sits on
              the white section behind it, so the panel reads as "raised"
              via border + shadow rather than a color fill (bg-secondary/40
              was too close to the page background to register as a card). */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-canvas px-4 py-14 shadow-xl sm:px-10 sm:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <span className="rounded-full bg-tag-green px-3 py-1 font-body text-xs font-semibold tracking-wide text-tag-green-fg uppercase">
                Tarifs
              </span>
              <h2 className="mt-4 font-headings text-2xl font-bold text-foreground sm:text-3xl">
                Des tarifs simples, pensés pour les freelances
              </h2>
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Commence gratuitement. Passe en Pro quand ton activité grandit.
              </p>
            </div>
            <PricingToggle freeFeatures={FREE_FEATURES} proFeatures={PRO_FEATURES} />
            <p className="mt-8 text-center font-body text-xs text-muted-foreground">
              Crée ton compte gratuitement — aucun paiement requis pour démarrer.
            </p>
          </div>
        </section>
      </ScrollReveal>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="faq" className="border-t border-border bg-tag-green">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-center font-headings text-2xl font-bold text-foreground sm:text-3xl">
              Questions fréquentes
            </h2>
            <div className="mt-8 flex flex-col divide-y divide-border">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-body text-sm font-medium text-foreground">
                    {faq.question}
                    <Icon
                      i="chevron-down"
                      size={16}
                      className="flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="mt-2 font-body text-sm text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── CTA finale ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-accent">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1.5px, transparent 1.5px)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
          <h2 className="font-headings text-2xl font-bold text-white sm:text-3xl">
            Ton prochain client mérite mieux qu’un fichier Excel.
          </h2>
          <p className="max-w-md font-body text-sm text-white/85">
            Crée ton compte, installe Freelo sur ton écran d’accueil, et partage ton premier lien de
            suivi client aujourd’hui.
          </p>
          <Link
            href="/signup"
            className="rounded-md bg-white px-6 py-3 font-body text-sm font-semibold text-foreground"
          >
            Commencer gratuitement
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
                <span className="font-headings text-sm font-bold text-primary-foreground">F</span>
              </div>
              <span className="font-headings text-base font-bold text-foreground">Freelo</span>
            </div>
            <p className="max-w-xs font-body text-xs text-muted-foreground">
              L’espace de travail des freelances d’Afrique francophone.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-16">
            <div className="flex flex-col gap-2">
              <span className="font-body text-xs font-semibold text-foreground">Produit</span>
              <a href="#comment-ca-marche" className="font-body text-xs text-muted-foreground">
                Comment ça marche
              </a>
              <a href="#comparatif" className="font-body text-xs text-muted-foreground">
                Comparatif
              </a>
              <a href="#tarifs" className="font-body text-xs text-muted-foreground">
                Tarifs
              </a>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-body text-xs font-semibold text-foreground">Compte</span>
              <Link href="/login" className="font-body text-xs text-muted-foreground">
                Connexion
              </Link>
              <Link href="/signup" className="font-body text-xs text-muted-foreground">
                Inscription
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 text-center font-body text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Freelo. Tous droits réservés.
        </div>
      </footer>

      <InstallPromptWidget variant="public" />
    </div>
  );
}
