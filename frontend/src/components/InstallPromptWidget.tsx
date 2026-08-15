'use client';

// Floating "install as app" prompt — shown on the public landing page and
// throughout the authenticated app (mounted in app/page.tsx and
// (app)/layout.tsx). `beforeinstallprompt` only fires on Chromium/Android;
// it never fires on Safari (iOS has no such API — Next's own PWA guide
// explicitly warns against relying on it alone), so the modal always falls
// back to per-platform manual steps when no native prompt is available.
// Dismissal is a single shared localStorage flag: closing it anywhere hides
// it everywhere, matching the "fermable à volonté" ask rather than nagging
// per-surface.
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/installPlatform';

const DISMISSED_KEY = 'merrudit-install-prompt-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPromptWidget({
  variant = 'public',
  bottomNavVisible = true,
}: {
  variant?: 'public' | 'app';
  /** Only relevant for variant='app' — false when the freelance uses the
   *  'drawer' mobile nav style instead of BottomNav (Paramètres → Espace →
   *  Navigation mobile), so there's nothing docked to the bottom to clear. */
  bottomNavVisible?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [platform, setPlatform] = useState<InstallPlatform>('desktop');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Installability degrades gracefully without a registered SW on
        // browsers that don't strictly require one — not fatal either way.
      });
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    let isDismissed = false;
    try {
      isDismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      // Storage unavailable — treat as not dismissed.
    }

    setPlatform(detectInstallPlatform(navigator.userAgent));
    setDismissed(isStandalone || isDismissed);
    setReady(true);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    setDismissed(true);
    setModalOpen(false);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Best-effort — the in-memory state above still hides it this session.
    }
  }

  async function installNow() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      dismiss();
    }
  }

  if (!ready || dismissed) return null;

  // 'app' clears the mobile BottomNav (same bottom-24 margin its own
  // pb-24 content clearance uses in (app)/layout.tsx) when it's actually
  // rendered; 'public' has no bottom nav to avoid, and neither does 'app'
  // when the freelance is on the 'drawer' mobile nav style.
  const positionClass =
    variant === 'app' && bottomNavVisible
      ? 'bottom-24 right-4 sm:right-6 sm:bottom-6'
      : 'right-4 bottom-6 sm:right-6';

  return (
    <>
      <div
        className={`fixed ${positionClass} z-40 flex items-center gap-1 rounded-full border border-border bg-canvas p-1.5 pl-3 shadow-xl`}
      >
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 font-body text-sm font-medium text-foreground"
        >
          <Icon i="download" size={15} className="flex-shrink-0 text-primary" />
          Installer l’application
        </button>
        <button
          type="button"
          aria-label="Fermer le rappel d’installation"
          onClick={dismiss}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <Icon i="x" size={14} />
        </button>
      </div>

      {modalOpen && (
        <Modal title="Installer Freelo" onClose={() => setModalOpen(false)}>
          <InstallInstructions
            platform={platform}
            canInstallNow={!!deferredPrompt}
            onInstallNow={() => void installNow()}
          />
        </Modal>
      )}
    </>
  );
}

function InstallInstructions({
  platform,
  canInstallNow,
  onInstallNow,
}: {
  platform: InstallPlatform;
  canInstallNow: boolean;
  onInstallNow: () => void;
}) {
  if (canInstallNow) {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-body text-sm text-muted-foreground">
          Ton navigateur peut installer Freelo directement — un raccourci sur ton écran d’accueil ou
          ton bureau, qui s’ouvre comme une vraie application.
        </p>
        <button
          type="button"
          onClick={onInstallNow}
          className="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-medium text-primary-foreground"
        >
          Installer maintenant
        </button>
      </div>
    );
  }

  if (platform === 'ios') {
    return (
      <ol className="flex flex-col gap-4">
        <Step icon="share-2" text="Touche l’icône Partager dans la barre de Safari." />
        <Step icon="download" text="Choisis « Sur l’écran d’accueil »." />
        <Step icon="check-circle" text="Confirme — Freelo apparaît comme une application." />
      </ol>
    );
  }

  if (platform === 'android') {
    return (
      <ol className="flex flex-col gap-4">
        <Step icon="more-vertical" text="Ouvre le menu de ton navigateur (⋮ en haut à droite)." />
        <Step
          icon="download"
          text="Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil »."
        />
      </ol>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        <Step icon="monitor" text="Repère l’icône d’installation dans la barre d’adresse." />
        <Step icon="download" text="Clique dessus, puis « Installer »." />
      </ol>
      <p className="font-body text-xs text-muted-foreground">
        Fonctionne avec Chrome ou Edge. Sur Safari ou Firefox desktop, l’installation n’est pas
        encore disponible.
      </p>
    </div>
  );
}

function Step({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-tag-green">
        <Icon i={icon} size={15} className="text-tag-green-fg" />
      </span>
      <span className="pt-1.5 font-body text-sm text-foreground">{text}</span>
    </li>
  );
}
