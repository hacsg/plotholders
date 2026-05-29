import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/index.js';
import { updateCustomerTier } from '../services/tier-engine.js';
import { verifyJWT, AuthRequest } from '../middleware/auth.js';
import {
  CreateCustomerRequest,
  UpdateCustomerRequest,
  MergeCustomersRequest,
  Customer,
  PaginatedResponse,
  CustomerWithHistory,
} from '../types/index.js';

export const customersRouter = Router();

// Zod schemas
const createCustomerSchema = z.object({
  phone: z.string().min(8).max(20),
  email: z.string().email().optional(),
  name: z.string().min(1).max(255).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  referred_by_code: z.string().length(6).optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional().nullable(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  tier: z.enum(['seedling', 'grower', 'homesteader', 'landowner']).optional(),
});

const mergeSchema = z.object({
  primary_id: z.string().uuid(),
  duplicate_id: z.string().uuid(),
});

const listQuerySchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  tier: z.enum(['seedling', 'grower', 'homesteader', 'landowner']).optional(),
  q: z.string().optional(), // free text search on name/phone/email
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// Utility: generate referral code (first 3 letters of name + 3 random)
function generateReferralCode(name: string | null | undefined): string {
  const prefix = (name ?? 'PLT')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');

  const random = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `${prefix}${random}`;
}

// Utility: find customer by referral code
async function findCustomerByReferralCode(code: string): Promise<Customer | null> {
  const result = await pool.query<Customer>(
    `SELECT * FROM customers WHERE referral_code = $1 AND is_merged = false`,
    [code]
  );
  return result.rows[0] ?? null;
}

// GET /api/customers - List/search customers with pagination
customersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const conditions: string[] = ['is_merged = false'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.phone) {
      conditions.push(`phone ILIKE $${paramIndex++}`);
      params.push(`%${query.phone}%`);
    }
    if (query.email) {
      conditions.push(`email ILIKE $${paramIndex++}`);
      params.push(`%${query.email}%`);
    }
    if (query.tier) {
      conditions.push(`tier = $${paramIndex++}`);
      params.push(query.tier);
    }
    if (query.q) {
      conditions.push(
        `(name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`
      );
      params.push(`%${query.q}%`);
      paramIndex++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM customers ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Fetch page
    const dataResult = await pool.query<Customer>(
      `SELECT * FROM customers ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, query.limit, query.offset]
    );

    const response: PaginatedResponse<Customer> = {
      data: dataResult.rows,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
      },
    };

    res.json(response);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid query parameters', details: err.issues });
    }
    console.error('[customers] GET / error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to list customers' });
    return;
  }
});

// GET /api/customers/:id - Get customer + tier + history
customersRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const customerResult = await pool.query<Customer>(
      `SELECT * FROM customers WHERE id = $1`,
      [id]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    // Fetch acre history
    const acresResult = await pool.query(
      `SELECT * FROM acres WHERE customer_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    // Fetch reward history
    const rewardsResult = await pool.query(
      `SELECT * FROM rewards WHERE customer_id = $1 ORDER BY redeemed_at DESC`,
      [id]
    );

    // Count referrals made by this customer
    const referralCountResult = await pool.query(
      `SELECT COUNT(*) FROM referrals WHERE referrer_id = $1`,
      [id]
    );

    const fullCustomer: CustomerWithHistory = {
      ...(customer as Customer),
      acre_history: acresResult.rows,
      reward_history: rewardsResult.rows,
      referral_count: parseInt(referralCountResult.rows[0]?.count ?? '0', 10),
    };

    res.json(fullCustomer);
  } catch (err) {
    console.error('[customers] GET /:id error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch customer' });
    return;
  }
});

// POST /api/customers - Create customer
customersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createCustomerSchema.parse(req.body);
    const body: CreateCustomerRequest = {
      phone: parsed.phone,
      email: parsed.email ?? undefined,
      name: parsed.name ?? undefined,
      birthday: parsed.birthday ?? undefined,
      referred_by_code: parsed.referred_by_code ?? undefined,
    };

    // Check for duplicate phone
    const existing = await pool.query(
      `SELECT id FROM customers WHERE phone = $1`,
      [body.phone]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'A customer with this phone already exists' });
    }

    // Handle referral
    let referredById: string | null = null;
    if (body.referred_by_code) {
      const referrer = await findCustomerByReferralCode(body.referred_by_code);
      if (referrer) {
        referredById = referrer.id;
      } else {
        console.warn(`[customers] Referral code not found: ${body.referred_by_code}`);
      }
    }

    const referralCode = generateReferralCode(body.name);

    const result = await withTransaction(async (client) => {
      const insertResult = await client.query<Customer>(
        `INSERT INTO customers (
          phone, email, name, birthday, referred_by, referral_code, migration_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          body.phone,
          body.email ?? null,
          body.name ?? null,
          body.birthday ?? null,
          referredById,
          referralCode,
          body.referred_by_code ? 'referral' : null,
        ]
      );

      const newCustomer = insertResult.rows[0];
      if (!newCustomer) {
        throw new Error('Failed to create customer');
      }

      // Record referral relationship if applicable
      if (referredById) {
        await client.query(
          `INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)`,
          [referredById, newCustomer.id]
        );
      }

      return newCustomer;
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid request body', details: err.issues });
    }
    if ((err as any).code === '23505') {
      // Unique violation (phone or referral_code)
      return res.status(409).json({ error: 'Conflict', message: 'Duplicate phone or referral code' });
    }
    console.error('[customers] POST error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to create customer' });
  }
});

// PATCH /api/customers/:id - Update customer
customersRouter.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const parsedUpdate = updateCustomerSchema.parse(req.body);
    const body: UpdateCustomerRequest = {
      name: parsedUpdate.name ?? undefined,
      email: parsedUpdate.email ?? undefined,
      birthday: parsedUpdate.birthday ?? undefined,
      tier: parsedUpdate.tier ?? undefined,
    };

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(body.name);
    }
    if (body.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(body.email);
    }
    if (body.birthday !== undefined) {
      fields.push(`birthday = $${idx++}`);
      values.push(body.birthday);
    }
    if (body.tier !== undefined) {
      fields.push(`tier = $${idx++}`);
      values.push(body.tier);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'ValidationError', message: 'No valid fields to update' });
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query<Customer>(
      `UPDATE customers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid request body', details: err.issues });
    }
    console.error('[customers] PATCH error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to update customer' });
    return;
  }
});

// POST /api/customers/merge - Merge two accounts
customersRouter.post('/merge', async (req: Request, res: Response) => {
  try {
    const body: MergeCustomersRequest = mergeSchema.parse(req.body);

    if (body.primary_id === body.duplicate_id) {
      return res.status(400).json({ error: 'ValidationError', message: 'Cannot merge a customer with themselves' });
    }

    const result = await withTransaction(async (client) => {
      // Verify both exist and are not already merged
      const check = await client.query(
        `SELECT id, is_merged FROM customers WHERE id IN ($1, $2)`,
        [body.primary_id, body.duplicate_id]
      );

      if (check.rows.length !== 2) {
        throw new Error('One or both customers not found');
      }

      const duplicate = check.rows.find((r) => r.id === body.duplicate_id);
      if (duplicate?.is_merged) {
        throw new Error('Duplicate customer is already merged');
      }

      // Move all acres from duplicate to primary
      await client.query(
        `UPDATE acres SET customer_id = $1 WHERE customer_id = $2`,
        [body.primary_id, body.duplicate_id]
      );

      // Move rewards
      await client.query(
        `UPDATE rewards SET customer_id = $1 WHERE customer_id = $2`,
        [body.primary_id, body.duplicate_id]
      );

      // Move referrals where duplicate was referrer
      await client.query(
        `UPDATE referrals SET referrer_id = $1 WHERE referrer_id = $2`,
        [body.primary_id, body.duplicate_id]
      );

      // Move referrals where duplicate was referred
      await client.query(
        `UPDATE referrals SET referred_id = $1 WHERE referred_id = $2`,
        [body.primary_id, body.duplicate_id]
      );

      // Mark duplicate as merged
      await client.query(
        `UPDATE customers SET is_merged = true, merged_into = $1, updated_at = now() WHERE id = $2`,
        [body.primary_id, body.duplicate_id]
      );

      // Recalculate tier for primary (acres may have increased)
      await updateCustomerTier(client, body.primary_id);

      // Return updated primary
      const updated = await client.query<Customer>(
        `SELECT * FROM customers WHERE id = $1`,
        [body.primary_id]
      );
      return updated.rows[0];
    });

    res.json({ success: true, primary: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', message: 'Invalid request body', details: err.issues });
    }
    const message = (err as Error).message;
    if (message.includes('not found') || message.includes('already merged')) {
      return res.status(404).json({ error: 'NotFound', message });
    }
    console.error('[customers] POST /merge error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to merge customers' });
    return;
  }
});

// DELETE /api/customers/:id - Soft delete (set is_merged=true)
customersRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE customers SET is_merged = true, updated_at = now() WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Customer not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('[customers] DELETE error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to delete customer' });
    return;
  }
});

// GET /api/me - Current logged-in customer (protected by JWT)
// Used by customer portal after real auth
customersRouter.get('/me', verifyJWT, async (req: AuthRequest, res: Response) => {
  const customerId = req.customerId!;
  try {
    const result = await pool.query<Customer>(
      `SELECT * FROM customers WHERE id = $1 AND is_merged = false`,
      [customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[customers] GET /me error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to fetch profile' });
  }
});
