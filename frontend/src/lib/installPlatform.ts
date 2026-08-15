// Pure UA-sniffing for the PWA install widget (components/InstallPromptWidget.tsx).
// Kept separate from the component so the detection logic — the part most
// likely to need a tweak as new devices/browsers show up — has its own unit
// test independent of DOM/React rendering concerns.
export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function detectInstallPlatform(userAgent: string): InstallPlatform {
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
}
