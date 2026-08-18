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
};

describe('resolveDocumentIdentity', () => {
  it('PERSONAL: uses the personal name/phone/bio, no address or registry fields', () => {
    const resolved = resolveDocumentIdentity(BASE);
    expect(resolved).toEqual({
      name: 'Horace Lissanon',
      bio: 'Freelance developer',
      phone: '+22961000000',
      address: null,
      taxId: null,
      commerceRegistry: null,
    });
  });

  it('PERSONAL: falls back to email when name is unset', () => {
    const resolved = resolveDocumentIdentity({ ...BASE, name: null });
    expect(resolved.name).toBe('horace@example.com');
  });

  it('COMPANY: uses the company phone, never the personal phone', () => {
    const resolved = resolveDocumentIdentity({ ...BASE, documentIdentity: 'COMPANY' });
    expect(resolved.phone).toBe('+22961111111');
    expect(resolved.name).toBe('MERRUDIT');
    expect(resolved.address).toBe('Cotonou');
    expect(resolved.taxId).toBe('IFU000000000');
    expect(resolved.commerceRegistry).toBe('RCCM AB/00000');
  });

  it('COMPANY: phone is null when no company phone was ever filled in', () => {
    const resolved = resolveDocumentIdentity({
      ...BASE,
      documentIdentity: 'COMPANY',
      companyPhone: null,
    });
    expect(resolved.phone).toBeNull();
  });

  it('COMPANY: falls back to the personal name when no studio name was filled in', () => {
    const resolved = resolveDocumentIdentity({
      ...BASE,
      documentIdentity: 'COMPANY',
      studioName: null,
    });
    expect(resolved.name).toBe('Horace Lissanon');
  });
});
