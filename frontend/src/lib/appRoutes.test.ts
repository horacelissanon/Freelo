import { describe, it, expect } from 'vitest';
import { isAppRoute } from './appRoutes';

describe('isAppRoute', () => {
  it.each([
    '/dashboard',
    '/clients',
    '/clients/abc123',
    '/invoices',
    '/invoices/inv_1/edit-quote',
    '/projects/proj_1',
    '/settings',
  ])('treats %s as an app route', (path) => {
    expect(isAppRoute(path)).toBe(true);
  });

  it.each([
    '/',
    '/login',
    '/signup',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/auth/error',
    '/suivi/tok_abc123',
    '/settingsomething', // must not match on a segment prefix, only a full segment
  ])('treats %s as a public route', (path) => {
    expect(isAppRoute(path)).toBe(false);
  });
});
