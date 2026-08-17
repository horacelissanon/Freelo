'use client';

// Permanent entry point back to the install instructions — the floating
// InstallPromptWidget bubble hides itself for good once dismissed (shared
// localStorage flag), so this icon button next to ThemeToggle is the only
// way to reopen it afterwards.
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { InstallInstructions } from '@/components/InstallPromptWidget';
import { useInstallPrompt } from '@/lib/useInstallPrompt';

export function InstallAppButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { platform, canInstallNow, installNow } = useInstallPrompt();

  async function handleInstallNow() {
    if (await installNow()) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Installer l’application"
        title="Installer l’application"
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground ${className}`}
      >
        <Icon i="download" size={16} />
      </button>

      {open && (
        <Modal title="Installer Freelo" onClose={() => setOpen(false)}>
          <InstallInstructions
            platform={platform}
            canInstallNow={canInstallNow}
            onInstallNow={() => void handleInstallNow()}
          />
        </Modal>
      )}
    </>
  );
}
