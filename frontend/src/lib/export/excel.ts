import type { ExportColumn } from './types';

// Dynamically imported so the (fairly large) xlsx bundle only loads when a
// freelance actually clicks "Exporter en Excel", not on every list-page load.
export async function exportRowsToExcel<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const data = rows.map((row) => {
    const obj: Record<string, string> = {};
    for (const col of columns) obj[col.header] = col.value(row);
    return obj;
  });
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
