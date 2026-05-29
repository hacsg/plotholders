import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/index.js';
import { RedeemRewardRequest, Reward, Tier } from '../types/index.js';

export const rewardsRouter = Router();

const redeemSchema = z.object({
  customer_id: z.string().uuid(),
  reward_type: z.string().min(1).max(50),
  channel: z.string().max(20).optional(),
  staff_id: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

const customerIdParamSchema = z.object({
  id: z.string().uuid(),
});

// POST /api/rewards/redeem - Mark reward as redeemed
rewardsRouter.post('/redeem', async (req: Request, res: Response) => {
  try {
    const parsedReward = redeemSchema.parse(req.body);
    const body: RedeemRewardRequest = {
      customer_id: parsedReward.customer_id,
      reward_type: parsedReward.reward_type,
      channel: parsedReward.channel ?? undefined,
      staff_id: parsedReward.staff_id ?? undefined,
      notes: parsedReward.notes ?? undefined,
    };

    const result = await withTransaction(async (client) => {
      // Verify customer exists
      const cust = await client.query(
        `SELECT id, tier, is_merged FROM customers WHERE id = $1`,
        [body.customer_id]
      );

      if (cust.rows.length === 0) {
        throw new Error('Customer not found');
      }
      if (cust.rows[0].is_merged) {
        throw new Error('Cannot redeem for a merged customer');
      }

      const currentTier = cust.rows[0].tier as Tier;

      const insertResult = await client.query<Reward>(
        `INSERT INTO rewards (customer_id, tier, reward_type, channel, staff_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          body.customer_id,
          currentTier,
          body.reward_type,
          body.channel ?? null,
          body.staff_id ?? null,
          body.notes ?? null,
        ]
      );

      return insertResult.rows[0];
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
    if (message.includes('merged')) {
      return res.status(409).json({ error: 'Conflict', message });
    }
    console.error('[rewards] POST /redeem error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to redeem reward' });
    return;
  }
});

// GET /api/customers/:id/rewards - Get reward history
rewardsRouter.get('/customers/:id/rewards', async (req: Request, res: Response) => {
  try {
    const { id } = customerIdParamSchema.parse(req.params);

    const result = await pool.query<Reward>(
      `SELECT * FROM rewards WHERE customer_id = $1 ORDER BY redeemed_at DESC`,
      [id]
    );

    res.json({ data: result.rows, total: result.rows.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid customer id' });
    }
    console.error('[rewards] GET customer rewards error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch reward history' });
    return;
  }
});
