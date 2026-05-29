import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/index.js';
import { normalizePhone } from '../services/phone.js';
import { getUpcomingBirthdays } from '../services/birthday.js';
import { Customer, Tier } from '../types/index.js';

export const staffRouter = Router();

const lookupQuerySchema = z.object({
  phone: z.string().min(6),
});

const redeemSchema = z.object({
  customer_id: z.string().uuid(),
  reward_type: z.string().min(1).max(50),
  staff_id: z.string().max(100).optional(),
  channel: z.string().max(20).optional(),
});

const upcomingQuery = z.object({
  days: z.coerce.number().min(1).max(90).optional().default(7),
});

// GET /api/staff/lookup?phone=
staffRouter.get('/lookup', async (req: Request, res: Response) => {
  try {
    const { phone } = lookupQuerySchema.parse(req.query);
    const normalized = normalizePhone(phone);

    const customerRes = await pool.query<Customer>(
      `SELECT * FROM customers WHERE phone = $1 AND is_merged = false LIMIT 1`,
      [normalized]
    );

    if (customerRes.rows.length === 0) {
      return res.status(404).json({ message: 'Not a Plot Holder yet' });
    }

    const customer = customerRes.rows[0]!;

    // Lifetime acres (fast)
    const acresRes = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM acres WHERE customer_id = $1`,
      [customer.id]
    );
    const lifetimeAcres = parseInt(acresRes.rows[0]?.total || '0', 10);

    // Available rewards based on tier (not redeemed today)
    const today = new Date().toISOString().split('T')[0];
    const rewardsRes = await pool.query(
      `SELECT reward_type, COUNT(*) as count FROM rewards 
       WHERE customer_id = $1 AND redeemed_at::date = $2::date
       GROUP BY reward_type`,
      [customer.id, today]
    );
    const redeemedToday = new Map(rewardsRes.rows.map((r: any) => [r.reward_type, parseInt(r.count, 10)]));

    const availableRewards = getAvailableRewardsForTier(customer.tier, redeemedToday);

    res.json({
      customer,
      tier: customer.tier,
      lifetime_acres: lifetimeAcres,
      available_rewards: availableRewards,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid phone' });
    }
    console.error('[staff] lookup error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Lookup failed' });
  }
});

// POST /api/staff/redeem
staffRouter.post('/redeem', async (req: Request, res: Response) => {
  try {
    const body = redeemSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      const custRes = await client.query(
        `SELECT id, tier FROM customers WHERE id = $1 AND is_merged = false`,
        [body.customer_id]
      );
      if (custRes.rows.length === 0) {
        throw new Error('Customer not found or merged');
      }

      const tier = custRes.rows[0].tier as Tier;

      const insert = await client.query(
        `INSERT INTO rewards (customer_id, tier, reward_type, channel, staff_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          body.customer_id,
          tier,
          body.reward_type,
          body.channel || 'retail',
          body.staff_id || null,
        ]
      );

      return insert.rows[0];
    });

    res.status(201).json({ success: true, reward: result });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', details: err.issues });
    }
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'NotFound', message: err.message });
    }
    console.error('[staff] redeem error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Redeem failed' });
  }
});

// GET /api/staff/upcoming-birthdays?days=7
staffRouter.get('/upcoming-birthdays', async (req: Request, res: Response) => {
  try {
    const { days } = upcomingQuery.parse(req.query);
    const birthdays = await getUpcomingBirthdays(days);
    res.json({ data: birthdays, days });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError' });
    }
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch upcoming birthdays' });
  }
});

// Simple tier-based available rewards logic (mirrors frontend expectations)
function getAvailableRewardsForTier(tier: Tier, redeemedToday: Map<string, number>): Array<{ reward_type: string; available: boolean; label: string }> {
  const rewards: Array<{ reward_type: string; label: string; minTier: Tier }> = [
    { reward_type: 'six_pack_upgrade', label: 'Free 6-pack upgrade', minTier: 'grower' },
    { reward_type: 'free_coffee', label: 'Free coffee', minTier: 'seedling' },
    { reward_type: 'ten_percent_off', label: '10% off next purchase', minTier: 'grower' },
    { reward_type: 'birthday_discount', label: 'Birthday special discount', minTier: 'seedling' },
  ];

  const tierOrder: Record<Tier, number> = { seedling: 0, grower: 1, homesteader: 2, landowner: 3 };

  return rewards.map((r) => ({
    reward_type: r.reward_type,
    label: r.label,
    available: tierOrder[tier] >= tierOrder[r.minTier] && (redeemedToday.get(r.reward_type) || 0) === 0,
  }));
}
