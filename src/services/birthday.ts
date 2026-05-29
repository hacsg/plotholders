/**
 * Birthday Rewards Service (Phase 2)
 *
 * - runDailyBirthdayRewards(): intended to be called by a daily cron (e.g. 00:05 server time)
 * - getUpcomingBirthdays(days): returns customers with birthdays in next N days
 *
 * For now logs discount codes to console. Email/SMS will be added in Phase 4.
 */
import { pool } from '../db/index.js';
import { Customer, Tier } from '../types/index.js';
import crypto from 'crypto';
import { notifyBirthday } from './notifications.js';

export interface BirthdayRewardResult {
  customer_id: string;
  name: string | null;
  phone: string;
  discount_code: string;
  tier: Tier;
}

export interface UpcomingBirthday {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  birthday: string; // YYYY-MM-DD
  tier: Tier;
  days_until: number;
}

/**
 * Generate unique birthday discount code: HBD-{first8ofUUID}-{YEAR}
 */
function generateBirthdayCode(customerId: string, year: number): string {
  // Use first 8 chars of a UUID-like hash for determinism + uniqueness
  const hash = crypto.createHash('sha256').update(customerId + year + Date.now()).digest('hex').slice(0, 8).toUpperCase();
  return `HBD-${hash}-${year}`;
}

/**
 * Run daily birthday reward job.
 * Finds customers whose birthday (month+day) matches today.
 * Awards a logged reward with a generated discount code.
 * Returns list of processed customers.
 */
export async function runDailyBirthdayRewards(today: Date = new Date()): Promise<BirthdayRewardResult[]> {
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();

  const results: BirthdayRewardResult[] = [];

  const query = `
    SELECT * FROM customers
    WHERE is_merged = false
      AND birthday IS NOT NULL
      AND EXTRACT(MONTH FROM birthday) = $1
      AND EXTRACT(DAY FROM birthday) = $2
  `;

  const { rows } = await pool.query<Customer>(query, [month, day]);

  console.log(`[Birthday] Found ${rows.length} birthday(s) today (${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')})`);

  for (const customer of rows) {
    const discountCode = generateBirthdayCode(customer.id, year);

    try {
      // Insert reward log (idempotency: we don't prevent duplicate runs today, but code is unique-ish)
      await pool.query(
        `INSERT INTO rewards (customer_id, tier, reward_type, channel, notes)
         VALUES ($1, $2, 'birthday', 'system', $3)`,
        [customer.id, customer.tier, `Birthday discount: ${discountCode}`]
      );

      const result: BirthdayRewardResult = {
        customer_id: customer.id,
        name: customer.name,
        phone: customer.phone,
        discount_code: discountCode,
        tier: customer.tier,
      };

      results.push(result);

      // Send birthday notification (email + SMS)
      notifyBirthday(customer, discountCode).catch((e) =>
        console.error('[Birthday] Notification failed for', customer.phone, e)
      );

      console.log(`[Birthday] Awarded to ${customer.name || customer.phone} (${customer.tier}): ${discountCode}`);
    } catch (err: any) {
      // Unique violation or other error — skip
      if (err.code === '23505') {
        console.log(`[Birthday] Reward already recorded for ${customer.phone} today (skipped)`);
      } else {
        console.error(`[Birthday] Failed for ${customer.phone}:`, err.message);
      }
    }
  }

  return results;
}

/**
 * Get customers with birthdays in the next N days (inclusive of today).
 * Useful for staff preview + "Send Birthday Reward" actions (future).
 */
export async function getUpcomingBirthdays(days: number = 7): Promise<UpcomingBirthday[]> {
  if (days < 1) days = 7;

  // Use Postgres date math for clean upcoming birthdays
  const query = `
    SELECT 
      id, name, phone, email, birthday, tier,
      (
        (EXTRACT(DOY FROM birthday) - EXTRACT(DOY FROM CURRENT_DATE) + 365) % 365
      ) as days_until_raw
    FROM customers
    WHERE is_merged = false
      AND birthday IS NOT NULL
    ORDER BY days_until_raw ASC
    LIMIT 200
  `;

  const { rows } = await pool.query<any>(query);

  const upcoming: UpcomingBirthday[] = [];

  for (const row of rows) {
    let daysUntil = Math.floor(Number(row.days_until_raw || 0));

    // If birthday already passed this year (negative raw), it will be large positive due to mod
    // But we want only within next `days`
    if (daysUntil > days) continue;

    // Handle today = 0
    if (daysUntil === 0 && new Date().getMonth() + 1 === new Date(row.birthday).getMonth() + 1) {
      // fine
    }

    upcoming.push({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      birthday: row.birthday,
      tier: row.tier,
      days_until: daysUntil,
    });
  }

  // Sort by days until
  upcoming.sort((a, b) => a.days_until - b.days_until);

  return upcoming.slice(0, 100); // safety
}
