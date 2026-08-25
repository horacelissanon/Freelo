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
import QRCode from 'qrcode';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { formatPrice, formatLongDate } from '@/lib/utils';
import { computeItemsTotal, computeBalance, computePackDeposit } from '@/lib/invoiceTotals';

export interface PdfLineItem {
  designation: string;
  quantity: number;
  unitPrice: number;
}

export interface PdfPack {
  id: string;
  title: string;
  description?: string | null;
  turnaroundTime?: string | null;
  items: PdfLineItem[];
  depositType?: string | null;
  depositValue?: number | null;
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
    email: string;
    bio?: string | null;
    phone?: string | null;
    // Accepted for API-shape parity with ResolvedDocumentIdentity, but not
    // rendered — slogan took over the "under the name" header spot, and the
    // freelancer's own footerNote/mention légale is the place to mention an
    // address, since it's the only free-text spot both renderers guarantee.
    address?: string | null;
    taxId?: string | null;
    commerceRegistry?: string | null;
    brandColor?: string | null;
    slogan?: string | null;
    // Pro-only — callers (the two /pdf routes) already strip this to null
    // for FREE-plan users, so this renderer just draws whatever it's given.
    logoUrl?: string | null;
  };
  lineItems: PdfLineItem[];
  packs: PdfPack[];
  selectedPackId?: string | null;
  project?: { name: string } | null;
  contentBlocks: PdfContentBlock[];
  paymentTermsNote?: string | null;
  depositAmount?: number | null;
  deliveryDate?: string | Date | null;
  paymentMethodNote?: string | null;
  footerNote?: string | null;
  // Public /suivi/[token] URL for this document — rendered as a QR code so
  // a client scanning the printed/downloaded document lands on the live
  // tracking page. Absent (no QR rendered) for a DRAFT never shared yet.
  trackingUrl?: string | null;
}

const DOC_LABELS: Record<InvoicePdfData['docType'], string> = {
  INVOICE: 'FACTURE',
  QUOTE: 'DEVIS',
  CREDIT_NOTE: 'AVOIR',
};

const CONTENT_BLOCK_LABELS: Record<string, string> = {
  PROCESS: 'Étapes du projet',
  CONDITIONS: 'Conditions',
  PAYMENT_METHOD: 'Modalités de paiement',
  FAQ: 'Questions fréquentes',
};

const PRIMARY = '#0b6e4f';

const styles = StyleSheet.create({
  // paddingBottom reserves room below the normal content flow so the fixed
  // footerBand (absolutely positioned, see below) never overlaps the last
  // lines of a longer invoice/devis.
  page: { padding: 40, paddingBottom: 90, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  providerHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  providerLogo: { width: 36, height: 36, marginRight: 10, objectFit: 'contain' },
  providerName: { fontSize: 13, fontWeight: 700, marginBottom: 3 },
  muted: { color: '#6b6b6b', fontSize: 9 },
  // Neutral, not brand-colored — mirrors the on-screen preview's "FACTURE"
  // heading (text-foreground). Only docNumber carries the brand color there
  // (text-primary, now driven by the same provider.brandColor as here), so
  // the two renderers agree on which single element gets the accent.
  docTitle: { fontSize: 20, fontWeight: 700, textAlign: 'right' },
  docNumber: { fontSize: 11, textAlign: 'right', marginTop: 2 },
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
  packDepositRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 2,
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
  // Neutral — mirrors the on-screen preview's plain "TOTAL" box (text-foreground).
  grandTotalValue: { fontSize: 12, fontWeight: 700 },
  section: { marginTop: 20 },
  // Neutral — mirrors the on-screen preview's muted uppercase section labels.
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  blockPrimary: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  blockSecondary: { fontSize: 9, color: '#4a4a4a', marginBottom: 8 },
  // Pinned to the true bottom of the physical A4 sheet (not flowed right
  // after the content, wherever that happens to end) — `fixed` makes it
  // repeat at the same spot on every paginated page if the invoice overflows
  // to more than one. left/right/bottom match styles.page's own padding so
  // the band's edges line up with the rest of the content.
  footerBand: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 40,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerBandText: {
    fontSize: 8.5,
    color: '#ffffff',
  },
  // Modern "scan me" card — sits in the Prestataire/Client row's third
  // column (the empty space next to Client) instead of the plain
  // QR-floating-in-the-header look this replaced. No fill — just a thin
  // frame, so it reads as a tile rather than a flat grey block.
  qrCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 8,
    alignSelf: 'flex-start',
  },
  qrImage: { width: 52, height: 52 },
  qrCaption: {
    fontSize: 6.5,
    color: '#9a9a9a',
    marginTop: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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

function InvoiceDocument({
  data,
  qrCodeDataUrl,
}: {
  data: InvoicePdfData;
  qrCodeDataUrl: string | null;
}) {
  const isQuote = data.docType === 'QUOTE';
  const balance = computeBalance(data.amount, data.depositAmount);
  // Defensive fallback: a real invoice created through the app always has
  // >=1 lineItem (enforced at creation), but rows can exist without one
  // (legacy data) — mirrors the on-screen invoice page's same fallback so
  // the PDF never renders an empty désignation table.
  const flatLineItems =
    data.lineItems.length > 0
      ? data.lineItems
      : [
          {
            designation: data.description || data.project?.name || DOC_LABELS[data.docType],
            quantity: 1,
            unitPrice: data.amount,
          },
        ];
  const processBlocks = data.contentBlocks.filter((b) => b.kind === 'PROCESS');
  const conditionBlocks = data.contentBlocks.filter((b) => b.kind === 'CONDITIONS');
  const paymentBlocks = data.contentBlocks.filter((b) => b.kind === 'PAYMENT_METHOD');
  const faqBlocks = data.contentBlocks.filter((b) => b.kind === 'FAQ');
  const accent = data.provider.brandColor ?? PRIMARY;

  return (
    <Document
      title={`${DOC_LABELS[data.docType]} ${data.number}`}
      author={data.provider.name}
      creator="ZeFacto"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.providerHeaderLeft}>
            {data.provider.logoUrl && (
              <Image src={data.provider.logoUrl} style={styles.providerLogo} />
            )}
            <View>
              <Text style={styles.providerName}>{data.provider.name}</Text>
              {data.provider.slogan && <Text style={styles.muted}>{data.provider.slogan}</Text>}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.docTitle}>{DOC_LABELS[data.docType]}</Text>
            <Text style={[styles.docNumber, { color: accent }]}>{data.number}</Text>
            <Text style={[styles.muted, { textAlign: 'right', marginTop: 4 }]}>
              Émis le {formatLongDate(data.issueDate)}
            </Text>
            {isQuote && data.dueDate && (
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
            {data.provider.phone && <Text style={styles.muted}>{data.provider.phone}</Text>}
            <Text style={styles.muted}>{data.provider.email}</Text>
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
          <View style={styles.partyBlock}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.partyName}>{data.client.name}</Text>
            {data.client.company && <Text style={styles.muted}>{data.client.company}</Text>}
            {data.client.email && <Text style={styles.muted}>{data.client.email}</Text>}
            {data.client.phone && <Text style={styles.muted}>{data.client.phone}</Text>}
          </View>
          {qrCodeDataUrl && (
            <View style={styles.partyBlock}>
              <View style={styles.qrCard}>
                <Image src={qrCodeDataUrl} style={styles.qrImage} />
                <Text style={styles.qrCaption}>Scanner pour suivre</Text>
              </View>
            </View>
          )}
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
              const deposit = computePackDeposit(pack);
              return (
                <View key={i} style={styles.packBlock} wrap={false}>
                  <Text style={styles.packTitle}>
                    {i + 1}. {pack.title}
                    {isSelected ? '  ✓ Offre retenue' : ''}
                  </Text>
                  {pack.description && (
                    <Text style={styles.packDescription}>{pack.description}</Text>
                  )}
                  {pack.turnaroundTime && (
                    <Text style={styles.packDescription}>
                      Délai de réalisation : {pack.turnaroundTime}
                    </Text>
                  )}
                  <LineItemsTable items={pack.items} currency={data.currency} />
                  <View style={styles.packSubtotalRow}>
                    <Text style={{ fontSize: 9, fontWeight: 700 }}>
                      Sous-total : {formatPrice(subtotal, data.currency)}
                    </Text>
                  </View>
                  {deposit != null && (
                    <View style={styles.packDepositRow}>
                      <Text style={{ fontSize: 8.5, color: '#6b6b6b' }}>
                        Acompte demandé
                        {pack.depositType === 'PERCENT' ? ` (${pack.depositValue}%)` : ''} :{' '}
                        {formatPrice(deposit, data.currency)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <>
            <LineItemsTable items={flatLineItems} currency={data.currency} />
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

        {/* Content blocks (présentation, étapes, conditions, modalités, FAQ) are
            devis-only, mirroring the on-screen preview which gates this whole
            section behind docType === 'QUOTE'. */}
        {isQuote && data.provider.bio && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Votre présentation</Text>
            <Text style={{ fontSize: 9.5 }}>{data.provider.bio}</Text>
          </View>
        )}

        {isQuote && processBlocks.length > 0 && (
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

        {isQuote && conditionBlocks.length > 0 && (
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

        {isQuote && (data.paymentTermsNote || paymentBlocks.length > 0) && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{CONTENT_BLOCK_LABELS.PAYMENT_METHOD}</Text>
            {data.paymentTermsNote && (
              <Text style={{ fontSize: 9.5, marginBottom: 4 }}>{data.paymentTermsNote}</Text>
            )}
            {paymentBlocks.map((b, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={styles.blockPrimary}>{b.primaryText}</Text>
                {b.secondaryText && <Text style={styles.blockSecondary}>{b.secondaryText}</Text>}
              </View>
            ))}
            <Text style={{ fontSize: 8, color: '#6b6b6b', marginTop: 2 }}>
              À titre indicatif — aucun paiement en ligne n&apos;est traité à l&apos;étape du devis.
            </Text>
          </View>
        )}

        {isQuote && faqBlocks.length > 0 && (
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

        {data.footerNote && (
          <View fixed style={[styles.footerBand, { backgroundColor: accent }]}>
            <Text style={styles.footerBandText}>{data.footerNote}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const qrCodeDataUrl = data.trackingUrl
    ? await QRCode.toDataURL(data.trackingUrl, { margin: 1, width: 160 })
    : null;
  return renderToBuffer(<InvoiceDocument data={data} qrCodeDataUrl={qrCodeDataUrl} />);
}
