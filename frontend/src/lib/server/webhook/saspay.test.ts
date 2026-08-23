import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  saspayWebhookProvider,
  getSaspayWebhookProvider,
  __resetSaspayWebhookProvider,
} from './saspay';

const SECRET = 'test-webhook-secret';

beforeEach(() => {
  vi.stubEnv('SASPAY_API_KEY', 'sk_test_xxx');
  vi.stubEnv('SASPAY_WEBHOOK_SECRET', SECRET);
  __resetSaspayWebhookProvider();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetSaspayWebhookProvider();
});

describe('saspayWebhookProvider', () => {
  it('verifies a valid HMAC + timestamp', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from(JSON.stringify({ event: 'transaction.success', data: { id: 't1' } }));
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(`${ts}.`), body]))
      .digest('hex');
    const r = saspayWebhookProvider.verifySignature(body, {
      'x-webhook-timestamp': ts,
      'x-webhook-signature': sig,
    });
    expect(r.valid).toBe(true);
  });

  it('rejects tampered body', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from(JSON.stringify({ event: 'transaction.success', data: { id: 't1' } }));
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(`${ts}.`), body]))
      .digest('hex');
    const tampered = Buffer.from(
      JSON.stringify({ event: 'transaction.success', data: { id: 't2' } }),
    );
    const r = saspayWebhookProvider.verifySignature(tampered, {
      'x-webhook-timestamp': ts,
      'x-webhook-signature': sig,
    });
    expect(r.valid).toBe(false);
  });

  it('rejects expired replay (drift > 300s default tolerance)', () => {
    const ts = String(Math.floor(Date.now() / 1000) - 400); // 400s old
    const body = Buffer.from('{}');
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(Buffer.concat([Buffer.from(`${ts}.`), body]))
      .digest('hex');
    const r = saspayWebhookProvider.verifySignature(body, {
      'x-webhook-timestamp': ts,
      'x-webhook-signature': sig,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/replay/i);
  });

  it('rejects when signature/timestamp headers are missing', () => {
    const r = saspayWebhookProvider.verifySignature(Buffer.from('{}'), {});
    expect(r.valid).toBe(false);
  });

  it('throws when SASPAY_API_KEY unset (lazy init)', () => {
    vi.stubEnv('SASPAY_API_KEY', '');
    __resetSaspayWebhookProvider();
    expect(() => getSaspayWebhookProvider()).toThrow(/SASPAY_API_KEY/);
  });

  it('throws when SASPAY_WEBHOOK_SECRET unset (lazy init)', () => {
    vi.stubEnv('SASPAY_WEBHOOK_SECRET', '');
    __resetSaspayWebhookProvider();
    expect(() => getSaspayWebhookProvider()).toThrow(/SASPAY_WEBHOOK_SECRET/);
  });

  it('extractIds maps transaction.success to kind=paid', () => {
    const payload = { event: 'transaction.success', data: { id: 't1', reference: 'TXN-1' } };
    const ids = saspayWebhookProvider.extractIds(payload);
    expect(ids.kind).toBe('paid');
    expect(ids.externalId).toBe('t1');
    expect(ids.eventType).toBe('transaction.success');
  });

  it('extractIds maps transaction.failed to kind=failed', () => {
    const payload = { event: 'transaction.failed', data: { id: 't2' } };
    const ids = saspayWebhookProvider.extractIds(payload);
    expect(ids.kind).toBe('failed');
  });

  it('extractIds maps transaction.cancelled to kind=failed', () => {
    const payload = { event: 'transaction.cancelled', data: { id: 't3' } };
    const ids = saspayWebhookProvider.extractIds(payload);
    expect(ids.kind).toBe('failed');
  });

  it('extractIds falls back to kind=other for unrecognized events', () => {
    const payload = { event: 'webhook.test', data: {} };
    const ids = saspayWebhookProvider.extractIds(payload);
    expect(ids.kind).toBe('other');
  });
});
