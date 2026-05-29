import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/index.js';
import { normalizePhone } from '../services/phone.js';
import { notifyReferralSignup } from '../services/notifications.js';

import { Customer } from '../types/index.js';

export const referralsRouter = Router();

const claimSchema = z.object({
  referral_code: z.string().min(4).max(20),
  phone: z.string().min(8).max(20),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

const referrerIdSchema = z.object({
  id: z.string().uuid(),
});

// POST /api/referrals/claim
referralsRouter.post('/claim', async (req: Request, res: Response) => {
  try {
    const parsed = claimSchema.parse(req.body);

    const referralCode = parsed.referral_code.toUpperCase().trim();
    const phone = normalizePhone(parsed.phone);

    // 1. Look up referrer
    const referrerRes = await pool.query<Customer>(
      `SELECT * FROM customers WHERE referral_code = $1 AND is_merged = false LIMIT 1`,
      [referralCode]
    );

    if (referrerRes.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Referral code not found' });
    }

    const referrer = referrerRes.rows[0]!;

    // 2. Find or create referred customer
    let referred = await pool.query<Customer>(
      `SELECT * FROM customers WHERE phone = $1 AND is_merged = false LIMIT 1`,
      [phone]
    );

    let referredCustomer: Customer;

    const result = await withTransaction(async (client) => {
      if (referred.rows.length === 0) {
        // Create new
        const insert = await client.query<Customer>(
          `INSERT INTO customers (phone, name, email, referred_by, migration_source)
           VALUES ($1, $2, $3, $4, 'referral')
           RETURNING *`,
          [phone, parsed.name ?? null, parsed.email ?? null, referrer.id]
        );
        referredCustomer = insert.rows[0]!;
      } else {
        referredCustomer = referred.rows[0]!;

        // If not already referred by someone, set it
        if (!referredCustomer.referred_by) {
          await client.query(
            `UPDATE customers SET referred_by = $1, migration_source = COALESCE(migration_source, 'referral'), updated_at = now() WHERE id = $2`,
            [referrer.id, referredCustomer.id]
          );
          referredCustomer.referred_by = referrer.id;
        }
      }

      // 3. Prevent self-referral
      if (referredCustomer.id === referrer.id) {
        throw new Error('Cannot refer yourself');
      }

      // 4. Check if referral already recorded
      const existingRef = await client.query(
        `SELECT id FROM referrals WHERE referrer_id = $1 AND referred_id = $2`,
        [referrer.id, referredCustomer.id]
      );
      if (existingRef.rows.length > 0) {
        // Already claimed — still award? Per spec we can re-award or skip. For now allow idempotent bonus? 
        // Better: award only once. Return current state.
        const refTiers = await getCurrentTiers(client, referrer.id, referredCustomer.id);
        return {
          success: true,
          already_claimed: true,
          referrer_tier: refTiers.referrerTier,
          referred_tier: refTiers.referredTier,
          bonus_awarded: false,
        };
      }

      // 5. Award 1 acre to referrer (reason referral)
      await client.query(
        `INSERT INTO acres (customer_id, channel, source_id, amount, reason)
         VALUES ($1, 'referral', $2, 1, 'referral')`,
        [referrer.id, `ref-${referredCustomer.id}`]
      );

      // 6. Award 1 acre to referred
      await client.query(
        `INSERT INTO acres (customer_id, channel, source_id, amount, reason)
         VALUES ($1, 'referral', $2, 1, 'referral')`,
        [referredCustomer.id, `ref-from-${referrer.id}`]
      );

      // 7. Record in referrals table
      await client.query(
        `INSERT INTO referrals (referrer_id, referred_id, bonus_awarded) VALUES ($1, $2, true)`,
        [referrer.id, referredCustomer.id]
      );

      // 8. Update tiers for both (inside transaction)
      const referrerTier = await updateCustomerTier(client, referrer.id);
      const referredTier = await updateCustomerTier(client, referredCustomer.id);

      return {
        success: true,
        referrer_tier: referrerTier,
        referred_tier: referredTier,
        bonus_awarded: true,
        referred_customer_id: referredCustomer.id,
      };
    });

    // Notify referrer (best effort, after tx)
    if (result.bonus_awarded) {
      const refCustomer = await pool.query<Customer>(`SELECT * FROM customers WHERE id = $1`, [referrer.id]);
      if (refCustomer.rows[0]) {
        notifyReferralSignup(refCustomer.rows[0]).catch((e) => console.error('[Referrals] Notify failed:', e));
      }
    }

    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid request', details: err.issues });
    }
    if (err.message === 'Cannot refer yourself') {
      return res.status(400).json({ error: 'ValidationError', message: err.message });
    }
    console.error('[referrals] POST /claim error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to claim referral' });
  }
});

// GET /api/referrals/:id — list of customers this person referred + stats
referralsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = referrerIdSchema.parse(req.params);

    // Verify referrer exists
    const refCheck = await pool.query(`SELECT id, referral_code FROM customers WHERE id = $1`, [id]);
    if (refCheck.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Referrer not found' });
    }

    // Get referred customers
    const referredRes = await pool.query<Customer>(
      `SELECT c.* FROM customers c
       INNER JOIN referrals r ON r.referred_id = c.id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );

    // Bonus acres earned (count of referral acres for this referrer)
    const bonusRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM acres WHERE customer_id = $1 AND reason = 'referral'`,
      [id]
    );

    const totalBonusAcres = parseInt(bonusRes.rows[0]?.count ?? '0', 10);

    res.json({
      referrer_id: id,
      referral_code: refCheck.rows[0].referral_code,
      total_referred: referredRes.rows.length,
      total_bonus_acres: totalBonusAcres,
      referred_customers: referredRes.rows,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid referrer id' });
    }
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch referrals' });
  }
});

// Helper inside transaction for tier update (re-uses tier engine logic lightly)
async function updateCustomerTier(client: any, customerId: string): Promise<string> {
  const sum = await client.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM acres WHERE customer_id = $1`,
    [customerId]
  );
  const lifetime = parseInt(sum.rows[0]?.total || '0', 10);

  let tier = 'seedling';
  if (lifetime >= 200) tier = 'landowner';
  else if (lifetime >= 50) tier = 'homesteader';
  else if (lifetime >= 10) tier = 'grower';

  await client.query(
    `UPDATE customers SET tier = $1, lifetime_acres = $2, updated_at = now() WHERE id = $3`,
    [tier, lifetime, customerId]
  );
  return tier;
}

async function getCurrentTiers(client: any, referrerId: string, referredId: string) {
  const r1 = await client.query(`SELECT tier FROM customers WHERE id = $1`, [referrerId]);
  const r2 = await client.query(`SELECT tier FROM customers WHERE id = $1`, [referredId]);
  return {
    referrerTier: r1.rows[0]?.tier ?? 'seedling',
    referredTier: r2.rows[0]?.tier ?? 'seedling',
  };
}
