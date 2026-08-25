// Landing page (PRD §3.13) — the app's public entry point for visitors.
// Server-rendered; client JS is four small progressive-enhancement islands
// (ScrollReveal for the fade-in-on-scroll effect, PricingToggle for the
// Mensuel/Annuel switch, ProductDemo for the clickable dashboard/clients/
// devis/factures tour, MobileNav for the phone-width header dropdown) so it
// stays fast on the low-end-phone / 2G-3G connections the PRD calls out —
// everything else, including content, works with zero JS (ProductDemo
// server-renders the Tableau de bord tab in full; only clicking through to
// the other three tabs needs JS). Content is scoped to what's ACTUALLY
// shipped today — no
// fabricated user counts or testimonials, and no overclaiming payment
// processing that doesn't exist: ZeFacto does NOT collect payment from a
// freelancer's client on their behalf — a freelancer indicates their
// preferred payment method (MTN Mobile Money, Moov Money…) and it's displayed on
// the devis/facture; the client settles directly, outside the app. Every
// payment-related line on this page is worded around that, not around
// in-app processing. The "Pensé pour" section uses named personas framed
// explicitly as target personas ("Profil type" badge on every card, see
// PersonasMarquee.tsx), not attributed customer quotes — first-person copy
// is a style choice, not a claim that a real person said this. Kept to just
// 2 fixed cards, no carousel/scroll. Restructured/rewritten 2026-08-15, inspired by a competitor's
// landing structure (numbered steps, capability strip, comparison table,
// tiered pricing with a billing toggle, richer FAQ) but with entirely
// original copy and zero fabricated blocks — no fake trust numbers, no
// "free courses" section (no such feature exists in this app). The
// WhatsApp community section (added 2026-08-24) is real. Its invite link
// (and the dashboard banner's own WhatsApp button) is Super-Admin-editable
// at runtime (Paramètres → Général → PATCH /api/admin/settings) — see
// useCommunityWhatsappUrl — and falls back to a placeholder
// (COMMUNITY_WHATSAPP_URL in lib/constants.ts) until a real group exists.
export const runtime = 'nodejs';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingToggle } from '@/components/marketing/PricingToggle';
import { ComparisonTable, type ComparisonRow } from '@/components/marketing/ComparisonTable';
import { RotatingWord } from '@/components/marketing/RotatingWord';
import { HeaderAuthCta } from '@/components/marketing/HeaderAuthCta';
import { MobileNav } from '@/components/marketing/MobileNav';
import { PersonasMarquee } from '@/components/marketing/PersonasMarquee';
import { InstallPromptWidget } from '@/components/InstallPromptWidget';
import { ProductDemo } from '@/components/marketing/ProductDemo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { CommunityWhatsAppCta } from '@/components/marketing/CommunityWhatsAppCta';

// Rotates in the hero H1 so "who this is for" stays visible and inclusive
// — ZeFacto isn't scoped to graphic designers specifically, unlike the
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

const COMMUNITY_BENEFITS: string[] = [
  "Pose tes questions à l'équipe et aux autres freelances",
  'Partage tes retours et tes idées de fonctionnalités',
  'Sois informé·e en avant-première des nouveautés',
];

const STEPS: { icon: string; title: string; description: string }[] = [
  {
    icon: 'users',
    title: 'Ajoute ton client',
    description: 'Un code unique par client — plus jamais de confusion entre deux Aïssatou.',
  },
  {
    icon: 'file-text',
    title: 'Envoie ton devis',
    description:
      'Un lien pro que ton client ouvre en un clic, pas un PDF qui se perd dans les emails.',
  },
  {
    icon: 'layout-dashboard',
    title: 'Structure le projet',
    description: 'Des étapes personnalisables que ton client voit avancer en temps réel.',
  },
  {
    icon: 'banknote',
    title: 'Sois payé, sans confusion',
    description:
      'Ton moyen de paiement (MTN Mobile Money, Moov Money…) apparaît clairement sur le devis ou la facture.',
  },
];

// 6 cards, uniform shell (rounded-lg p-5 shadow-card, same icon-badge size,
// same text sizes, same colors) — 2 clean rows of 3 at lg, no orphan card,
// no explicit grid-position overrides needed.
const FEATURES: {
  icon: string;
  title: string;
  description: string;
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
    icon: 'file-check',
    title: 'Une validation qui fait foi',
    description:
      'Propose plusieurs formules sur un devis — ton client choisit et valide la sienne, prix figé dès l’acceptation.',
  },
  {
    icon: 'receipt',
    title: 'Factures multi-devises',
    description:
      'Un design pro généré automatiquement en FCFA, EUR ou USD selon le client — plus besoin de Canva ou Photoshop pour composer un devis.',
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
      'Échéance de projet qui approche, facture en retard — ZeFacto te prévient avant que ton client s’en inquiète.',
  },
];

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    category: 'Organisation',
    headline: 'Un espace, pas cinq',
    zefacto: 'Clients, projets, devis et factures réunis au même endroit.',
    patchwork: 'WhatsApp pour les échanges, Excel pour les chiffres, un carnet pour les contacts.',
  },
  {
    category: 'Suivi client',
    headline: 'Un lien, zéro relance',
    zefacto: 'Ton client suit son projet en temps réel, sans jamais créer de compte.',
    patchwork: 'PDF envoyés par email, relances manuelles répétées pour savoir où ça en est.',
  },
  {
    category: 'Devises',
    headline: 'Prêt pour tes clients d’ici et d’ailleurs',
    zefacto: 'Devis et factures générés directement en FCFA, EUR ou USD selon le client.',
    patchwork: 'Une maquette Canva ou Photoshop à refaire à la main pour chaque devise.',
  },
  {
    category: 'Accès',
    headline: 'Toujours à portée de main',
    zefacto: 'App installable, rapide même sur une connexion faible.',
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
      'Depuis ZeFacto, chaque projet a son devis, sa facture et son lien de suivi rattachés : plus rien ne se perd entre deux outils.',
  },
  {
    name: 'Koffi',
    role: 'Designer UI/UX freelance, Cotonou',
    pain: 'Un client me redemandait sans arrêt des retouches, en disant ne jamais avoir validé le prix de départ.',
    solution:
      'Depuis, il valide lui-même l’offre choisie sur son lien de suivi — le prix est figé, plus de discussion sans fin sur ce qui avait été convenu.',
  },
];

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'ZeFacto est-il vraiment gratuit ?',
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
    question: 'Mes clients paient-ils directement depuis ZeFacto ?',
    answer:
      'Pas encore — ZeFacto n’encaisse pas à ta place. Tu indiques le moyen de paiement de ton choix (MTN Mobile Money, Moov Money…) directement sur le devis ou la facture, et ton client te règle en direct. Une intégration de paiement en ligne est prévue pour une prochaine version.',
  },
  {
    question: 'Puis-je facturer en euros ou en dollars ?',
    answer:
      'Le plan Gratuit facture en FCFA uniquement. Le plan Pro débloque l’émission en EUR et USD, utile pour les clients de la diaspora.',
  },
  {
    question: 'ZeFacto fonctionne-t-il sur mobile ?',
    answer:
      'Oui — ZeFacto est une application installable (PWA). Ajoute-la à l’écran d’accueil de ton téléphone ou de ton ordinateur pour l’utiliser comme une app native, sans passer par un store.',
  },
  {
    question: 'Que se passe-t-il si je dépasse les limites du plan Gratuit ?',
    answer:
      'Tu peux passer au plan Pro à tout moment depuis Paramètres → Abonnement. Aucune interruption, tes données restent intactes.',
  },
  {
    question: 'Suis-je prévenu si un client tarde à payer ?',
    answer:
      'Oui. ZeFacto surveille les échéances de tes projets et de tes factures et t’alerte automatiquement — dans l’app et sur ton tableau de bord — avant qu’un retard ne devienne un problème.',
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
              <svg
                viewBox="0 0 64 64"
                className="h-5 w-5 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth={8}
                strokeLinecap="square"
              >
                <line x1="17" y1="19" x2="47" y2="19" />
                <line x1="17" y1="45" x2="47" y2="45" />
                <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
              </svg>
            </div>
            {/* Hidden below sm — the mobile header row (logo + ThemeToggle +
                "Commencer gratuitement" + hamburger, see MobileNav) is
                already tight enough on a narrow phone that keeping the full
                wordmark here pushes the CTA text into wrapping/overflow;
                the icon alone still reads as the brand mark. */}
            <span className="hidden font-headings text-lg font-bold tracking-tight text-foreground sm:inline">
              ZeFacto
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
          <div className="hidden items-center gap-1.5 sm:gap-2 md:flex">
            <ThemeToggle />
            <HeaderAuthCta />
          </div>
          <MobileNav />
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
          <Link
            href="/login?mode=signup"
            className="rounded-md bg-primary px-6 py-3 font-body text-sm font-semibold text-primary-foreground"
          >
            Commencer gratuitement
          </Link>
          <p className="font-body text-xs text-muted-foreground">
            Gratuit pour démarrer · Aucune carte bancaire requise
          </p>

          {/* Capability pills — real, shipped features only (no "Contrats" /
              "Formulaires" style pills for capabilities ZeFacto doesn't have). */}
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
            than a screenshot, so it never goes stale as the UI evolves. Now
            a real interactive read-only tour (ProductDemo) instead of a
            static sketch — see that file's own comment for the
            progressive-enhancement contract. */}
        <ProductDemo />
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
          <div className="relative mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-6 lg:grid-cols-4">
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
                <div key={feature.title} className={inputCardClass}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-tag-green">
                    <Icon i={feature.icon} size={18} className="text-tag-green-fg" />
                  </div>
                  <h3 className="mt-4 font-headings text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 font-body text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Communauté WhatsApp ─────────────────────────────────────── */}
      <ScrollReveal>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-accent px-6 py-12 shadow-lg sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: 'radial-gradient(circle, #ffffff 1.5px, transparent 1.5px)',
                backgroundSize: '20px 20px',
              }}
            />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
                <WhatsAppIcon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-headings text-2xl font-bold text-white sm:text-3xl">
                La communauté ZeFacto, sur WhatsApp
              </h2>
              <p className="max-w-md font-body text-sm text-white/85">
                Échange avec d'autres freelances, pose tes questions, sois informé·e en premier des
                nouveautés — gratuit, sans spam.
              </p>
              <ul className="mt-2 flex flex-col gap-2 text-left sm:items-start">
                {COMMUNITY_BENEFITS.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-2 font-body text-sm text-white/90"
                  >
                    <Icon i="check-circle" size={16} className="mt-0.5 flex-shrink-0 text-white" />
                    {benefit}
                  </li>
                ))}
              </ul>
              <CommunityWhatsAppCta />
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
                ZeFacto remplace le patchwork, pas ta façon de travailler
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
              Des profils types que ZeFacto a été conçu pour servir.
            </p>
          </div>
          <div className="px-4 pb-16 sm:px-6">
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
              was too close to the page background to register as a card).
              Padding/radius/shadow kept modest (not py-16/rounded-3xl/
              shadow-xl) so the frame doesn't dwarf the pricing cards it's
              wrapping. */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-canvas px-4 py-10 shadow-lg sm:px-8 sm:py-12">
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
            <PricingToggle />
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
            Crée ton compte, installe ZeFacto sur ton écran d’accueil, et partage ton premier lien
            de suivi client aujourd’hui.
          </p>
          <Link
            href="/login?mode=signup"
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
                <svg
                  viewBox="0 0 64 64"
                  className="h-4 w-4 text-primary-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={8}
                  strokeLinecap="square"
                >
                  <line x1="17" y1="19" x2="47" y2="19" />
                  <line x1="17" y1="45" x2="47" y2="45" />
                  <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
                </svg>
              </div>
              <span className="font-headings text-base font-bold text-foreground">ZeFacto</span>
            </div>
            <p className="max-w-xs font-body text-xs text-muted-foreground">
              L’espace de travail pensé pour les freelances et consultants indépendants.
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
              <Link href="/login?mode=signup" className="font-body text-xs text-muted-foreground">
                Inscription
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-body text-xs font-semibold text-foreground">Légal</span>
              <Link href="/mentions-legales" className="font-body text-xs text-muted-foreground">
                Mentions légales
              </Link>
              <Link href="/confidentialite" className="font-body text-xs text-muted-foreground">
                Confidentialité
              </Link>
              <Link href="/cookies" className="font-body text-xs text-muted-foreground">
                Cookies
              </Link>
              <Link href="/cgu" className="font-body text-xs text-muted-foreground">
                CGU
              </Link>
              <Link href="/cgv" className="font-body text-xs text-muted-foreground">
                CGV
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 text-center font-body text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} ZeFacto. Tous droits réservés.
        </div>
      </footer>

      <InstallPromptWidget variant="public" />
    </div>
  );
}
