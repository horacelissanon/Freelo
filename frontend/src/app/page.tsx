// Landing page (PRD §3.13) — the app's public entry point for visitors.
// Server-rendered, no client JS required (the FAQ accordion uses native
// <details>/<summary>, entrance motion is pure CSS via globals.css
// @keyframes) so it stays fast on the low-end-phone / 2G-3G connections the
// PRD calls out. Content is scoped to what's ACTUALLY shipped today — no
// fabricated user counts or testimonials; the trust strip lists the real
// payment rails Bictorys/withdrawals actually support (Wave, Orange Money,
// MTN Mobile Money — see app/api/withdrawals/route.ts), and the "Pensé pour"
// section uses the PRD's own named personas (Aminata, Koffi) framed
// explicitly as target personas, not attributed customer quotes.
export const runtime = 'nodejs';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';

const PAYMENT_METHODS = ['Wave', 'Orange Money', 'MTN Mobile Money', 'Carte bancaire'];

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
    title: 'Devis & factures en FCFA',
    description:
      'Numérotation automatique, aperçu en direct pendant la saisie, export propre — natif FCFA.',
  },
  {
    icon: 'link',
    title: 'Lien de suivi client',
    description:
      'Un lien unique, sans inscription : ton client consulte l’avancement, commente et règle sa facture.',
  },
  {
    icon: 'smartphone',
    title: 'Paiement mobile money',
    description:
      'En plan Pro, ton client règle l’acompte ou le solde directement depuis le lien de suivi.',
  },
  {
    icon: 'trending-up',
    title: 'Tableau de bord clair',
    description:
      'Projets actifs, montant encaissé, factures impayées — l’essentiel en un coup d’œil à l’ouverture.',
  },
];

const PERSONAS: { name: string; role: string; pain: string; solution: string }[] = [
  {
    name: 'Aminata',
    role: 'Graphiste freelance, Abidjan',
    pain: 'Devis sur Word, factures sur Excel, échanges sur WhatsApp — elle a déjà oublié de facturer un client.',
    solution:
      'Avec Freelo, chaque projet a sa facture rattachée et son lien de suivi : plus rien ne se perd entre deux outils.',
  },
  {
    name: 'Koffi',
    role: 'Designer UI/UX freelance, Cotonou',
    pain: 'Ses clients locaux paient en mobile money, ceux de la diaspora par carte — aucun outil ne gère les deux sur un même document.',
    solution:
      'Freelo facture nativement en FCFA (EUR/USD en Pro) et centralise tous les échanges projet par projet.',
  },
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
    question: 'Quels moyens de paiement mes clients peuvent-ils utiliser ?',
    answer:
      'Le paiement mobile money directement depuis le lien de suivi est disponible en plan Pro. En plan Gratuit, le lien reste consultable en lecture seule.',
  },
  {
    question: 'Puis-je facturer en euros ou en dollars ?',
    answer:
      'Le plan Gratuit facture en FCFA uniquement. Le plan Pro débloque l’émission en EUR et USD, utile pour les clients de la diaspora.',
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
            Freelo centralise tes clients, tes projets et tes factures — et donne à chaque client un
            lien pro pour suivre son projet et régler en Wave, Orange Money ou MTN, sans jamais
            créer de compte.
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

        {/* Payment methods trust strip — real rails, not fabricated numbers. */}
        <div className="mx-auto mt-16 flex max-w-3xl flex-col items-center gap-3 text-center">
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
            « WhatsApp pour les échanges, Excel pour les factures, un carnet pour les contacts — et
            des relances client sans fin. »
          </p>
          <p className="mt-3 font-body text-sm font-medium text-foreground">
            Freelo remplace les 5 outils par un seul espace de travail.
          </p>
        </div>
      </section>

      {/* ── Comment ça marche ──────────────────────────────────────── */}
      <section id="comment-ca-marche" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
            De la prise de contact au paiement, en trois étapes
          </h2>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            Pas de configuration compliquée — le premier lien peut partir aujourd’hui.
          </p>
        </div>
        <div className="relative mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
          <div
            aria-hidden
            className="absolute top-6 right-[16.5%] left-[16.5%] hidden h-0.5 bg-gradient-to-r from-primary via-primary/40 to-primary sm:block"
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

      {/* ── Fonctionnalités ─────────────────────────────────────────── */}
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

      {/* ── Personas ("Pensé pour") ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
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
                  <p className="font-body text-sm font-semibold text-foreground">{persona.name}</p>
                  <p className="font-body text-xs text-muted-foreground">{persona.role}</p>
                </div>
              </div>
              <p className="relative mt-4 font-body text-sm text-muted-foreground">
                « {persona.pain} »
              </p>
              <p className="relative mt-3 font-body text-sm text-foreground">{persona.solution}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tarifs ──────────────────────────────────────────────────── */}
      <section id="tarifs" className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-headings text-2xl font-bold text-foreground sm:text-3xl">
              Des tarifs pensés pour l’Afrique francophone
            </h2>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              Commence gratuitement. Passe en Pro quand ton activité grandit.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
            <div className={inputCardClass}>
              <p className="font-headings text-base font-semibold text-foreground">Gratuit</p>
              <p className="mt-1 font-headings text-3xl font-bold text-foreground">0 FCFA</p>
              <ul className="mt-4 flex flex-col gap-2">
                {[
                  '1 client',
                  '2 projets actifs',
                  'Devis & factures en FCFA',
                  'Lien de suivi en lecture seule',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 font-body text-sm text-muted-foreground"
                  >
                    <Icon
                      i="check-circle"
                      size={15}
                      className="mt-0.5 flex-shrink-0 text-primary"
                    />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-6 block rounded-md border border-border px-4 py-2.5 text-center font-body text-sm font-medium text-foreground"
              >
                Commencer gratuitement
              </Link>
            </div>
            <div className={`${inputCardClass} relative border-primary`}>
              <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 font-body text-[11px] font-semibold tracking-wide text-primary-foreground uppercase">
                Le plus choisi
              </span>
              <p className="font-headings text-base font-semibold text-foreground">Pro</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <p className="font-headings text-3xl font-bold text-foreground">3 500 FCFA</p>
                <span className="font-body text-xs text-muted-foreground">/mois</span>
              </div>
              <p className="font-body text-xs text-muted-foreground">ou 35 000 FCFA/an</p>
              <ul className="mt-4 flex flex-col gap-2">
                {[
                  'Clients & projets illimités',
                  'Devis & factures en FCFA, EUR, USD',
                  'Lien de suivi interactif + paiement mobile money',
                  'Sans filigrane sur les documents',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 font-body text-sm text-foreground"
                  >
                    <Icon
                      i="check-circle"
                      size={15}
                      className="mt-0.5 flex-shrink-0 text-primary"
                    />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-6 block rounded-md bg-primary px-4 py-2.5 text-center font-body text-sm font-medium text-primary-foreground"
              >
                Essayer le plan Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
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
      </section>

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
            Crée ton compte en quelques minutes et partage ton premier lien de suivi client
            aujourd’hui.
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
    </div>
  );
}
