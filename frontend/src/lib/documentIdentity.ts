// Resolves what shows in the "Prestataire" header of a devis/facture — the
// freelancer picks once (Paramètres → Compte → Entreprise) whether clients
// see their personal identity (name/phone/bio) or their company identity
// (nom d'entreprise/adresse/NIF/RCCM). Shared between the client-side
// invoice detail page and the server-side /api/track/[token] route so both
// resolve the same way. Pure — no server-only import.

export type DocumentIdentity = 'PERSONAL' | 'COMPANY';

export interface DocumentIdentitySource {
  documentIdentity: DocumentIdentity;
  name: string | null;
  email: string;
  phone: string | null;
  bio: string | null;
  studioName: string | null;
  taxId: string | null;
  commerceRegistry: string | null;
  address: string | null;
  companyPhone: string | null;
  slogan: string | null;
}

export interface ResolvedDocumentIdentity {
  name: string;
  bio: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  commerceRegistry: string | null;
  slogan: string | null;
}

export function resolveDocumentIdentity(user: DocumentIdentitySource): ResolvedDocumentIdentity {
  if (user.documentIdentity === 'PERSONAL') {
    return {
      name: user.name || user.email,
      bio: user.bio,
      phone: user.phone,
      address: null,
      taxId: null,
      commerceRegistry: null,
      slogan: user.slogan,
    };
  }
  // COMPANY: fall back to the personal name when no studio name was filled
  // in yet, so a document never ships with a blank header. Phone comes from
  // the dedicated `companyPhone` field, never the personal `phone` — a
  // freelancer showing their company identity may not want their personal
  // number on client-facing documents.
  return {
    name: user.studioName || user.name || user.email,
    bio: user.bio,
    phone: user.companyPhone,
    address: user.address,
    taxId: user.taxId,
    commerceRegistry: user.commerceRegistry,
    slogan: user.slogan,
  };
}
