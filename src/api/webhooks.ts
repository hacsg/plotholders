import express, { Router, Request, Response } from 'express';
import { pool, withTransaction } from '../db/index.js';
import { verifyShopifyWebhook, tagShopifyCustomer } from '../services/shopify.js';
import { updateCustomerTier } from '../services/tier-engine.js';
import { Tier } from '../types/index.js';

export const webhooksRouter = Router();

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';

// Middleware to capture raw body for HMAC verification (must run before body parser)
function requireRawBody(req: Request, res: Response, next: express.NextFunction) {
  if (!(req as any).rawBody) {
    res.status(400).json({ error: 'BadRequest', message: 'Raw body required for webhook verification' });
    return;
  }
  next();
}

/**
 * POST /webhooks/shopify/orders/paid
 * Awards 1 acre per qualifying order (or more sophisticated logic later).
 * Idempotent via shopify_sync table.
 */
webhooksRouter.post('/shopify/orders/paid', requireRawBody, async (req: Request, res: Response) => {
  if (!verifyShopifyWebhook(req, SHOPIFY_WEBHOOK_SECRET)) {
    console.warn('[Webhooks] Shopify webhook signature verification failed');
    return res.status(401).send('Unauthorized');
  }

  try {
    const order = req.body;

    const orderId = order.id;
    const shopifyCustomerId = order.customer?.id;
    const orderTotal = parseFloat(order.total_price ?? '0');

    if (!orderId) {
      return res.status(400).json({ error: 'BadRequest', message: 'Missing order id' });
    }

    // Idempotency check
    const existing = await pool.query(
      `SELECT order_id FROM shopify_sync WHERE order_id = $1`,
      [orderId]
    );
    if (existing.rows.length > 0) {
      console.log(`[Webhooks] Duplicate order webhook ignored: ${orderId}`);
      return res.status(200).send('OK (duplicate)');
    }

    if (!shopifyCustomerId) {
      // Order without customer — still record it so we don't reprocess
      await pool.query(
        `INSERT INTO shopify_sync (order_id, acres_awarded) VALUES ($1, 0)`,
        [orderId]
      );
      return res.status(200).send('OK (no customer)');
    }

    // Find our internal customer by shopify_customer_id
    const custResult = await pool.query(
      `SELECT id, tier FROM customers WHERE shopify_customer_id = $1 AND is_merged = false`,
      [shopifyCustomerId]
    );

    if (custResult.rows.length === 0) {
      // Customer not yet in our system — we can still record the sync
      await pool.query(
        `INSERT INTO shopify_sync (order_id, acres_awarded) VALUES ($1, 0)`,
        [orderId]
      );
      return res.status(200).send('OK (customer not found)');
    }

    const customerId = custResult.rows[0].id as string;

    // Award 1 acre for the order (simple rule for Phase 1)
    // In future we could use orderTotal to award variable acres.
    const acresToAward = 1;

    await withTransaction(async (client) => {
      // Record acre
      await client.query(
        `INSERT INTO acres (customer_id, channel, source_id, amount, reason, order_total)
         VALUES ($1, 'shopify', $2, $3, 'shopify_order', $4)`,
        [customerId, String(orderId), acresToAward, orderTotal]
      );

      // Record sync
      await client.query(
        `INSERT INTO shopify_sync (order_id, customer_id, acres_awarded) VALUES ($1, $2, $3)`,
        [orderId, customerId, acresToAward]
      );

      // Update tier
      const newTier = await updateCustomerTier(client, customerId);

      // Tag Shopify customer (best effort)
      if (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_STORE_DOMAIN) {
        await tagShopifyCustomer(
          shopifyCustomerId,
          newTier,
          process.env.SHOPIFY_ACCESS_TOKEN,
          process.env.SHOPIFY_STORE_DOMAIN
        );
      }
    });

    console.log(`[Webhooks] Awarded ${acresToAward} acre(s) for Shopify order ${orderId} to customer ${customerId}`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[Webhooks] Shopify orders/paid error:', err);
    // Return 200 so Shopify doesn't keep retrying on our processing errors (we can reprocess later)
    res.status(200).send('Accepted with error');
    return;
  }
});

/**
 * POST /webhooks/shopify/customers/create
 * Creates or links a customer when one is created in Shopify.
 */
webhooksRouter.post('/shopify/customers/create', requireRawBody, async (req: Request, res: Response) => {
  if (!verifyShopifyWebhook(req, SHOPIFY_WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const shopifyCustomer = req.body;
    const shopifyId = shopifyCustomer.id;
    const phone = shopifyCustomer.phone?.replace(/\D/g, '') ?? null;
    const email = shopifyCustomer.email ?? null;
    const name = [shopifyCustomer.first_name, shopifyCustomer.last_name].filter(Boolean).join(' ') || null;

    if (!phone && !email) {
      return res.status(200).send('OK (no contact info)');
    }

    // Try to find existing customer by phone or email
    let existing = null;
    if (phone) {
      const r = await pool.query(`SELECT id FROM customers WHERE phone = $1`, [phone]);
      existing = r.rows[0];
    }
    if (!existing && email) {
      const r = await pool.query(`SELECT id FROM customers WHERE email = $1`, [email]);
      existing = r.rows[0];
    }

    if (existing) {
      // Link Shopify ID
      await pool.query(
        `UPDATE customers SET shopify_customer_id = $1, updated_at = now() WHERE id = $2`,
        [shopifyId, existing.id]
      );
      return res.status(200).send('OK (linked)');
    }

    // Create new customer from Shopify data
    const referralCode = (name ?? 'PLT').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X') +
      Math.random().toString(36).toUpperCase().slice(2, 5);

    await pool.query(
      `INSERT INTO customers (phone, email, name, shopify_customer_id, referral_code, migration_source)
       VALUES ($1, $2, $3, $4, $5, 'shopify')`,
      [phone ?? `shopify_${shopifyId}`, email, name, shopifyId, referralCode]
    );

    res.status(200).send('OK (created)');
    return;
  } catch (err) {
    console.error('[Webhooks] Shopify customers/create error:', err);
    res.status(200).send('Accepted');
    return;
  }
});

/**
 * POST /webhooks/shopify/customers/update
 * Syncs profile changes and ensures tier tag is up to date.
 */
webhooksRouter.post('/shopify/customers/update', requireRawBody, async (req: Request, res: Response) => {
  if (!verifyShopifyWebhook(req, SHOPIFY_WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const shopifyCustomer = req.body;
    const shopifyId = shopifyCustomer.id;

    const custResult = await pool.query(
      `SELECT id, tier FROM customers WHERE shopify_customer_id = $1`,
      [shopifyId]
    );

    if (custResult.rows.length === 0) {
      return res.status(200).send('OK (not found)');
    }

    const customerId = custResult.rows[0].id as string;
    const currentTier = custResult.rows[0].tier as Tier;

    // Update basic fields
    const phone = shopifyCustomer.phone?.replace(/\D/g, '') ?? null;
    const email = shopifyCustomer.email ?? null;
    const name = [shopifyCustomer.first_name, shopifyCustomer.last_name].filter(Boolean).join(' ') || null;

    await pool.query(
      `UPDATE customers 
       SET phone = COALESCE($1, phone), email = COALESCE($2, email), name = COALESCE($3, name), updated_at = now()
       WHERE id = $4`,
      [phone, email, name, customerId]
    );

    // Re-tag in Shopify (best effort)
    if (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_STORE_DOMAIN) {
      await tagShopifyCustomer(
        shopifyId,
        currentTier,
        process.env.SHOPIFY_ACCESS_TOKEN,
        process.env.SHOPIFY_STORE_DOMAIN
      );
    }

    res.status(200).send('OK');
    return;
  } catch (err) {
    console.error('[Webhooks] Shopify customers/update error:', err);
    res.status(200).send('Accepted');
    return;
  }
});
