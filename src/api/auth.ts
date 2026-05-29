import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { setWithTTL, getValue, delKey } from '../lib/redis.js';
import { generateJWT } from '../middleware/auth.js';
import { normalizePhone } from '../services/phone.js';
import { sendEmail, sendSMS } from '../services/notifications.js';

export const authRouter = Router();

const magicLinkSchema = z.object({
  email: z.string().email(),
});

const smsCodeSchema = z.object({
  phone: z.string().min(8),
});

const verifySchema = z.object({
  token: z.string().optional(),
  code: z.string().optional(),
  phone: z.string().optional(),
});

// Helper: 6-char uppercase token for magic links
function generateMagicToken(): string {
  return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
}

// Helper: 6-digit numeric code
function generateSmsCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/magic-link
authRouter.post('/magic-link', async (req: Request, res: Response) => {
  try {
    const { email } = magicLinkSchema.parse(req.body);

    // Find customer by email (case-insensitive)
    const custRes = await pool.query(
      `SELECT id, name FROM customers WHERE lower(email) = lower($1) AND is_merged = false LIMIT 1`,
      [email]
    );

    if (custRes.rows.length === 0) {
      // Don't leak existence — still say "check email" for security
      return res.json({ success: true, message: 'Check your email for a magic link' });
    }

    const customer = custRes.rows[0];
    const token = generateMagicToken();
    const redisKey = `magic:${token}`;

    await setWithTTL(redisKey, customer.id, 10 * 60); // 10 minutes

    const link = `${process.env.APP_URL || 'http://localhost:3000'}/verify?token=${token}`;

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 40px auto; padding: 24px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color:#2f6f3e; margin-top:0;">Plot Holders Club</h2>
        <p>Hi ${customer.name || 'there'},</p>
        <p>Click the button below to sign in to your Plot Holders account. This link expires in 10 minutes.</p>
        <p style="margin: 24px 0;">
          <a href="${link}" style="background:#2f6f3e;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Sign in to Plot Holders</a>
        </p>
        <p style="font-size:13px;color:#666;">Or paste this code if the button doesn't work: <strong>${token}</strong></p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
        <p style="font-size:12px;color:#999;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

    await sendEmail(email, 'Your Plot Holders magic link', html);

    res.json({ success: true, message: 'Check your email for a magic link' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', details: err.issues });
    }
    console.error('[auth] magic-link error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to send magic link' });
  }
});

// POST /api/auth/sms-code
authRouter.post('/sms-code', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone } = smsCodeSchema.parse(req.body);
    const phone = normalizePhone(rawPhone);

    const custRes = await pool.query(
      `SELECT id FROM customers WHERE phone = $1 AND is_merged = false LIMIT 1`,
      [phone]
    );

    if (custRes.rows.length === 0) {
      return res.json({ success: true, message: 'Check your SMS for a code' });
    }

    const code = generateSmsCode();
    const redisKey = `sms:${phone}`;

    await setWithTTL(redisKey, code, 5 * 60); // 5 minutes

    const body = `Your Plot Holders code is: ${code} (expires in 5 minutes)`;

    await sendSMS(phone, body);

    res.json({ success: true, message: 'Check your SMS for a verification code' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', details: err.issues });
    }
    console.error('[auth] sms-code error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Failed to send SMS code' });
  }
});

// POST /api/auth/verify
authRouter.post('/verify', async (req: Request, res: Response) => {
  try {
    const body = verifySchema.parse(req.body);

    let customerId: string | null = null;

    if (body.token) {
      const token = body.token.toUpperCase().trim();
      const key = `magic:${token}`;
      customerId = await getValue(key);
      if (customerId) {
        await delKey(key); // one-time use
      }
    } else if (body.code && body.phone) {
      const phone = normalizePhone(body.phone);
      const key = `sms:${phone}`;
      const storedCode = await getValue(key);
      if (storedCode && storedCode === body.code.trim()) {
        const custRes = await pool.query(
          `SELECT id FROM customers WHERE phone = $1 AND is_merged = false LIMIT 1`,
          [phone]
        );
        if (custRes.rows[0]) {
          customerId = custRes.rows[0].id;
        }
        await delKey(key);
      }
    }

    if (!customerId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired code/token' });
    }

    // Verify customer still exists and not merged
    const check = await pool.query(
      `SELECT id FROM customers WHERE id = $1 AND is_merged = false`,
      [customerId]
    );
    if (check.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Account no longer available' });
    }

    const jwt = generateJWT(customerId);

    res.json({
      success: true,
      token: jwt,
      customer_id: customerId,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'ValidationError', details: err.issues });
    }
    console.error('[auth] verify error:', err);
    res.status(500).json({ error: 'InternalError', message: 'Verification failed' });
  }
});
