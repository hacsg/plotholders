import { Router, Request, Response } from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { pool, withTransaction } from '../db/index.js';
import { normalizePhone } from '../services/phone.js';
import { updateCustomerTierWithPool } from '../services/tier-engine.js';
import { Customer } from '../types/index.js';

export const qashierRouter = Router();

// Multer config: memory storage, 5MB limit, only CSV files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

interface QashierRow {
  Date?: string;
  Time?: string;
  'Receipt No'?: string;
  Items?: string;
  Total?: string;
  'Payment Method'?: string;
  'Customer Phone'?: string;
  'Customer Name'?: string;
  Outlet?: string;
  [key: string]: string | undefined;
}

interface ImportSummary {
  rows_processed: number;
  rows_matched: number;
  rows_new: number;
  duplicates_skipped: number;
  errors: string[];
}



// POST /api/qashier/import
qashierRouter.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ValidationError', message: 'No CSV file uploaded. Use form field "file".' });
    }

    const filename = req.file.originalname || 'qashier-import.csv';
    const fileBuffer = req.file.buffer;

    const summary: ImportSummary = {
      rows_processed: 0,
      rows_matched: 0,
      rows_new: 0,
      duplicates_skipped: 0,
      errors: [],
    };
    const affectedCustomerIds = new Set<string>();

    // Parse CSV using stream
    await new Promise<void>((resolve, reject) => {
      const stream = Readable.from(fileBuffer);
      stream
        .pipe(csv())
        .on('data', (_row: QashierRow) => {
          // first pass intentionally empty — rows collected below
        })
        .on('end', () => resolve())
        .on('error', reject);
    });

    // Re-parse properly with async handling
    const rows: QashierRow[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = Readable.from(fileBuffer);
      stream
        .pipe(csv())
        .on('data', (row: QashierRow) => {
          rows.push(row);
        })
        .on('end', () => resolve())
        .on('error', reject);
    });

    summary.rows_processed = rows.length;

    // Process each row sequentially (acceptable for Phase 2; for prod use batching)
    for (const row of rows) {
      try {
        const receiptNo = (row['Receipt No'] || '').trim();
        const phoneRaw = (row['Customer Phone'] || '').trim();
        const customerName = (row['Customer Name'] || '').trim() || null;
        const outlet = (row['Outlet'] || '').trim() || null;
        const totalStr = (row['Total'] || '0').replace(/[^0-9.]/g, '');

        if (!receiptNo) {
          summary.errors.push('Row skipped: missing Receipt No');
          continue;
        }

        const phone = normalizePhone(phoneRaw);
        if (!phone) {
          summary.errors.push(`Row ${receiptNo}: missing or invalid phone`);
          continue;
        }

        // Check for duplicate import (acres with channel=qashier + source_id=receipt)
        const dupCheck = await pool.query(
          `SELECT id FROM acres WHERE channel = 'qashier' AND source_id = $1 LIMIT 1`,
          [receiptNo]
        );
        if (dupCheck.rows.length > 0) {
          summary.duplicates_skipped++;
          continue;
        }

        // Find or create customer
        let customer = await findCustomerByPhone(phone);

        if (!customer) {
          // Create new customer with migration_source 'qashier'
          const insertRes = await pool.query<Customer>(
            `INSERT INTO customers (phone, name, migration_source)
             VALUES ($1, $2, 'qashier')
             RETURNING *`,
            [phone, customerName]
          );
          customer = insertRes.rows[0] ?? null;
          summary.rows_new++;
        } else {
          summary.rows_matched++;
          // Optionally update name if missing
          if (!customer.name && customerName) {
            await pool.query(`UPDATE customers SET name = $1, updated_at = now() WHERE id = $2`, [customerName, customer.id]);
          }
        }

        if (customer) {
          // Award 1 acre (inside its own mini transaction per row for safety)
          await withTransaction(async (client) => {
            await client.query(
              `INSERT INTO acres (customer_id, channel, source_id, amount, reason, outlet, order_total)
               VALUES ($1, 'qashier', $2, 1, 'purchase', $3, $4)`,
              [customer!.id, receiptNo, outlet, totalStr ? parseFloat(totalStr) : null]
            );
          });

          affectedCustomerIds.add(customer.id);
        }
      } catch (rowErr: any) {
        summary.errors.push(`Row error: ${rowErr.message || rowErr}`);
      }
    }

    // Update tiers for all affected customers
    for (const customerId of affectedCustomerIds) {
      try {
        await updateCustomerTierWithPool(pool, customerId);
      } catch (tierErr) {
        summary.errors.push(`Tier update failed for ${customerId}: ${(tierErr as Error).message}`);
      }
    }

    // Log the import
    await pool.query(
      `INSERT INTO qashier_imports (filename, rows_processed, rows_matched, rows_new)
       VALUES ($1, $2, $3, $4)`,
      [filename, summary.rows_processed, summary.rows_matched, summary.rows_new]
    );

    res.json({
      success: true,
      filename,
      ...summary,
      affected_customers: affectedCustomerIds.size,
    });
  } catch (err: any) {
    console.error('[qashier] POST /import error:', err);
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'UploadError', message: err.message });
    }
    res.status(500).json({ error: 'InternalError', message: 'Failed to import Qashier CSV' });
  }
});

// Helper: find customer by normalized phone
async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const result = await pool.query<Customer>(
    `SELECT * FROM customers WHERE phone = $1 AND is_merged = false LIMIT 1`,
    [phone]
  );
  return result.rows[0] ?? null;
}

// Optional: GET import history (bonus utility)
qashierRouter.get('/imports', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM qashier_imports ORDER BY imported_at DESC LIMIT 50`
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch import history' });
  }
});
