import type { ExportColumn } from './types';

// Dynamically imported so exceljs only loads when a freelance actually
// clicks "Exporter en Excel", not on every list-page load. exceljs over the
// more common `xlsx` (SheetJS) package deliberately: SheetJS's npm-published
// build is frozen at 0.18.5 with two unpatched high-severity advisories
// (prototype pollution, ReDoS) that fail this repo's CI `pnpm audit
// --audit-level=high` gate — exceljs has no such unpatched high-severity
// findings.
export async function exportRowsToExcel<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Export');
  worksheet.columns = columns.map((col) => ({ header: col.header, key: col.header, width: 18 }));
  for (const row of rows) {
    const record: Record<string, string> = {};
    for (const col of columns) record[col.header] = col.value(row);
    worksheet.addRow(record);
  }
  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
