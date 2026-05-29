import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import fs from 'fs';

import { customersRouter } from './api/customers.js';
import { acresRouter } from './api/acres.js';
import { rewardsRouter } from './api/rewards.js';
import { webhooksRouter } from './api/webhooks.js';
import { qashierRouter } from './api/qashier.js';
import { referralsRouter } from './api/referrals.js';
import { staffRouter } from './api/staff.js';
import { authRouter } from './api/auth.js';
import { shopifyAuthRouter } from './api/shopify-auth.js';

import { pool } from './db/index.js';
import { setupCronJobs } from './cron.js';
import { verifyShopifySession } from './shopify-auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Security & Core Middleware
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameSrc: ["'self'", "https://*.myshopify.com", "https://admin.shopify.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.shopify.com", "https://*.myshopify.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.myshopify.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cookieParser());

// IMPORTANT: Capture raw body for Shopify webhook HMAC verification
app.use(
  '/webhooks/shopify',
  express.raw({
    type: 'application/json',
    verify: (req: any, _res, buf: Buffer) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// Standard body parsing for the rest of the app
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (improved)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${method} ${path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // generous for loyalty use + staff
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================
// Authentication routes (real magic link + SMS)
// ============================================
app.use('/api/auth', authRouter);

// Shopify OAuth (embedded app)
app.use('/auth', shopifyAuthRouter);

// API routes (some protected via verifyJWT inside)
app.use('/api/customers', customersRouter);
app.use('/api/acres', acresRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api/qashier', qashierRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/staff', staffRouter);

// Shopify webhooks
app.use('/webhooks', webhooksRouter);

// ============================================
// Static frontend serving (Phase 2)
// ============================================

const DIST_DIR = path.resolve(process.cwd(), 'dist');

// Debug endpoint to check dist directory
app.get('/debug', (_req, res) => {
  const distPath = DIST_DIR;
  const portalPath = path.join(distPath, 'portal');
  const indexPath = path.join(portalPath, 'index.html');
  
  const debug = {
    cwd: process.cwd(),
    distExists: fs.existsSync(distPath),
    distContents: fs.existsSync(distPath) ? fs.readdirSync(distPath) : [],
    portalExists: fs.existsSync(portalPath),
    portalContents: fs.existsSync(portalPath) ? fs.readdirSync(portalPath) : [],
    indexExists: fs.existsSync(indexPath),
    indexPath: indexPath
  };
  
  res.json(debug);
});

// Admin UI (Shopify embedded) - served at /admin/*
// Protected by Shopify session in production
const adminDist = path.join(DIST_DIR, 'admin');
app.use('/admin', verifyShopifySession, express.static(adminDist, { index: false }));
app.get('/admin', verifyShopifySession, (_req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'));
});
app.get('/admin/*splat', verifyShopifySession, (_req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'));
});

// Staff UI (mobile, direct access) - /staff/*
const staffDist = path.join(DIST_DIR, 'staff');
app.use('/staff', express.static(staffDist, { index: false }));
app.get('/staff', (_req, res) => {
  res.sendFile(path.join(staffDist, 'index.html'));
});
app.get('/staff/*splat', (_req, res) => {
  res.sendFile(path.join(staffDist, 'index.html'));
});

// Customer Portal (root catch-all) - must be LAST before 404
const portalDist = path.join(DIST_DIR, 'portal');
app.use('/', express.static(portalDist, { index: false }));
app.get('/', (_req, res) => {
  res.sendFile(path.join(portalDist, 'index.html'));
});
// SPA fallback for portal (any non-api, non-special path)
app.get('/*splat', (req, res, next) => {
  // Don't intercept API, webhooks, health, or already handled paths
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/webhooks') ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/staff')
  ) {
    return next();
  }
  res.sendFile(path.join(portalDist, 'index.html'));
});

// 404 handler (for API/JSON paths)
app.use((req: Request, res: Response) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Route ${req.method} ${req.path} not found`,
    });
  }
  // SPA fallback already handled above for portal
  res.status(404).send('Not found');
});

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Start server + background jobs
app.listen(PORT, () => {
  console.log(`[Server] Plot Holders API listening on port ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start cron jobs (birthdays + winback)
  try {
    setupCronJobs();
  } catch (e) {
    console.error('[Server] Failed to start cron jobs:', e);
  }
});

export default app;
