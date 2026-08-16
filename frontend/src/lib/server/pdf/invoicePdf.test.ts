import { describe, it, expect } from 'vitest';
import { renderInvoicePdf, type InvoicePdfData } from './invoicePdf';

const baseData: InvoicePdfData = {
  docType: 'INVOICE',
  number: '2026-001',
  issueDate: new Date('2026-05-01'),
  dueDate: new Date('2026-05-15'),
  currency: 'XOF',
  amount: 60000,
  description: 'Prestation de design',
  client: {
    name: 'Tekki Foods',
    email: 'contact@tekki.food',
    phone: '+221771234567',
    company: null,
  },
  provider: {
    name: 'Atelier X',
    email: 'atelier@x.sn',
    bio: null,
    phone: null,
    address: 'Dakar, Sénégal',
    taxId: 'NIF123',
    commerceRegistry: 'RCCM456',
  },
  lineItems: [{ designation: 'Design logo', quantity: 1, unitPrice: 60000 }],
  packs: [],
  contentBlocks: [],
  paymentTermsNote: null,
  depositAmount: 20000,
  deliveryDate: new Date('2026-05-20'),
  paymentMethodNote: 'Orange Money +221 77 000 00 00',
  footerNote: 'Merci de votre confiance.',
};

describe('renderInvoicePdf', () => {
  it('renders a valid PDF buffer for an invoice with line items + deposit', async () => {
    const pdf = await renderInvoicePdf(baseData);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('renders a valid PDF buffer for a quote with packs + content blocks', async () => {
    const pdf = await renderInvoicePdf({
      ...baseData,
      docType: 'QUOTE',
      number: 'QT-2026-001',
      lineItems: [],
      packs: [
        {
          id: 'pack-1',
          title: 'Essentiel',
          description: 'Le pack de base',
          items: [{ designation: 'Logo', quantity: 1, unitPrice: 200000 }],
        },
      ],
      selectedPackId: 'pack-1',
      contentBlocks: [
        { kind: 'PROCESS', primaryText: 'Brief', secondaryText: 'On discute du besoin.' },
        { kind: 'FAQ', primaryText: 'Délai ?', secondaryText: '2 semaines.' },
      ],
      paymentTermsNote: 'Acompte de 50% à la commande.',
      depositAmount: null,
      deliveryDate: null,
      paymentMethodNote: null,
    });
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('renders without content blocks/notes present (minimal quote)', async () => {
    const pdf = await renderInvoicePdf({
      ...baseData,
      docType: 'QUOTE',
      number: 'QT-2026-002',
      lineItems: [],
      packs: [
        {
          id: 'pack-1',
          title: 'Simple',
          description: null,
          items: [{ designation: 'Item', quantity: 1, unitPrice: 1000 }],
        },
      ],
      contentBlocks: [],
      paymentTermsNote: null,
      depositAmount: null,
      deliveryDate: null,
      paymentMethodNote: null,
      footerNote: null,
    });
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
