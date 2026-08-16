export interface ExportColumn<T> {
  header: string;
  /** Relative flex width used to size PDF table columns — ignored by Excel. */
  width?: number;
  value: (row: T) => string;
}
