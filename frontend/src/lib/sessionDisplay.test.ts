// Pure display helpers for Sécurité → Sessions actives — device label/kind
// parsed from the User-Agent, location formatted from Vercel's geo-IP
// headers (see lib/server/sessions.ts). Kept dependency-free (no UA-parser
// package, no country-list package) since the inputs are narrow and
// Intl.DisplayNames already ships in the runtime.
import { describe, it, expect } from 'vitest';
import { describeDevice, describeLocation } from './sessionDisplay';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SAFARI_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('describeDevice', () => {
  it('returns "Appareil inconnu" / unknown for a missing user-agent', () => {
    expect(describeDevice(null)).toEqual({ label: 'Appareil inconnu', kind: 'unknown' });
  });

  it('labels a desktop Chrome/Windows session and marks it desktop', () => {
    expect(describeDevice(CHROME_WINDOWS)).toEqual({ label: 'Chrome — Windows', kind: 'desktop' });
  });

  it('labels an iPhone Safari session and marks it mobile', () => {
    expect(describeDevice(SAFARI_IPHONE)).toEqual({ label: 'Safari — iPhone', kind: 'mobile' });
  });

  it('marks an iPad session as tablet even though its UA contains "Mobile"', () => {
    expect(describeDevice(SAFARI_IPAD).kind).toBe('tablet');
  });

  it('marks an Android UA carrying the "Mobile" token as mobile', () => {
    expect(describeDevice(ANDROID_PHONE).kind).toBe('mobile');
  });

  it('marks an Android UA without the "Mobile" token as tablet', () => {
    expect(describeDevice(ANDROID_TABLET).kind).toBe('tablet');
  });
});

describe('describeLocation', () => {
  it('combines city and country into "City, Country"', () => {
    expect(describeLocation('Dakar', 'SN')).toBe('Dakar, Sénégal');
  });

  it('falls back to just the country name when city is missing', () => {
    expect(describeLocation(null, 'SN')).toBe('Sénégal');
  });

  it('falls back to just the city when country is missing', () => {
    expect(describeLocation('Dakar', null)).toBe('Dakar');
  });

  it('returns null when neither city nor country is known', () => {
    expect(describeLocation(null, null)).toBeNull();
  });
});
