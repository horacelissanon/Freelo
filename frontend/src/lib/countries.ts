// Phone-prefix picker data, scoped to the 8 UEMOA member states (Freelo's
// actual market — all on FCFA/XOF, matching User.defaultCurrency's default).
// `format` is a placeholder hint only (shown via the <input>'s placeholder
// attribute) — not a validation mask, matching this app's "no blocking
// validation on free-form fields" convention.
export interface Country {
  iso2: string;
  name: string;
  dialCode: string;
  format: string;
}

export const COUNTRIES: Country[] = [
  // All Bénin numbers gained a leading "01" in the national numbering plan
  // as of this year — 10 digits now, not 8.
  { iso2: 'BJ', name: 'Bénin', dialCode: '229', format: '01 97 00 00 00' },
  { iso2: 'BF', name: 'Burkina Faso', dialCode: '226', format: '70 00 00 00' },
  { iso2: 'CI', name: "Côte d'Ivoire", dialCode: '225', format: '07 00 00 00 00' },
  { iso2: 'GW', name: 'Guinée-Bissau', dialCode: '245', format: '955 000 000' },
  { iso2: 'ML', name: 'Mali', dialCode: '223', format: '70 00 00 00' },
  { iso2: 'NE', name: 'Niger', dialCode: '227', format: '90 00 00 00' },
  { iso2: 'SN', name: 'Sénégal', dialCode: '221', format: '77 000 00 00' },
  { iso2: 'TG', name: 'Togo', dialCode: '228', format: '90 00 00 00' },
];

// Best-effort mapping from IANA timezone to one of the countries above, so
// the phone-prefix picker can default to "the visitor's own country"
// without a geo-IP call. Falls back to Bénin (BJ) — Freelo's home market —
// for any timezone not covered (including visitors outside UEMOA, and when
// Intl itself is unavailable).
const TIMEZONE_TO_ISO2: Record<string, string> = {
  'Africa/Porto-Novo': 'BJ',
  'Africa/Ouagadougou': 'BF',
  'Africa/Abidjan': 'CI',
  'Africa/Bissau': 'GW',
  'Africa/Bamako': 'ML',
  'Africa/Niamey': 'NE',
  'Africa/Dakar': 'SN',
  'Africa/Lome': 'TG',
};

export function guessDefaultCountry(): Country {
  let iso2 = 'BJ';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    iso2 = TIMEZONE_TO_ISO2[tz] ?? 'BJ';
  } catch {
    // Intl unavailable — Bénin default stands.
  }
  return COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0]!;
}
