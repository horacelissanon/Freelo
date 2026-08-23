import { describe, expect, it } from 'vitest';
import { resolveDocumentIdentity, type DocumentIdentitySource } from './documentIdentity';

const BASE: DocumentIdentitySource = {
  documentIdentity: 'PERSONAL',
  name: 'Horace Lissanon',
  email: 'horace@example.com',
  phone: '+22961000000',
  bio: 'Freelance developer',
  studioName: 'MERRUDIT',
  taxId: 'IFU000000000',
  commerceRegistry: 'RCCM AB/00000',
  address: 'Cotonou',
  companyPhone: '+22961111111',
  slogan: 'On code, vous respirez.',
  logoUrl: 'https://res.cloudinary.com/demo/logo.png',
};

describe('resolveDocumentIdentity', () => {
  it('PERSONAL: uses the personal name/phone/bio, no address, registry, or logo fields', () => {
    const resolved = resolveDocumentIdentity(BASE, true);
    expect(resolved).toEqual({
      name: 'Horace Lissanon',
      bio: 'Freelance developer',
      phone: '+22961000000',
      address: null,
      taxId: null,
      commerceRegistry: null,
      slogan: 'On code, vous respirez.',
      logoUrl: null,
    });
  });

  it('slogan carries through unchanged regardless of identity mode', () => {
    expect(resolveDocumentIdentity(BASE, true).slogan).toBe('On code, vous respirez.');
    expect(resolveDocumentIdentity({ ...BASE, documentIdentity: 'COMPANY' }, true).slogan).toBe(
      'On code, vous respirez.',
    );
  });

  it('PERSONAL: falls back to email when name is unset', () => {
    const resolved = resolveDocumentIdentity({ ...BASE, name: null }, true);
    expect(resolved.name).toBe('horace@example.com');
  });

  it('COMPANY + Pro: uses the company phone, never the personal phone', () => {
    const resolved = resolveDocumentIdentity({ ...BASE, documentIdentity: 'COMPANY' }, true);
    expect(resolved.phone).toBe('+22961111111');
    expect(resolved.name).toBe('MERRUDIT');
    expect(resolved.address).toBe('Cotonou');
    expect(resolved.taxId).toBe('IFU000000000');
    expect(resolved.commerceRegistry).toBe('RCCM AB/00000');
    expect(resolved.logoUrl).toBe('https://res.cloudinary.com/demo/logo.png');
  });

  it('COMPANY + Pro: logoUrl is null when none was ever uploaded', () => {
    const resolved = resolveDocumentIdentity(
      { ...BASE, documentIdentity: 'COMPANY', logoUrl: null },
      true,
    );
    expect(resolved.logoUrl).toBeNull();
  });

  it('COMPANY + Pro: phone is null when no company phone was ever filled in', () => {
    const resolved = resolveDocumentIdentity(
      { ...BASE, documentIdentity: 'COMPANY', companyPhone: null },
      true,
    );
    expect(resolved.phone).toBeNull();
  });

  it('COMPANY + Pro: falls back to the personal name when no studio name was filled in', () => {
    const resolved = resolveDocumentIdentity(
      { ...BASE, documentIdentity: 'COMPANY', studioName: null },
      true,
    );
    expect(resolved.name).toBe('Horace Lissanon');
  });

  // The whole COMPANY identity — not just the logo — is a Pro perk: a FREE
  // account resolves as PERSONAL on the actual document even if it picked
  // "Entreprise" and filled every field in, exactly like it would with no
  // COMPANY data at all. Nothing is deleted — it just doesn't render until
  // the freelance upgrades.
  it('COMPANY + FREE: resolves as PERSONAL regardless of saved company fields', () => {
    const resolved = resolveDocumentIdentity({ ...BASE, documentIdentity: 'COMPANY' }, false);
    expect(resolved).toEqual({
      name: 'Horace Lissanon',
      bio: 'Freelance developer',
      phone: '+22961000000',
      address: null,
      taxId: null,
      commerceRegistry: null,
      slogan: 'On code, vous respirez.',
      logoUrl: null,
    });
  });

  it('PERSONAL + FREE: unaffected by the Pro gate (already the free-tier default)', () => {
    const resolved = resolveDocumentIdentity(BASE, false);
    expect(resolved.name).toBe('Horace Lissanon');
    expect(resolved.phone).toBe('+22961000000');
  });
});
