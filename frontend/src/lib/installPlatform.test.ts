import { describe, it, expect } from 'vitest';
import { detectInstallPlatform } from './installPlatform';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WINDOWS_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('detectInstallPlatform', () => {
  it('detects iOS from an iPhone Safari user agent', () => {
    expect(detectInstallPlatform(IPHONE_SAFARI)).toBe('ios');
  });

  it('detects iOS from an iPad Safari user agent (classic UA, not desktop-class)', () => {
    expect(detectInstallPlatform(IPAD_SAFARI)).toBe('ios');
  });

  it('detects Android from Chrome on Android', () => {
    expect(detectInstallPlatform(ANDROID_CHROME)).toBe('android');
  });

  it('detects Android from Firefox on Android', () => {
    expect(detectInstallPlatform(ANDROID_FIREFOX)).toBe('android');
  });

  it('falls back to desktop for Windows Chrome', () => {
    expect(detectInstallPlatform(WINDOWS_CHROME)).toBe('desktop');
  });

  it('falls back to desktop for macOS Safari', () => {
    expect(detectInstallPlatform(MAC_SAFARI)).toBe('desktop');
  });

  it('falls back to desktop for Windows Firefox', () => {
    expect(detectInstallPlatform(WINDOWS_FIREFOX)).toBe('desktop');
  });

  it('falls back to desktop for an empty/unknown user agent', () => {
    expect(detectInstallPlatform('')).toBe('desktop');
  });
});
