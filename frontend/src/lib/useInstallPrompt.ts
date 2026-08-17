'use client';

// Shared `beforeinstallprompt` capture + platform detection, used by both
// InstallPromptWidget (the dismissible floating bubble) and InstallAppButton
// (the permanent header entry point next to ThemeToggle — needed because
// dismissing the bubble hides it everywhere via a shared localStorage flag,
// so there must be a non-dismissible way back to the install instructions).
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
