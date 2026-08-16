'use client';

// Client-side tabular PDF export for list pages (Projets/Clients/Devis/
// Factures) — a different concern from lib/server/pdf/invoicePdf.tsx (which
// renders a single invoice document server-side behind 'server-only'). This
// one runs entirely in the browser via @react-pdf/renderer's isomorphic
// pdf() API, dynamically imported so it never inflates the initial page
// bundle for freelances who never export.
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { ExportColumn } from './types';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#6b7280', marginBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
  },
  cellHeader: { fontWeight: 700, fontSize: 9 },
  cell: { fontSize: 9 },
});

function ListExportDocument({
  title,
  subtitle,
  columns,
  rows,
}: {
  title: string;
  subtitle?: string;
  columns: { header: string; width: number }[];
  rows: string[][];
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.headerRow}>
          {columns.map((col, i) => (
            <Text key={i} style={[styles.cellHeader, { flex: col.width }]}>
              {col.header}
            </Text>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.row} wrap={false}>
            {row.map((cell, ci) => (
              <Text key={ci} style={[styles.cell, { flex: columns[ci]?.width ?? 1 }]}>
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function exportRowsToPdf<T>(
  filename: string,
  title: string,
  subtitle: string | undefined,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer');
  const doc = (
    <ListExportDocument
      title={title}
      {...(subtitle ? { subtitle } : {})}
      columns={columns.map((c) => ({ header: c.header, width: c.width ?? 1 }))}
      rows={rows.map((row) => columns.map((c) => c.value(row)))}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
