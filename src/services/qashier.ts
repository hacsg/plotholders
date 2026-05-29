/**
 * Qashier CSV Importer (Phase 2 stub)
 *
 * Future implementation will:
 * - Parse CSV exports from Qashier POS
 * - Match customers by phone or qashier_customer_id
 * - Award acres for qualifying purchases
 * - Log results to qashier_imports table
 */

export interface QashierImportResult {
  filename: string;
  rowsProcessed: number;
  rowsMatched: number;
  rowsNew: number;
  errors: string[];
}

/**
 * Stub: Import acres from a Qashier CSV file.
 * Currently does nothing but return a placeholder result.
 */
export async function importQashierCsv(
  _filePath: string,
  _options?: { dryRun?: boolean }
): Promise<QashierImportResult> {
  console.log('[Qashier] CSV import is not yet implemented (Phase 2).');
  return {
    filename: _filePath,
    rowsProcessed: 0,
    rowsMatched: 0,
    rowsNew: 0,
    errors: ['Qashier CSV importer not implemented yet'],
  };
}

/**
 * Stub: Parse a single row from Qashier export.
 */
export function parseQashierRow(_row: Record<string, string>) {
  // TODO: implement field mapping in Phase 2
  return null;
}
