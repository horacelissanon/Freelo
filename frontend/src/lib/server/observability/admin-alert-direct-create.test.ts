// Tripwire mirroring the NOTIF-05 invariant for Notification: every
// AdminAlert row MUST be created via createAdminAlert (admin-alerts/index.ts)
// so the dedupeKey @unique catch is centralized. A direct
// `prisma.adminAlert.create(` call anywhere else bypasses that dedup gate.
import { describe, expect, it } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC_GLOB = 'src/**/*.ts';
// path.resolve returns native (backslash on Windows) separators, but
// fast-glob's `absolute: true` results are always POSIX-style — normalize
// both to forward slashes before any comparison so this works cross-platform.
const ROOT = resolve(__dirname, '../../../..').replace(/\\/g, '/');
const ALLOWED_FILE = 'src/lib/server/admin-alerts/index.ts';
const DIRECT_CREATE_RE = /\.adminAlert\.create\s*\(/;

describe('admin alert creation: every write goes through createAdminAlert', () => {
  const files = fg
    .sync(SRC_GLOB, { cwd: ROOT, absolute: true })
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));

  it('discovered at least one source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.replace(ROOT + '/', '');
    if (rel === ALLOWED_FILE) continue;
    it(`${rel} does not call prisma.adminAlert.create directly`, () => {
      const src = readFileSync(file, 'utf8');
      expect(
        DIRECT_CREATE_RE.test(src),
        `${rel} calls .adminAlert.create( directly — use createAdminAlert() from lib/server/admin-alerts instead`,
      ).toBe(false);
    });
  }
});
