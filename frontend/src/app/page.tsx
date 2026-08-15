// Landing page (PRD §3.13) — the app's public entry point for visitors.
// Server-rendered; the only client JS is two small progressive-enhancement
// islands (ScrollReveal for the fade-in-on-scroll effect, PricingToggle for
// the Mensuel/Annuel switch) so it stays fast on the low-end-phone / 2G-3G
// connections the PRD calls out — everything else, including content, works
// with zero JS. Content is scoped to what's ACTUALLY shipped today — no
// fabricated user counts or testimonials; the trust strip lists the real
// payment rails Bictorys/withdrawals actually support (Wave, Orange Money,
// MTN Mobile Money — see app/api/withdrawals/route.ts), and the "Pensé pour"
// section uses named personas (Aminata, Koffi) framed explicitly as target
// personas, not attributed customer quotes. Restructured/rewritten
// 2026-08-15, inspired by a competitor's landing structure (numbered steps,
// capability strip, comparison table, tiered pricing with a billing toggle,
// richer FAQ) but with entirely original copy and zero fabricated blocks —
// no fake trust numbers, no WhatsApp community banner (no real link to
// give), no "free courses" section (no such feature exists in this app).
export const runtime = 'nodejs';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingToggle } from '@/components/marketing/PricingToggle';
import { ComparisonTable, type ComparisonRow } from '@/components/marketing/ComparisonTable';
import { InstallPromptWidget } from '@/components/InstallPromptWidget';

const PAYMENT_METHODS = ['Wave', 'Orange Money', 'MTN Mobile Money', 'Carte bancaire'];

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
    icon: 'smartphone',
    title: 'Wave · Orange Money · MTN',
    description: 'Ton client règle depuis le lien de suivi, en plan Pro.',
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
    title: 'Sois payé, sans relance',
    description:
      'Ton client règle l’acompte ou le solde en Wave, Orange Money ou MTN, depuis le même lien.',
  },
];

const FEATURES: { icon: string; title: string; description: string }[] = [
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
    icon: 'link',
    title: 'Lien de suivi client',
    description:
      'Un lien unique, sans inscription : ton client consulte l’avancement, commente et règle sa facture.',
  },
  {
    icon: 'bell',
    title: 'Alertes automatiques',
    description:
      'Échéance de projet qui approche, facture en retard — Freelo te prévient avant que ton client s’en inquiète.',
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

const PERSONAS: { name: string; role: string; pain: string; solution: string }[] = [
  {
    name: 'Aminata',
    role: 'Graphiste freelance, Abidjan',
    pain: 'Devis composés sur Canva, factures sur Excel, échanges sur WhatsApp — elle a déjà oublié de facturer un client.',
    solution:
      'Avec Freelo, chaque projet a son devis, sa facture et son lien de suivi rattachés : plus rien ne se perd entre deux outils.',
  },
  {
    name: 'Koffi',
    role: 'Designer UI/UX freelance, Cotonou',
    pain: 'Ses clients locaux paient en mobile money, ceux de la diaspora par carte — aucun outil ne gère les deux sur un même document.',
    solution:
      'Freelo facture nativement en FCFA (EUR/USD en Pro), avec un devis qui propose plusieurs formules et un acompte par offre.',
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
  'Lien de suivi interactif + paiement mobile money',
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
    question: 'Comment mes clients règlent-ils leurs factures ?',
    answer:
      'Directement depuis le lien de suivi, en Wave, Orange Money ou MTN Mobile Money — disponible en plan Pro. En plan Gratuit, le lien reste consultable en lecture seule.',
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
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
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
            <a href="#fonctionnalites" className="hover:text-foreground">
              Fonctionnalités
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
      <section className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-gradient-to-b from-tag-green/60 to-transparent"
        />
        <div className="animate-fade-in mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <span className="rounded-full bg-tag-green px-3 py-1 font-body text-xs font-medium text-tag-green-fg">
            Conçu pour les freelances d’Afrique francophone
          </span>
          <h1 className="font-headings text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Arrête de courir après tes clients pour être payé.
          </h1>
          <p className="max-w-xl font-body text-base text-muted-foreground sm:text-lg">
            Fini Canva, Photoshop ou Word pour composer un devis. Freelo génère des devis et
            factures pros en FCFA, EUR ou USD, et donne à chaque client un lien pour suivre son
            projet et régler en Wave, Orange Money ou MTN — sans jamais créer de compte.
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
            than a screenshot, so it never goes stale as the UI evolves. */}
        <div className="animate-slide-up-in relative mx-auto mt-14 max-w-4xl">
          <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-card">
            <div className="flex items-center gap-1.5 border-b border-border bg-secondary/60 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-tag-red-fg/50" />
              <span className="h-2.5 w-2.5 rounded-full bg-tag-orange-fg/50" />
              <span className="h-2.5 w-2.5 rounded-full bg-tag-green-fg/50" />
              <span className="ml-3 truncate font-body text-xs text-muted-foreground">
                freelo.app/dashboard
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 sm:p-6">
              <div className={inputCardClass}>
                <p className="font-body text-xs text-muted-foreground">Projets actifs</p>
                <p className="font-headings text-2xl font-bold text-foreground">4</p>
                <p className="mt-1 font-body text-xs text-tag-green-fg">+2 ce mois-ci</p>
              </div>
              <div className={inputCardClass}>
                <p className="font-body text-xs text-muted-foreground">Encaissé ce mois</p>
                <p className="font-headings text-2xl font-bold text-foreground">850 000 FCFA</p>
                <p className="mt-1 font-body text-xs text-tag-green-fg">3 factures payées</p>
              </div>
              <div className={inputCardClass}>
                <p className="font-body text-xs text-muted-foreground">Lien de suivi</p>
                <p className="font-headings text-2xl font-bold text-foreground">100 %</p>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  Zéro inscription client
                </p>
              </div>
            </div>
          </div>

          {/* Floating cards — the two moments that matter most: sending the
              link, getting paid. Hidden below sm: nowhere to float on a
              narrow viewport without overlapping the mockup itself. */}
          <div className="animate-slide-up-in absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-lg border border-border bg-canvas p-3 shadow-xl sm:flex">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-tag-green">
              <Icon i="check-circle" size={16} className="text-tag-green-fg" />
            </div>
            <div>
              <p className="font-body text-xs font-semibold text-foreground">Facture payée</p>
              <p className="font-body text-xs text-tag-green-fg">+150 000 FCFA</p>
            </div>
          </div>
          <div className="absolute -top-5 -right-3 hidden items-center gap-2 rounded-lg border border-border bg-canvas p-3 shadow-xl sm:flex">
            <Avatar name="Aïssatou" className="h-8 w-8 flex-shrink-0 text-xs" />
            <div>
              <p className="font-body text-xs font-semibold text-foreground">Lien envoyé</p>
              <p className="font-body text-xs text-muted-foreground">à Aïssatou</p>
            </div>
          </div>
        </div>

        {/* Capability strip — merges the former payment-only trust strip
            with real product capabilities. No fabricated numbers: every
            claim maps to a shipped feature (see FEATURES / CAPABILITIES). */}
        <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
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
        <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-2 text-center">
          <p className="font-body text-xs font-medium text-muted-foreground">
            Compatible avec les moyens de paiement que tes clients utilisent déjà
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PAYMENT_METHODS.map((method) => (
              <span
                key={method}
                className="rounded-full border border-border bg-canvas px-3.5 py-1.5 font-body text-xs font-medium text-foreground"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problème / solution ────────────────────────────────────── */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-4xl px-4 py-10 text-center sm:px-6">
          <p className="font-body text-sm text-muted-foreground italic">
            « Canva pour la facture, Excel pour les chiffres, WhatsApp pour les échanges — et une
            mise en page à refaire à chaque fois qu’un client paie dans une autre devise. »
          </p>
          <p className="mt-3 font-body text-sm font-medium text-foreground">
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
        <section id="fonctionnalites" className="border-t border-border bg-secondary/40">
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

      {/* ── Comparatif ──────────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="comparatif" className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
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
        </section>
      </ScrollReveal>

      {/* ── Personas ("Pensé pour") ─────────────────────────────────── */}
      <ScrollReveal>
        <section className="border-t border-border bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
                Pensé pour des freelances comme toi
              </h2>
              <p className="mt-2 font-body text-sm text-muted-foreground">
                Deux profils types que Freelo a été conçu pour servir.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
              {PERSONAS.map((persona) => (
                <div key={persona.name} className={`${inputCardClass} relative overflow-hidden`}>
                  <Icon
                    i="message-circle"
                    size={60}
                    className="pointer-events-none absolute -top-3 -right-3 text-tag-green/40"
                  />
                  <div className="relative flex items-center gap-3">
                    <Avatar name={persona.name} className="h-10 w-10 flex-shrink-0 text-sm" />
                    <div>
                      <p className="font-body text-sm font-semibold text-foreground">
                        {persona.name}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">{persona.role}</p>
                    </div>
                  </div>
                  <p className="relative mt-4 font-body text-sm text-muted-foreground">
                    « {persona.pain} »
                  </p>
                  <p className="relative mt-3 font-body text-sm text-foreground">
                    {persona.solution}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Tarifs ──────────────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="tarifs" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
              Des tarifs pensés pour l’Afrique francophone
            </h2>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              Commence gratuitement. Passe en Pro quand ton activité grandit.
            </p>
          </div>
          <PricingToggle freeFeatures={FREE_FEATURES} proFeatures={PRO_FEATURES} />
        </section>
      </ScrollReveal>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <ScrollReveal>
        <section id="faq" className="border-t border-border bg-secondary/40">
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
              <a href="#fonctionnalites" className="font-body text-xs text-muted-foreground">
                Fonctionnalités
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
