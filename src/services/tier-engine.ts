import { PoolClient } from 'pg';
import { Tier, Customer } from '../types/index.js';
import { notifyTierUpgrade } from './notifications.js';

export type { Tier };

/**
 * Calculate tier based on lifetime acres.
 * Thresholds:
 *  - 0-9 acres   -> seedling
 *  - 10-49 acres -> grower
 *  - 50-199 acres -> homesteader
 *  - 200+ acres  -> landowner
 */
export function calculateTier(lifetimeAcres: number): Tier {
  if (lifetimeAcres >= 200) return 'landowner';
  if (lifetimeAcres >= 50) return 'homesteader';
  if (lifetimeAcres >= 10) return 'grower';
  return 'seedling';
}

/**
 * Recalculate and persist a customer's tier based on their total acres.
 * Only updates the DB if the tier has actually changed.
 * Returns the final tier. Side-effect: fires notification on tier change (best-effort).
 */
export async function updateCustomerTier(
  client: PoolClient,
  customerId: string
): Promise<Tier> {
  // Sum all acres for this customer
  const sumResult = await client.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM acres WHERE customer_id = $1`,
    [customerId]
  );

  const lifetimeAcres = parseInt(sumResult.rows[0]?.total ?? '0', 10);
  const newTier = calculateTier(lifetimeAcres);

  // Get current tier + contact info for notification
  const currentResult = await client.query<Customer>(
    `SELECT * FROM customers WHERE id = $1`,
    [customerId]
  );

  const customer = currentResult.rows[0];
  const oldTier = customer?.tier as Tier | undefined;

  // Only update if changed
  if (oldTier !== newTier) {
    await client.query(
      `UPDATE customers SET tier = $1, lifetime_acres = $2, updated_at = now() WHERE id = $3`,
      [newTier, lifetimeAcres, customerId]
    );

    // Fire notification (non-blocking, outside critical path)
    if (customer) {
      // Clone minimal shape
      const custForNotify: Customer = { ...customer, tier: newTier, lifetime_acres: lifetimeAcres };
      // Don't await inside tx
      notifyTierUpgrade(custForNotify, oldTier!, newTier).catch((e) =>
        console.error('[Tier] Notification failed:', e)
      );
    }
  } else if (customer) {
    // Still ensure lifetime_acres is correct even if tier didn't change
    await client.query(
      `UPDATE customers SET lifetime_acres = $1, updated_at = now() WHERE id = $2`,
      [lifetimeAcres, customerId]
    );
  }

  return newTier;
}

/**
 * Convenience wrapper that accepts a pool and handles its own transaction.
 * Use this when you are not already inside a transaction.
 */
export async function updateCustomerTierWithPool(
  pool: import('pg').Pool,
  customerId: string
): Promise<Tier> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tier = await updateCustomerTier(client, customerId);
    await client.query('COMMIT');
    return tier;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
