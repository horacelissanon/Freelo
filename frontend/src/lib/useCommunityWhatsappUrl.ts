'use client';

// Shared by every "Rejoindre la communauté" WhatsApp button (landing page +
// dashboard banner) so a Super Admin edit (PATCH /api/admin/settings) takes
// effect everywhere at once, without a redeploy. Falls back to the
// hardcoded placeholder while loading or if a Super Admin hasn't set a real
// link yet — same fallback-constant pattern PricingToggle.tsx uses for
// plan prices/features while /api/plans is loading.
import { useApi } from '@/lib/useApi';
import { COMMUNITY_WHATSAPP_URL } from '@/lib/constants';

export function useCommunityWhatsappUrl(): string {
  const { data } = useApi<{ communityWhatsappUrl: string | null }>('/api/settings');
  return data?.communityWhatsappUrl || COMMUNITY_WHATSAPP_URL;
}
