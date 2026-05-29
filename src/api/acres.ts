import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/index.js';
import { updateCustomerTier } from '../services/tier-engine.js';
import { AddAcresRequest, Acre } from '../types/index.js';

export const acresRouter = Router();

const addAcresSchema = z.object({
  customer_id: z.string().uuid(),
  channel: z.enum(['shopify', 'qashier', 'manual', 'referral']),
  source_id: z.string().max(100).optional(),
  amount: z.number().int().min(1).max(1000).default(1),
  reason: z.string().max(50).optional(),
  order_total: z.number().min(0).optional(),
  outlet: z.string().max(50).optional(),
});

const customerIdParamSchema = z.object({
  id: z.string().uuid(),
});

// POST /api/acres - Add acres (internal use)
acresRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = addAcresSchema.parse(req.body);
    const body: AddAcresRequest = {
      ...parsed,
      source_id: parsed.source_id ?? undefined,
    };

    const result = await withTransaction(async (client) => {
      // Verify customer exists and is not merged
      const custCheck = await client.query(
        `SELECT id, is_merged FROM customers WHERE id = $1`,
        [body.customer_id]
      );

      if (custCheck.rows.length === 0) {
        throw new Error('Customer not found');
      }
      if (custCheck.rows[0].is_merged) {
        throw new Error('Cannot add acres to a merged customer');
      }

      // Insert acre record (unique constraint on channel+source_id will catch duplicates)
      const insertResult = await client.query<Acre>(
        `INSERT INTO acres (customer_id, channel, source_id, amount, reason, order_total, outlet)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          body.customer_id,
          body.channel,
          body.source_id ?? null,
          body.amount,
          body.reason ?? null,
          body.order_total ?? null,
          body.outlet ?? null,
        ]
      );

      // Recalculate tier
      const newTier = await updateCustomerTier(client, body.customer_id);

      return { acre: insertResult.rows[0], newTier };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid request body', details: err.issues });
    }
    const message = (err as Error).message;
    if (message.includes('not found')) {
      return res.status(404).json({ error: 'NotFound', message });
    }
    if (message.includes('Cannot add acres')) {
      return res.status(409).json({ error: 'Conflict', message });
    }
    // Unique violation for duplicate source_id
    if ((err as any).code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'An acre record with this channel+source_id already exists' });
    }

    console.error('[acres] POST error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to add acres' });
    return;
  }
  // All paths above returned
});

// GET /api/customers/:id/acres - Get acre history for customer
acresRouter.get('/customers/:id/acres', async (req: Request, res: Response) => {
  try {
    const { id } = customerIdParamSchema.parse(req.params);

    const result = await pool.query<Acre>(
      `SELECT * FROM acres WHERE customer_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid customer id' });
    }
    console.error('[acres] GET customer acres error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch acre history' });
    return;
  }
});
