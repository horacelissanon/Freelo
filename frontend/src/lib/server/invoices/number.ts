// Shared by POST /api/invoices and POST /api/invoices/[id]/credit-note so
// both entry points format sequential document numbers identically.
// INVOICE -> "{year}-{seq}", QUOTE -> "QT-{year}-{seq}", CREDIT_NOTE ->
// "AV-{year}-{seq}" ("avoir" — matches the Banani mock data format).
import 'server-only';

export type InvoiceDocType = 'INVOICE' | 'QUOTE' | 'CREDIT_NOTE';

export function formatInvoiceNumber(docType: InvoiceDocType, year: number, seq: number): string {
  const padded = String(seq).padStart(3, '0');
  if (docType === 'QUOTE') return `QT-${year}-${padded}`;
  if (docType === 'CREDIT_NOTE') return `AV-${year}-${padded}`;
  return `${year}-${padded}`;
}
