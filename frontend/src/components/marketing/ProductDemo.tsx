'use client';

// Interactive, read-only mini product tour — replaces what used to be a
// purely decorative (non-clickable) dashboard sketch on the landing page.
// A visitor can click through the real nav sections (Tableau de bord,
// Clients, Devis, Factures) and see plausible sample data render in place,
// exactly like the Stripe/Linear-style embedded product demos this was
// modeled on. Nothing here talks to the API — it's local component state
// over hardcoded sample rows, so it's free to render on the marketing page
// with zero auth/network cost.
//
// This is the landing page's third client-JS island (see page.tsx's own
// top comment — ScrollReveal and PricingToggle are the other two). Same
// progressive-enhancement contract: the server-rendered HTML already shows
// the Tableau de bord tab in full, so a visitor with JS disabled or on a
// slow connection still sees a complete, correct preview — they just can't
// click through the other three tabs until it hydrates.
//
// Sample names/companies are deliberately fictional (not the real dev
// account's client list) — this is public marketing copy.
//
// The "+ Nouveau ..." button per tab, the toast, and the persistent signup
// nudge below it are modeled on dailykash.app's own embedded demo (looked
// at for reference while building this): click an action, watch the number/
// list actually update, then get nudged toward signup right at that "oh,
// this really works" moment — more convincing than a purely inert preview.
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

type DemoTab = 'dashboard' | 'clients' | 'devis' | 'factures';

const TABS: { id: DemoTab; label: string; icon: string; path: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: 'layout-dashboard', path: 'dashboard' },
  { id: 'clients', label: 'Clients', icon: 'users', path: 'clients' },
  { id: 'devis', label: 'Devis', icon: 'file-text', path: 'devis' },
  { id: 'factures', label: 'Factures', icon: 'receipt', path: 'factures' },
];

const TAG_CLASSES: Record<'green' | 'orange' | 'red' | 'purple', string> = {
  green: 'bg-tag-green text-tag-green-fg',
  orange: 'bg-tag-orange text-tag-orange-fg',
  red: 'bg-tag-red text-tag-red-fg',
  purple: 'bg-tag-purple text-tag-purple-fg',
};

const SAMPLE_CLIENTS: {
  name: string;
  company: string;
  status: string;
  color: keyof typeof TAG_CLASSES;
}[] = [
  { name: 'Aïcha Bamba', company: 'Studio Kayré', status: 'Client', color: 'green' },
  { name: 'Moussa Diarra', company: 'Café Lumière', status: 'Nouveau', color: 'purple' },
  { name: 'Fatou N’Diaye', company: 'Atelier Sové', status: 'En attente', color: 'orange' },
  { name: 'Ibrahim Sow', company: 'Nova Design', status: 'Client', color: 'green' },
  { name: 'Aminata Koffi', company: 'Maison Fangol', status: 'Client', color: 'green' },
];

const SAMPLE_DEVIS: {
  number: string;
  client: string;
  amount: string;
  status: string;
  color: keyof typeof TAG_CLASSES;
  icon: string;
}[] = [
  {
    number: 'QT-2026-004',
    client: 'Studio Kayré',
    amount: '150 000 FCFA',
    status: 'En attente',
    color: 'orange',
    icon: 'clock',
  },
  {
    number: 'QT-2026-003',
    client: 'Café Lumière',
    amount: '320 000 FCFA',
    status: 'Acceptée',
    color: 'green',
    icon: 'check-circle',
  },
  {
    number: 'QT-2026-002',
    client: 'Atelier Sové',
    amount: '95 000 FCFA',
    status: 'Acceptée',
    color: 'green',
    icon: 'check-circle',
  },
  {
    number: 'QT-2026-001',
    client: 'Nova Design',
    amount: '210 000 FCFA',
    status: 'Expiré',
    color: 'red',
    icon: 'alert-circle',
  },
];

const SAMPLE_FACTURES: {
  number: string;
  client: string;
  amount: string;
  status: string;
  color: keyof typeof TAG_CLASSES;
  icon: string;
}[] = [
  {
    number: 'FA-2026-008',
    client: 'Studio Kayré',
    amount: '75 000 FCFA',
    status: 'Payée',
    color: 'green',
    icon: 'check-circle',
  },
  {
    number: 'FA-2026-007',
    client: 'Café Lumière',
    amount: '320 000 FCFA',
    status: 'En attente',
    color: 'orange',
    icon: 'clock',
  },
  {
    number: 'FA-2026-006',
    client: 'Atelier Sové',
    amount: '95 000 FCFA',
    status: 'En retard',
    color: 'red',
    icon: 'alert-circle',
  },
  {
    number: 'FA-2026-005',
    client: 'Nova Design',
    amount: '180 000 FCFA',
    status: 'Payée',
    color: 'green',
    icon: 'check-circle',
  },
];

// Labels match the real app's own buttons verbatim — (app)/dashboard/page.tsx
// ("Nouveau client" / "Nouveau devis" / "Nouveau projet") and
// (app)/invoices/page.tsx ("Créer facture" on the Factures tab). There is no
// "revenu" entity in ZeFacto (unlike the finance-tracker this demo pattern
// was inspired by) — the dashboard's action mirrors its real "Nouveau
// projet" quick-action instead of inventing one.
const ADD_LABEL: Record<DemoTab, string> = {
  dashboard: 'Nouveau projet',
  clients: 'Nouveau client',
  devis: 'Nouveau devis',
  factures: 'Créer facture',
};

const ADD_TOAST: Record<DemoTab, string> = {
  dashboard: 'Projet créé',
  clients: 'Client ajouté',
  devis: 'Devis créé',
  factures: 'Facture créée',
};

const NEW_CLIENT: (typeof SAMPLE_CLIENTS)[number] = {
  name: 'Boubacar Diallo',
  company: 'Kayré Events',
  status: 'Nouveau',
  color: 'purple',
};
const NEW_DEVIS: (typeof SAMPLE_DEVIS)[number] = {
  number: 'QT-2026-005',
  client: 'Maison Fangol',
  amount: '180 000 FCFA',
  status: 'En attente',
  color: 'orange',
  icon: 'clock',
};
const NEW_FACTURE: (typeof SAMPLE_FACTURES)[number] = {
  number: 'FA-2026-009',
  client: 'Maison Fangol',
  amount: '60 000 FCFA',
  status: 'En attente',
  color: 'orange',
  icon: 'clock',
};

const INITIAL_ACTIVITY = [
  { label: 'Atelier Sové', detail: 'Facture payée', amount: '+95 000 FCFA' },
  { label: 'Nova Design', detail: 'Devis accepté', amount: '+210 000 FCFA' },
];

const inputCardClass = 'rounded-lg border border-border bg-canvas p-3 shadow-card';

// Smooth SVG path through a set of points — each point gets a cubic-bezier
// control point derived from its neighbors (a small "pull toward the
// tangent" smoothing), which is what turns a jagged polyline into a real
// curve instead of connecting points with straight segments.
function controlPoint(
  current: [number, number],
  previous: [number, number] | undefined,
  next: [number, number] | undefined,
  reverse: boolean,
): [number, number] {
  const p = previous ?? current;
  const n = next ?? current;
  const smoothing = 0.2;
  const angle = Math.atan2(n[1] - p[1], n[0] - p[0]) + (reverse ? Math.PI : 0);
  const length = Math.hypot(n[0] - p[0], n[1] - p[1]) * smoothing;
  return [current[0] + Math.cos(angle) * length, current[1] + Math.sin(angle) * length];
}

function smoothPath(points: [number, number][]): string {
  return points.reduce((acc, point, i, all) => {
    if (i === 0) return `M ${point[0]},${point[1]}`;
    const [csx, csy] = controlPoint(all[i - 1]!, all[i - 2], point, false);
    const [cex, cey] = controlPoint(point, all[i - 1], all[i + 1], true);
    return `${acc} C ${csx},${csy} ${cex},${cey} ${point[0]},${point[1]}`;
  }, '');
}

// Animated gradient-fill sparkline (Stripe/Linear-style "dynamic curve"),
// replacing the flat bars this preview used to have. `values` are 0–100;
// `pathLength={1}` (SVG2) lets the draw-in animation use a normalized
// dasharray/dashoffset instead of measuring getTotalLength() in a ref.
function Sparkline({ values, height = 64 }: { values: number[]; height?: number }) {
  const gradientId = useId();
  const width = 100;
  const pad = 4;
  const points: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - pad - (v / 100) * (height - pad * 2),
  ]);
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full overflow-visible text-primary"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        pathLength={1}
        className="animate-draw-line"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.4}
        fill="currentColor"
        stroke="var(--color-canvas)"
        strokeWidth={1.2}
      />
    </svg>
  );
}

export function ProductDemo() {
  const [activeTab, setActiveTab] = useState<DemoTab>('dashboard');
  const active = TABS.find((t) => t.id === activeTab)!;

  const [activeProjects, setActiveProjects] = useState(4);
  const [clients, setClients] = useState(SAMPLE_CLIENTS);
  const [devis, setDevis] = useState(SAMPLE_DEVIS);
  const [factures, setFactures] = useState(SAMPLE_FACTURES);
  const [added, setAdded] = useState<Record<DemoTab, boolean>>({
    dashboard: false,
    clients: false,
    devis: false,
    factures: false,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every click anywhere in this demo — a tab, the action button, even a
  // repeat click once a tab already got its one row added — surfaces the
  // signup nudge. Only the FIRST click per tab actually mutates its list
  // (no unbounded duplicate rows on repeat clicks); every click still
  // (re)shows the toast + nudge, since the point of a read-only demo is to
  // consistently point at "create an account" rather than only doing it
  // once and going quiet.
  function handleTabClick(tab: DemoTab) {
    setActiveTab(tab);
    setShowHint(false);
    setHasInteracted(true);
  }

  function handleAdd() {
    setShowHint(false);
    setHasInteracted(true);
    if (!added[activeTab]) {
      setAdded((a) => ({ ...a, [activeTab]: true }));
      if (activeTab === 'dashboard') {
        setActiveProjects((p) => p + 1);
      } else if (activeTab === 'clients') {
        setClients((c) => [NEW_CLIENT, ...c]);
      } else if (activeTab === 'devis') {
        setDevis((d) => [NEW_DEVIS, ...d]);
      } else {
        setFactures((f) => [NEW_FACTURE, ...f]);
      }
    }
    setToast(ADD_TOAST[activeTab]);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="animate-slide-up-in mx-auto mt-14 flex max-w-6xl flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-center">
      <div className="animate-float-3d relative w-full max-w-2xl">
        <div className="overflow-hidden rounded-xl border border-border bg-canvas shadow-card">
          <div className="flex items-center gap-1.5 border-b border-border bg-secondary/60 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-tag-red-fg/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-tag-orange-fg/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-tag-green-fg/50" />
            <span className="ml-3 truncate font-body text-xs text-muted-foreground">
              zefacto.app/{active.path}
            </span>
            <span className="ml-auto hidden shrink-0 font-body text-[9px] text-muted-foreground/70 sm:inline">
              Aperçu · lecture seule
            </span>
          </div>
          <div className="flex">
            <div className="flex w-14 flex-shrink-0 flex-col gap-1 bg-sidebar p-2.5 sm:w-40 sm:p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary">
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
                <span className="hidden font-headings text-xs font-bold text-sidebar-foreground sm:block">
                  ZeFacto
                </span>
              </div>
              {/* Real buttons (not the old icon+bar skeleton) — natively
                  focusable/keyboard-activatable, no custom key handling
                  needed. Touch targets run a bit under the usual 44px
                  minimum on the icon-only mobile rail: this is a scaled-down
                  stylized mockup rather than the real app chrome at 1:1
                  size (same tradeoff the rest of this preview already makes
                  with sub-16px "fake" text everywhere), traded off against
                  keeping the whole card at a believable browser-window
                  scale. */}
              <nav
                className="flex flex-col gap-1"
                aria-label="Aperçu de navigation ZeFacto (démo, lecture seule)"
              >
                {TABS.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabClick(tab.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:py-2 ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-muted/60 hover:text-sidebar-foreground'
                      }`}
                    >
                      <Icon i={tab.icon} size={13} className="flex-shrink-0" />
                      <span className="hidden truncate font-body text-[11px] font-medium sm:block">
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="min-w-0 flex-1 p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-headings text-sm font-bold text-foreground">{active.label}</p>
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleAdd}
                    className={`flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 font-body text-[10px] font-semibold transition-colors duration-150 ${
                      added[activeTab]
                        ? 'bg-tag-green text-tag-green-fg hover:opacity-90'
                        : 'bg-foreground text-canvas hover:opacity-90'
                    }`}
                  >
                    <Icon i={added[activeTab] ? 'check-circle' : 'plus'} size={11} />
                    {added[activeTab] ? 'Ajouté' : ADD_LABEL[activeTab]}
                  </button>
                  {/* Points at the action button on first load, like
                      dailykash.app's "Teste l'outil !" callout — nudges a
                      visitor who might otherwise treat this as a static
                      screenshot into actually trying it. Disappears for
                      good after the first click anywhere in the demo. */}
                  {showHint && !added[activeTab] && (
                    <div className="animate-fade-in pointer-events-none absolute -top-8 right-0 z-20 flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 font-body text-[10px] font-medium whitespace-nowrap text-canvas shadow-lg">
                      Teste l’outil ! 👇
                    </div>
                  )}
                </div>
              </div>
              {/* Toast on click, then a persistent signup nudge once the
                  visitor has seen the "it actually works" moment at least
                  once (stays visible across tab switches from then on). */}
              {toast && (
                <div className="animate-fade-in mb-2 flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5">
                  <Icon i="bell" size={11} className="flex-shrink-0 text-canvas" />
                  <span className="font-body text-[10px] font-medium text-canvas">{toast}</span>
                </div>
              )}
              {!toast && hasInteracted && (
                <div className="animate-fade-in mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5">
                  <span className="font-body text-[10px] font-medium text-foreground">
                    C’est aussi simple que ça ! ✨
                  </span>
                  <Link
                    href="/login?mode=signup"
                    className="flex-shrink-0 rounded-full bg-primary px-2.5 py-1 font-body text-[10px] font-semibold whitespace-nowrap text-primary-foreground"
                  >
                    Créer un compte
                  </Link>
                </div>
              )}
              {/* Fixed height + scroll — this is what lets a visitor
                  actually scroll through a tab's rows instead of the card
                  growing unpredictably tall; same behavior on mobile and
                  desktop since this whole preview renders (shrunk, not
                  hidden) at every breakpoint. Keyed on the tab so switching
                  restarts the fade-in instead of it looking like a stale
                  leftover animation. */}
              <div
                key={activeTab}
                className="animate-fade-in max-h-[210px] overflow-y-auto overscroll-contain pr-1"
              >
                {activeTab === 'dashboard' && <DashboardView activeProjects={activeProjects} />}
                {activeTab === 'clients' && <ClientsView clients={clients} />}
                {activeTab === 'devis' && <ListView rows={devis} />}
                {activeTab === 'factures' && <ListView rows={factures} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Same product, on a phone — a realistic modern-iPhone frame
          (Dynamic Island, status bar, home indicator), not a shrunk-down
          rectangle. Deliberately kept SMALLER than the desktop mockup
          (h-72 vs. the desktop card's ~300px+) — a supporting visual, not
          the dominant one, and deliberately NOT wired to the tab state
          above (stays on its own fixed Tableau de bord snapshot) so this
          secondary flourish doesn't need its own scroll/nav affordances. */}
      <div className="animate-float-3d-delayed relative hidden h-72 w-36 flex-shrink-0 rounded-[2rem] border-[6px] border-foreground bg-foreground shadow-2xl lg:block">
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
                  <svg
                    viewBox="0 0 64 64"
                    className="h-2.5 w-2.5 text-primary-foreground"
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
                <span className="font-headings text-[10px] font-bold text-foreground">ZeFacto</span>
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
              <div className="mt-1">
                <Sparkline values={[40, 65, 50, 70, 90, 55, 68]} height={32} />
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
  );
}

function DashboardView({ activeProjects }: { activeProjects: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-primary p-3">
          <p className="font-body text-[10px] text-primary-foreground/80">Revenus ce mois</p>
          <p className="font-headings text-lg font-bold text-primary-foreground">850 000</p>
        </div>
        <div className={inputCardClass}>
          <p className="font-body text-[10px] text-muted-foreground">Projets actifs</p>
          <p className="font-headings text-lg font-bold text-foreground">{activeProjects}</p>
        </div>
        <div className={inputCardClass}>
          <p className="font-body text-[10px] text-muted-foreground">Factures impayées</p>
          <p className="font-headings text-lg font-bold text-foreground">2</p>
        </div>
        <div className={inputCardClass}>
          <p className="font-body text-[10px] text-muted-foreground">Nouveaux clients</p>
          <p className="font-headings text-lg font-bold text-foreground">+3</p>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-border p-3">
        <p className="font-body text-[10px] text-muted-foreground">Revenus de la semaine</p>
        <div className="mt-2">
          <Sparkline values={[40, 65, 50, 70, 90, 55, 68]} />
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-border p-3">
        <p className="mb-1.5 font-body text-[10px] text-muted-foreground">Activité récente</p>
        <div className="flex flex-col">
          {INITIAL_ACTIVITY.map((a, i) => (
            <div
              key={`${a.label}-${i}`}
              className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-body text-[11px] font-medium text-foreground">
                  {a.label}
                </p>
                <p className="truncate font-body text-[9px] text-muted-foreground">{a.detail}</p>
              </div>
              <span className="flex-shrink-0 font-body text-[10px] font-semibold text-tag-green-fg">
                {a.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ClientsView({ clients }: { clients: typeof SAMPLE_CLIENTS }) {
  return (
    <div className="flex flex-col">
      {clients.map((c) => (
        <div
          key={c.name}
          className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-b-0"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary font-body text-[9px] font-semibold text-foreground">
              {c.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-body text-[11px] font-medium text-foreground">{c.name}</p>
              <p className="truncate font-body text-[9px] text-muted-foreground">{c.company}</p>
            </div>
          </div>
          <span
            className={`flex-shrink-0 rounded-full px-1.5 py-0.5 font-body text-[9px] font-medium ${TAG_CLASSES[c.color]}`}
          >
            {c.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function ListView({
  rows,
}: {
  rows: {
    number: string;
    client: string;
    amount: string;
    status: string;
    color: keyof typeof TAG_CLASSES;
    icon: string;
  }[];
}) {
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div
          key={r.number}
          className="flex items-center justify-between gap-2 border-b border-border/60 py-2 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="truncate font-body text-[11px] font-medium text-foreground">{r.number}</p>
            <p className="truncate font-body text-[9px] text-muted-foreground">{r.client}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="font-body text-[10px] font-semibold text-foreground">{r.amount}</span>
            <span
              className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 font-body text-[9px] font-medium ${TAG_CLASSES[r.color]}`}
            >
              <Icon i={r.icon} size={9} />
              {r.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
