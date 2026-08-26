// Shows the actual client-facing devis (quote) page instead of talking
// about it — mirrors app/suivi/[token]/page.tsx's real gradient header
// (quote number, client, status, issue date) and its "Nos offres" pack
// cards (numbered badge, big price, description, turnaround, "Sélectionnée"
// badge), same "built from the app's own visual language" approach as
// ProductDemo.tsx before it. Server-rendered, but "Valider ce devis" is a
// real Link — a visitor clicking it on the marketing page has no actual
// devis to validate, so it routes to signup instead, same nudge pattern as
// every clickable element in ProductDemo.tsx.
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const CHECKLIST = [
  'Plusieurs formules sur un seul devis — ton client compare, pas de choix imposé',
  'Il valide sa formule en un clic, directement sur le lien',
  'Le prix est figé dès l’acceptation : plus de discussion sur ce qui a été convenu',
];

export function DevisShowcase() {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-5 lg:gap-14">
      <div className="lg:col-span-2">
        <span className="rounded-full bg-tag-green px-3 py-1 font-body text-xs font-semibold tracking-wide text-tag-green-fg uppercase">
          Devis
        </span>
        <h2 className="mt-4 font-headings text-2xl font-bold text-foreground sm:text-3xl">
          Ton client choisit, valide, et le prix ne bouge plus
        </h2>
        <p className="mt-3 font-body text-sm text-muted-foreground">
          Un devis à formules, pas un PDF figé — ton client compare, sélectionne son offre et la
          valide lui-même. Prix figé dès l’acceptation, fini les malentendus.
        </p>
        <ul className="mt-5 flex flex-col gap-3">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <Icon i="check-circle" size={16} className="mt-0.5 flex-shrink-0 text-tag-green-fg" />
              <span className="font-body text-sm text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="lg:col-span-3">
        <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-card">
          <div className="flex items-center gap-1.5 border-b border-border bg-secondary/60 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-tag-red-fg/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-tag-orange-fg/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-tag-green-fg/50" />
            <span className="ml-3 truncate font-body text-xs text-muted-foreground">
              zefacto.app/devis/qt-2026-004
            </span>
          </div>
          <div className="p-4 sm:p-5">
            {/* Compact version of the real hero header (quote number,
                client, status, issue date) — sits outside the scroll area,
                just above "Nos offres", so it's always visible on load
                instead of competing with the offers for the same scroll
                real estate. */}
            <div className="relative mb-3 overflow-hidden rounded-lg bg-gradient-to-br from-primary to-track-hero p-3">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'radial-gradient(circle, #ffffff 1.5px, transparent 1.5px)',
                  backgroundSize: '14px 14px',
                }}
              />
              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-body text-[9px] tracking-widest text-white/70 uppercase">
                    Devis pour Fatou Ndiaye
                  </p>
                  <h3 className="mt-0.5 font-headings text-sm font-bold text-white">
                    DEV-2026-014
                  </h3>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 font-body text-[9px] font-medium text-white backdrop-blur-sm">
                    <Icon i="clock" size={10} />
                    En attente
                  </span>
                  {/* Mirrors the real page's PDF download button — decorative
                      here (à titre indicatif), no real devis to fetch. */}
                  <span className="flex items-center gap-1 rounded-md bg-white px-2 py-1 font-body text-[9px] font-medium text-primary">
                    <Icon i="download" size={9} />
                    Télécharger
                  </span>
                </div>
              </div>
              <p className="relative mt-2 font-body text-[9px] text-white/70">
                Émis le 3 août 2026
              </p>
            </div>

            {/* Bounded height + scroll on this inner region only, offers
                first in DOM order — a visitor sees the pack prices
                immediately, no scrolling required, then can scroll to see
                the rest of what a real devis carries (conditions, modalités
                de paiement). "Valider ce devis" sits outside/below the
                scroll area so it — like the real app's own sticky
                confirm bar — stays reachable without scrolling. */}
            <div className="max-h-[220px] overflow-y-auto overscroll-contain pr-1">
              <div className="mb-3 flex items-center gap-2">
                <Icon i="layout-grid" size={14} className="flex-shrink-0 text-primary" />
                <p className="font-headings text-sm font-bold text-foreground">Nos offres</p>
              </div>
              <p className="-mt-1 mb-3 font-body text-[11px] text-muted-foreground">
                Choisissez une des offres ci-dessous — chacune a son propre tarif.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="relative flex flex-col gap-2 rounded-lg border-2 border-primary bg-canvas p-4 shadow-card">
                  <span className="absolute -top-2.5 left-3 rounded-full bg-primary px-2 py-0.5 font-body text-[9px] font-semibold tracking-wide text-primary-foreground uppercase">
                    Sélectionnée
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-body text-[10px] font-bold text-primary">
                      1
                    </span>
                    <span className="font-headings text-xs font-semibold text-foreground">
                      Essentiel
                    </span>
                  </div>
                  <p className="font-headings text-lg font-bold text-foreground">150 000 FCFA</p>
                  <p className="font-body text-[10px] text-muted-foreground">
                    Logo + charte graphique de base
                  </p>
                  <p className="flex items-center gap-1 font-body text-[10px] text-muted-foreground">
                    <Icon i="clock" size={11} className="flex-shrink-0" />
                    Livré sous 10 jours
                  </p>
                </div>
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-canvas p-4 shadow-card">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-body text-[10px] font-bold text-primary">
                      2
                    </span>
                    <span className="font-headings text-xs font-semibold text-foreground">
                      Complet
                    </span>
                  </div>
                  <p className="font-headings text-lg font-bold text-foreground">320 000 FCFA</p>
                  <p className="font-body text-[10px] text-muted-foreground">
                    Logo, charte graphique et déclinaisons réseaux sociaux
                  </p>
                  <p className="flex items-center gap-1 font-body text-[10px] text-muted-foreground">
                    <Icon i="clock" size={11} className="flex-shrink-0" />
                    Livré sous 15 jours
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-border p-3">
                <p className="mb-1.5 flex items-center gap-1.5 font-body text-[11px] font-semibold text-foreground">
                  <Icon i="file-check" size={12} className="flex-shrink-0 text-primary" />
                  Conditions
                </p>
                <p className="font-body text-[10px] text-muted-foreground">
                  Une révision mineure incluse par offre. Prix figé dès validation — aucune
                  renégociation après acceptation.
                </p>
              </div>

              <div className="mt-3 rounded-md border border-border p-3">
                <p className="mb-1.5 flex items-center gap-1.5 font-body text-[11px] font-semibold text-foreground">
                  <Icon i="banknote" size={12} className="flex-shrink-0 text-primary" />
                  Modalités de paiement
                </p>
                <p className="font-body text-[10px] text-muted-foreground">
                  Acompte de 30 % à l’acceptation (MTN Mobile Money), solde à la livraison.
                </p>
              </div>
            </div>

            <Link
              href="/login?mode=signup"
              className="mt-4 block rounded-md bg-primary px-4 py-2.5 text-center font-body text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent"
            >
              Valider ce devis
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
