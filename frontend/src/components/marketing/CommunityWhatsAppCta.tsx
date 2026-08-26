'use client';

// Extracted from the landing page (a server component) into its own client
// island so the link can be Super-Admin-editable at runtime (via
// useCommunityWhatsappUrl -> GET /api/settings) without forcing the whole
// landing page to become dynamic — same reasoning as PricingToggle.tsx.
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { useCommunityWhatsappUrl } from '@/lib/useCommunityWhatsappUrl';

export function CommunityWhatsAppCta() {
  const communityWhatsappUrl = useCommunityWhatsappUrl();
  return (
    <a
      href={communityWhatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 font-body text-sm font-semibold text-primary"
    >
      <WhatsAppIcon className="h-4 w-4 text-primary" />
      Rejoindre la communauté
    </a>
  );
}
