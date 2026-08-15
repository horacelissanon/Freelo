// Server-side PDF rendering for devis/factures — the actual downloadable
// file behind the "Télécharger" buttons (freelance-side invoice detail page
// and the public /suivi/[token] client view). Deliberately NOT a headless
// browser (Puppeteer/Playwright): those need a bundled Chromium binary that
// blows past Vercel's serverless function size limits and adds a slow cold
// start. @react-pdf/renderer builds the PDF natively in Node from a React
// element tree — no browser, small dependency, fast in a Vercel function.
import 'server-only';
// Explicit import: esbuild (Vitest's transform) compiles this file's JSX to
// classic `React.createElement` calls with no automatic-runtime injection,
// unlike Next's SWC pipeline which handles that implicitly for app code.
import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { formatPrice, formatLongDate } from '@/lib/utils';
import { computeItemsTotal, computeBalance } from '@/lib/invoiceTotals';

export interface PdfLineItem {
  designation: string;
  quantity: number;
  unitPrice: number;
}

export interface PdfPack {
  id: string;
  title: string;
  description?: string | null;
  items: PdfLineItem[];
}

export interface PdfContentBlock {
  kind: string;
  primaryText: string;
  secondaryText?: string | null;
}

export interface InvoicePdfData {
  docType: 'INVOICE' | 'QUOTE' | 'CREDIT_NOTE';
  number: string;
  issueDate: string | Date;
  dueDate?: string | Date | null;
  currency: string;
  amount: number;
  description?: string | null;
  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
  };
  provider: {
    name: string;
    bio?: string | null;
    phone?: string | null;
    address?: string | null;
    taxId?: string | null;
    commerceRegistry?: string | null;
  };
  lineItems: PdfLineItem[];
  packs: PdfPack[];
  selectedPackId?: string | null;
  contentBlocks: PdfContentBlock[];
  paymentTermsNote?: string | null;
  depositAmount?: number | null;
  deliveryDate?: string | Date | null;
  paymentMethodNote?: string | null;
  footerNote?: string | null;
}

const DOC_LABELS: Record<InvoicePdfData['docType'], string> = {
  INVOICE: 'FACTURE',
  QUOTE: 'DEVIS',
  CREDIT_NOTE: 'AVOIR',
};

const CONTENT_BLOCK_LABELS: Record<string, string> = {
  PROCESS: 'Comment ça se passe',
  CONDITIONS: 'Conditions',
  PAYMENT_METHOD: 'Modalités de paiement',
  FAQ: 'Questions fréquentes',
};

const PRIMARY = '#0b6e4f';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  providerName: { fontSize: 13, fontWeight: 700, marginBottom: 3 },
  muted: { color: '#6b6b6b', fontSize: 9 },
  docTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY, textAlign: 'right' },
  docNumber: { fontSize: 11, textAlign: 'right', marginTop: 2, color: PRIMARY },
  partiesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22, gap: 16 },
  partyBlock: { flexGrow: 1, flexBasis: 0 },
  label: {
    fontSize: 8,
    letterSpacing: 0.5,
    color: '#9a9a9a',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  partyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  table: { marginTop: 6, marginBottom: 12 },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f2f4f3',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
  },
  colDesignation: { flexGrow: 1, flexBasis: 0 },
  colQty: { width: 50, textAlign: 'center' },
  colUnitPrice: { width: 90, textAlign: 'right' },
  colTotal: { width: 90, textAlign: 'right' },
  tableHeaderText: { fontSize: 8, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' },
  packBlock: { marginBottom: 16 },
  packTitle: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  packDescription: { fontSize: 9, color: '#6b6b6b', marginBottom: 4 },
  packSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  totalsBlock: { marginTop: 8, alignItems: 'flex-end' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 3,
  },
  totalsLabel: { fontSize: 9, color: '#6b6b6b' },
  totalsValue: { fontSize: 9, fontWeight: 700 },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 220,
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  grandTotalLabel: { fontSize: 10, fontWeight: 700 },
  grandTotalValue: { fontSize: 12, fontWeight: 700, color: PRIMARY },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: PRIMARY },
  blockPrimary: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  blockSecondary: { fontSize: 9, color: '#4a4a4a', marginBottom: 8 },
  footer: {
    marginTop: 28,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    fontSize: 8.5,
    color: '#6b6b6b',
  },
});

function LineItemsTable({ items, currency }: { items: PdfLineItem[]; currency: string }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.colDesignation, styles.tableHeaderText]}>Désignation</Text>
        <Text style={[styles.colQty, styles.tableHeaderText]}>Qté</Text>
        <Text style={[styles.colUnitPrice, styles.tableHeaderText]}>Prix unitaire</Text>
        <Text style={[styles.colTotal, styles.tableHeaderText]}>Total</Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={styles.tableRow}>
          <Text style={styles.colDesignation}>{item.designation}</Text>
          <Text style={styles.colQty}>{item.quantity}</Text>
          <Text style={styles.colUnitPrice}>{formatPrice(item.unitPrice, currency)}</Text>
          <Text style={styles.colTotal}>
            {formatPrice(item.quantity * item.unitPrice, currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const isQuote = data.docType === 'QUOTE';
  const balance = computeBalance(data.amount, data.depositAmount);
  const processBlocks = data.contentBlocks.filter((b) => b.kind === 'PROCESS');
  const conditionBlocks = data.contentBlocks.filter((b) => b.kind === 'CONDITIONS');
  const paymentBlocks = data.contentBlocks.filter((b) => b.kind === 'PAYMENT_METHOD');
  const faqBlocks = data.contentBlocks.filter((b) => b.kind === 'FAQ');

  return (
    <Document
      title={`${DOC_LABELS[data.docType]} ${data.number}`}
      author={data.provider.name}
      creator="Freelo"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.providerName}>{data.provider.name}</Text>
            {data.provider.address && <Text style={styles.muted}>{data.provider.address}</Text>}
            {data.provider.phone && <Text style={styles.muted}>{data.provider.phone}</Text>}
            {(data.provider.taxId || data.provider.commerceRegistry) && (
              <Text style={styles.muted}>
                {[
                  data.provider.taxId && `NIF ${data.provider.taxId}`,
                  data.provider.commerceRegistry && `RCCM ${data.provider.commerceRegistry}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.docTitle}>{DOC_LABELS[data.docType]}</Text>
            <Text style={styles.docNumber}>{data.number}</Text>
            <Text style={[styles.muted, { textAlign: 'right', marginTop: 4 }]}>
              Émis le {formatLongDate(data.issueDate)}
            </Text>
            {data.dueDate && (
              <Text style={[styles.muted, { textAlign: 'right' }]}>
                Échéance {formatLongDate(data.dueDate)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.label}>Prestataire</Text>
            <Text style={styles.partyName}>{data.provider.name}</Text>
            {data.provider.bio && <Text style={styles.muted}>{data.provider.bio}</Text>}
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.partyName}>{data.client.name}</Text>
            {data.client.company && <Text style={styles.muted}>{data.client.company}</Text>}
            {data.client.email && <Text style={styles.muted}>{data.client.email}</Text>}
            {data.client.phone && <Text style={styles.muted}>{data.client.phone}</Text>}
          </View>
        </View>

        {data.description && (
          <Text style={{ marginBottom: 12, fontSize: 9.5 }}>{data.description}</Text>
        )}

        {isQuote ? (
          <>
            <Text style={{ fontSize: 8.5, color: '#6b6b6b', marginBottom: 8 }}>
              Offres au choix — chacune a son propre total, ce n&apos;est pas une somme.
            </Text>
            {data.packs.map((pack, i) => {
              const subtotal = computeItemsTotal(pack.items);
              const isSelected = data.selectedPackId === pack.id;
              return (
                <View key={i} style={styles.packBlock} wrap={false}>
                  <Text style={styles.packTitle}>
                    {i + 1}. {pack.title}
                    {isSelected ? '  ✓ Offre retenue' : ''}
                  </Text>
                  {pack.description && (
                    <Text style={styles.packDescription}>{pack.description}</Text>
                  )}
                  <LineItemsTable items={pack.items} currency={data.currency} />
                  <View style={styles.packSubtotalRow}>
                    <Text style={{ fontSize: 9, fontWeight: 700 }}>
                      Sous-total : {formatPrice(subtotal, data.currency)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <LineItemsTable items={data.lineItems} currency={data.currency} />
            <View style={styles.totalsBlock}>
              {data.depositAmount != null && data.depositAmount > 0 && (
                <>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Sous-total</Text>
                    <Text style={styles.totalsValue}>
                      {formatPrice(data.amount, data.currency)}
                    </Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>Acompte versé</Text>
                    <Text style={styles.totalsValue}>
                      − {formatPrice(data.depositAmount, data.currency)}
                    </Text>
                  </View>
                </>
              )}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>
                  {data.depositAmount != null && data.depositAmount > 0 ? 'Solde dû' : 'Total'}
                </Text>
                <Text style={styles.grandTotalValue}>{formatPrice(balance, data.currency)}</Text>
              </View>
            </View>
          </>
        )}

        {isQuote && data.paymentTermsNote && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Modalités de paiement</Text>
            <Text style={{ fontSize: 9.5 }}>{data.paymentTermsNote}</Text>
          </View>
        )}

        {!isQuote && (data.deliveryDate || data.paymentMethodNote) && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Règlement</Text>
            {data.deliveryDate && (
              <Text style={{ fontSize: 9.5, marginBottom: 2 }}>
                Livraison prévue le {formatLongDate(data.deliveryDate)}
              </Text>
            )}
            {data.paymentMethodNote && (
              <Text style={{ fontSize: 9.5 }}>{data.paymentMethodNote}</Text>
            )}
          </View>
        )}

        {processBlocks.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{CONTENT_BLOCK_LABELS.PROCESS}</Text>
            {processBlocks.map((b, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={styles.blockPrimary}>
                  {i + 1}. {b.primaryText}
                </Text>
                {b.secondaryText && <Text style={styles.blockSecondary}>{b.secondaryText}</Text>}
              </View>
            ))}
          </View>
        )}

        {conditionBlocks.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{CONTENT_BLOCK_LABELS.CONDITIONS}</Text>
            {conditionBlocks.map((b, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={styles.blockPrimary}>{b.primaryText}</Text>
                {b.secondaryText && <Text style={styles.blockSecondary}>{b.secondaryText}</Text>}
              </View>
            ))}
          </View>
        )}

        {paymentBlocks.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{CONTENT_BLOCK_LABELS.PAYMENT_METHOD}</Text>
            {paymentBlocks.map((b, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={styles.blockPrimary}>{b.primaryText}</Text>
                {b.secondaryText && <Text style={styles.blockSecondary}>{b.secondaryText}</Text>}
              </View>
            ))}
          </View>
        )}

        {faqBlocks.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{CONTENT_BLOCK_LABELS.FAQ}</Text>
            {faqBlocks.map((b, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={styles.blockPrimary}>{b.primaryText}</Text>
                {b.secondaryText && <Text style={styles.blockSecondary}>{b.secondaryText}</Text>}
              </View>
            ))}
          </View>
        )}

        {data.footerNote && <Text style={styles.footer}>{data.footerNote}</Text>}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
