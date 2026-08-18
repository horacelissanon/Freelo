'use client';

// Shared `beforeinstallprompt` capture + platform detection, used by
// InstallPromptWidget — the dismissible floating bubble that's the app's
// only install entry point (dismissal is per-session, see its own header
// comment, so there's no need for a separate permanent header button).
import { useEffect, useState } from 'react';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/installPlatform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [platform, setPlatform] = useState<InstallPlatform>('desktop');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectInstallPlatform(navigator.userAgent));

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  async function installNow() {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }

  return { platform, canInstallNow: !!deferredPrompt, installNow };
}
