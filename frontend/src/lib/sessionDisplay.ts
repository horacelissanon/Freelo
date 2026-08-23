// Pure display helpers for Sécurité → Sessions actives. Device label/kind is
// parsed from the stored User-Agent string; location is formatted from the
// city/country captured at session-creation time via Vercel's geo-IP
// request headers (see lib/server/sessions.ts) — both are best-effort and
// degrade gracefully to null/unknown (e.g. local dev has no Vercel geo
// headers, matching the existing "::1" IP behavior).
export type DeviceKind = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface DeviceInfo {
  label: string;
  kind: DeviceKind;
}

export function describeDevice(ua: string | null): DeviceInfo {
  if (!ua) return { label: 'Appareil inconnu', kind: 'unknown' };

  let browser = 'Navigateur';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';

  let os = 'Appareil';
  let kind: DeviceKind = 'desktop';
  if (/ipad/i.test(ua)) {
    os = 'iPad';
    kind = 'tablet';
  } else if (/iphone/i.test(ua)) {
    os = 'iPhone';
    kind = 'mobile';
  } else if (/android/i.test(ua)) {
    os = 'Android';
    kind = /mobile/i.test(ua) ? 'mobile' : 'tablet';
  } else if (/mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  return { label: `${browser} — ${os}`, kind };
}

function countryDisplayName(isoCode: string): string {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(isoCode.toUpperCase()) ?? isoCode;
  } catch {
    return isoCode;
  }
}

export function describeLocation(city: string | null, country: string | null): string | null {
  const countryName = country ? countryDisplayName(country) : null;
  if (city && countryName) return `${city}, ${countryName}`;
  return city ?? countryName;
}
