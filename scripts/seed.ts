/**
 * Database seeding script for development.
 *
 * Usage:
 *   npm run seed
 *
 * This script creates a few sample customers and awards some acres.
 * Safe to run multiple times (idempotent on phone).
 */

import { pool } from '../src/db/index.js';
import { updateCustomerTier } from '../src/services/tier-engine.js';

async function seed() {
  console.log('[Seed] Starting database seed...');

  try {
    // Sample customers
    const customers = [
      { phone: '+14155550101', name: 'Alice Chen', email: 'alice@example.com' },
      { phone: '+14155550102', name: 'Bob Rivera', email: 'bob@example.com' },
      { phone: '+14155550103', name: 'Charlie Kim', email: 'charlie@example.com' },
    ];

    for (const c of customers) {
      const existing = await pool.query(`SELECT id FROM customers WHERE phone = $1`, [c.phone]);
      if (existing.rows.length > 0) {
        console.log(`[Seed] Customer with phone ${c.phone} already exists, skipping`);
        continue;
      }

      const result = await pool.query(
        `INSERT INTO customers (phone, email, name, referral_code)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [c.phone, c.email, c.name, c.name.slice(0, 3).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase()]
      );
      console.log(`[Seed] Created customer: ${c.name} (${result.rows[0].id})`);
    }

    // Award some acres to first customer
    const alice = await pool.query(`SELECT id FROM customers WHERE phone = '+14155550101'`);
    if (alice.rows.length > 0) {
      const aliceId = alice.rows[0].id;

      // Award 12 acres via manual
      await pool.query(
        `INSERT INTO acres (customer_id, channel, source_id, amount, reason)
         VALUES ($1, 'manual', 'seed-001', 12, 'initial_grant')
         ON CONFLICT (channel, source_id) DO NOTHING`,
        [aliceId]
      );

      const newTier = await updateCustomerTier(pool, aliceId);
      console.log(`[Seed] Awarded 12 acres to Alice → tier: ${newTier}`);
    }

    console.log('[Seed] Database seed completed successfully.');
  } catch (err) {
    console.error('[Seed] Error during seeding:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
