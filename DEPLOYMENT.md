# Deployment Guide — Plot Holders Club

This document covers production deployment to Railway + Shopify App setup.

## 1. Railway Setup

1. Create a new project at https://railway.app
2. Connect your GitHub repository (`plotholders`)
3. Add **Postgres** plugin (this provides `DATABASE_URL`)
4. Add **Redis** plugin (provides `REDIS_URL` — critical for auth tokens)
5. In the service settings, add the following environment variables (see `.env.example`):

   - `JWT_SECRET` — strong random string (use `openssl rand -hex 32`)
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
   - `RESEND_API_KEY`
   - `APP_URL=https://plotholders.hundredacre.sg`
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_HOST`
   - `NODE_ENV=production`
   - `SKIP_SHOPIFY_AUTH=false` (remove or set false in prod)

6. Deploy. Railway will build using `npm run build` + `npm start`.

## 2. Domain & DNS

1. In Railway, go to your service → Settings → Domains
2. Add custom domain: `plotholders.hundredacre.sg`
3. Update your DNS provider with the CNAME / A record provided by Railway
4. Wait for SSL provisioning (usually < 5 min)

## 3. Shopify App Registration (Partners Dashboard)

1. Go to [Shopify Partners](https://partners.shopify.com)
2. Apps → Create app → **Public app** (or Custom app for single store)
3. Fill in:
   - App name: Plot Holders Club
   - App URL: `https://plotholders.hundredacre.sg/admin`
   - Allowed redirection URL(s): `https://plotholders.hundredacre.sg/auth/callback`
4. Configure API scopes (Admin API):
   - `read_customers`, `write_customers`, `read_orders`
5. Install the app on your development store first, then on the live store.
6. Copy the **API key** and **API secret** into Railway env vars.

After installation, the embedded admin will load at:
`https://admin.shopify.com/store/YOUR-STORE/apps/PLOT-HOLDERS`

## 4. Database Migrations

After first deploy:

```bash
# Via Railway CLI or one-off command in dashboard
npm run migrate
```

Or connect directly:
```bash
psql $DATABASE_URL -f src/db/schema.sql
```

## 5. Initial Seeding

```bash
npm run seed
```

Use the **Seed Regulars** tab in the Admin UI (embedded) to grandfather existing customers with an initial tier.

## 6. Testing Checklist (Production)

- [ ] Health check returns 200
- [ ] Magic link flow works end-to-end (email arrives)
- [ ] SMS code flow works (Twilio delivers)
- [ ] Portal `/api/me` works with real JWT
- [ ] Shopify order webhook awards acres + updates tier + sends notification
- [ ] Tier upgrade triggers `notifyTierUpgrade` (email/SMS)
- [ ] Birthday cron runs daily at 9am (check logs)
- [ ] Win-back campaign runs Mondays (check logs)
- [ ] Referral claim awards acres to both parties + notification
- [ ] Grandfather seeding works from Admin UI
- [ ] Staff UI lookup + redeem still functions
- [ ] Admin loads inside Shopify Admin (no auth errors)
- [ ] No 500 errors in Railway logs

## 7. Monitoring & Logs

- Railway provides log tailing
- All key events (auth, tier changes, crons, notifications) are logged with `[Tag]`
- Failed emails/SMS fall back to console logs

## 8. Rollback

Railway keeps deployment history. Use "Rollback" from the dashboard if a deploy breaks auth or webhooks.

## 9. Common Issues

**Redis connection fails** → Make sure `REDIS_URL` is set and the Redis plugin is attached to the same project.

**Magic link 404s** → `APP_URL` must exactly match the deployed domain (no trailing slash).

**Shopify OAuth loop** → Verify redirect URLs in Partners dashboard match exactly. Use `SKIP_SHOPIFY_AUTH=true` only in development.

**Cron not running** → Check Railway logs around 09:00 and 10:00 UTC/Mon. Railway hobby dynos sleep; use a paid plan or external cron if needed for reliability.

---

**You are now production-ready.** The Plot Holders Club is complete after Phase 3.
