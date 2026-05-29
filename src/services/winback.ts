import { pool } from '../db/index.js';
import { Customer } from '../types/index.js';
import { notifyWinBack } from './notifications.js';
import { setWithTTL, getValue } from '../lib/redis.js';

const WINBACK_DAYS_INACTIVE = 45;
const WINBACK_COOLDOWN_DAYS = 30;

/**
 * Run the win-back campaign.
 * Finds customers with no acres recorded in the last 45 days.
 * Skips those who received a win-back notification in the last 30 days (tracked in Redis).
 * Sends notification via email/SMS (falls back to console).
 */
export async function runWinBackCampaign(): Promise<{ notified: number; skipped: number }> {
  console.log('[WinBack] Starting win-back campaign...');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WINBACK_DAYS_INACTIVE);

  // Find customers who have at least one order historically, but none recently
  const { rows: candidates } = await pool.query<Customer & { last_order: string }>(`
    SELECT c.*
    FROM customers c
    WHERE c.is_merged = false
      AND EXISTS (
        SELECT 1 FROM acres a WHERE a.customer_id = c.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM acres a 
        WHERE a.customer_id = c.id 
          AND a.created_at > $1
      )
    LIMIT 500
  `, [cutoff.toISOString()]);

  console.log(`[WinBack] Found ${candidates.length} candidates (no activity in ${WINBACK_DAYS_INACTIVE}+ days)`);

  let notified = 0;
  let skipped = 0;

  for (const customer of candidates) {
    const redisKey = `winback:${customer.id}`;
    const alreadySent = await getValue(redisKey);

    if (alreadySent) {
      skipped++;
      continue;
    }

    // Compute days since last order for messaging
    const lastOrderRes = await pool.query<{ last: string }>(
      `SELECT MAX(created_at) as last FROM acres WHERE customer_id = $1`,
      [customer.id]
    );
    const lastStr = lastOrderRes.rows[0]?.last;
    let daysSince = WINBACK_DAYS_INACTIVE;
    if (lastStr) {
      const diffMs = Date.now() - new Date(lastStr).getTime();
      daysSince = Math.floor(diffMs / (1000 * 3600 * 24));
    }

    try {
      await notifyWinBack(customer, Math.max(daysSince, WINBACK_DAYS_INACTIVE));

      // Mark sent for 30 days (cooldown)
      await setWithTTL(redisKey, new Date().toISOString(), WINBACK_COOLDOWN_DAYS * 24 * 3600);

      notified++;
      console.log(`[WinBack] Notified ${customer.phone} (inactive ${daysSince}d)`);
    } catch (err) {
      console.error(`[WinBack] Failed to notify ${customer.id}:`, err);
    }
  }

  console.log(`[WinBack] Campaign complete. Notified: ${notified}, Skipped (cooldown): ${skipped}`);
  return { notified, skipped };
}
