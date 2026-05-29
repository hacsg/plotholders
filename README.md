# Plot Holders Club — Loyalty Platform (Phase 3 Complete)

Full-stack loyalty program for The Acre (Hundred Acre Coffee).

**Status**: Production-ready after Phase 3.

## What Was Built

- **Phase 1**: Backend API, customer CRUD, tier engine, Shopify + Qashier webhooks/imports, referral claiming, birthday rewards service.
- **Phase 2**: Three frontends — Staff (mobile lookup/redeem), Customer Portal (fake JWT), Admin (Shopify embedded Polaris-style).
- **Phase 3 (Final)**: Real authentication (magic links + SMS via Twilio/Resend), automated notifications, cron jobs, grandfather seeding UI, Shopify OAuth, security hardening (helmet + rate limiting), structured error handling + logging, full deployment guide.

## Tech Stack

- Node.js + Express + TypeScript
- PostgreSQL + Redis
- Twilio (SMS), Resend (email)
- jsonwebtoken + node-cron + helmet + express-rate-limit
- @shopify/shopify-api (OAuth)
- React + Vite for three SPAs (no heavy framework)

## Tech Stack

- Node.js 20+
- Express + TypeScript (strict)
- PostgreSQL (raw `pg` driver, no ORM)
- Zod for validation
- dotenv for configuration

## Project Structure

```
src/
├── index.ts                 # Express server + middleware
├── db/
│   ├── index.ts             # Connection pool
│   └── schema.sql           # Full database schema
├── api/
│   ├── customers.ts         # Customer CRUD + merge
│   ├── acres.ts             # Acre ledger
│   ├── rewards.ts           # Reward redemptions
│   └── webhooks.ts          # Shopify webhooks
├── services/
│   ├── tier-engine.ts       # Tier calculation + persistence
│   ├── shopify.ts           # Webhook verification + tagging
│   └── qashier.ts           # CSV importer (stub)
└── types/
    └── index.ts             # All shared types
```

## Quick Start (Local Development)

### 1. Prerequisites

- Node.js 20+
- PostgreSQL + Redis (local or Railway)
- Twilio + Resend accounts (or omit keys — falls back to console logging)

### 2. Setup

```bash
npm install
cp .env.example .env
# Edit .env — at minimum: DATABASE_URL, REDIS_URL, JWT_SECRET
npm run migrate
npm run seed          # optional demo data
```

### 3. Run

```bash
npm run dev
# In other terminals for UI hot reload:
npm run dev:portal
npm run dev:staff
npm run dev:admin
```

Visit:
- Customer Portal: http://localhost:3000 (or the portal vite port)
- Staff UI: http://localhost:3001 (check vite output)
- Admin UI (bypassed): http://localhost:3000/admin

## Authentication (Phase 3)

- **Magic Link**: POST `/api/auth/magic-link` with `{ email }`
- **SMS Code**: POST `/api/auth/sms-code` with `{ phone }`
- **Verify**: POST `/api/auth/verify` with `{ token }` or `{ code, phone }`
- Returns real JWT (7 days). Portal stores in localStorage and uses `Authorization: Bearer` + `/api/customers/me`

All protected customer routes (e.g. `/api/me`) require the JWT.

## Key API Additions (Phase 3)

- `/api/auth/*` — magic link, SMS, verify
- `GET /api/customers/me` — current user (JWT required)
- Grandfather seeding via Admin UI (`/admin/grandfather`)
- Full notification hooks on tier change, birthday, referral, win-back

## Cron Jobs

- Birthdays: daily 09:00
- Win-back campaign: Mondays 10:00

See `src/cron.ts` + `src/services/winback.ts`.

## Deployment

**See [DEPLOYMENT.md](./DEPLOYMENT.md)** for complete Railway + Shopify App registration + domain + testing checklist.

High-level:

1. Push to GitHub
2. Railway: Postgres + Redis + env vars + custom domain
3. `npm run migrate`
4. Register Shopify App in Partners (App URL + redirect)
5. Install on store
6. Seed grandfather customers via Admin UI

## Scripts

- `npm run dev` — backend watch
- `npm run build` — all frontends + backend
- `npm run migrate` — run schema
- `npm run seed` — demo data
- `npm run typecheck`

## Environment Variables (see .env.example)

Required for full functionality:
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TWILIO_*`, `RESEND_API_KEY`, `APP_URL`, Shopify OAuth keys.

---

**Phase 3 is complete.** The Plot Holders Club is now a production-grade, fully automated loyalty platform ready for deployment to Railway and installation as a Shopify embedded app.

### 4. Initialize Database

```bash
psql $DATABASE_URL -f src/db/schema.sql
```

Or run:

```bash
npm run db:init
```

### 5. Run the Server (Development)

```bash
npm run dev
```

Server starts on `http://localhost:3000`

Health check: `GET http://localhost:3000/health`

### 6. Seed Sample Data (Optional)

```bash
npm run seed
```

## API Endpoints

### Customers

| Method | Path                              | Description                              |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/api/customers?phone=&email=&tier=&q=&limit=&offset=` | List/search customers (paginated) |
| GET    | `/api/customers/:id`              | Get full customer + acre/reward history |
| POST   | `/api/customers`                  | Create customer (auto-generates referral code) |
| PATCH  | `/api/customers/:id`              | Update name/email/birthday/tier          |
| POST   | `/api/customers/merge`            | Merge two customer accounts              |
| DELETE | `/api/customers/:id`              | Soft-delete (is_merged=true)             |

### Acres

| Method | Path                        | Description                     |
|--------|-----------------------------|---------------------------------|
| POST   | `/api/acres`                | Add acres to a customer         |
| GET    | `/api/customers/:id/acres`  | Get acre history for customer   |

### Rewards

| Method | Path                             | Description                     |
|--------|----------------------------------|---------------------------------|
| POST   | `/api/rewards/redeem`            | Record a reward redemption      |
| GET    | `/api/customers/:id/rewards`     | Get reward history              |

### Webhooks

| Method | Path                                      | Description                     |
|--------|-------------------------------------------|---------------------------------|
| POST   | `/webhooks/shopify/orders/paid`           | Shopify order paid webhook      |
| POST   | `/webhooks/shopify/customers/create`      | Shopify customer created        |
| POST   | `/webhooks/shopify/customers/update`      | Shopify customer updated        |

Health: `GET /health`

## Tier System

| Tier         | Lifetime Acres | Description     |
|--------------|----------------|-----------------|
| seedling     | 0–9            | Default         |
| grower       | 10–49          | First milestone |
| homesteader  | 50–199         | Mid-tier        |
| landowner    | 200+           | Top tier        |

Tiers are automatically recalculated whenever acres are added.

## Referral Codes

- 6-character alphanumeric (e.g. `ALI7K2`)
- Generated on customer creation: first 3 letters of name + 3 random chars
- Can be used on `POST /api/customers` via `referred_by_code`

## Shopify Integration (Phase 1)

- Webhook signature verification (HMAC-SHA256)
- Idempotent order processing via `shopify_sync` table
- Automatic customer tagging (`plot_holder:seedling`, etc.)
- Customer create/update webhooks keep profile data in sync

## Scripts

| Script         | Description                              |
|----------------|------------------------------------------|
| `npm run dev`  | Run server with hot reload (tsx watch)   |
| `npm run build`| Compile TypeScript to `dist/`            |
| `npm run start`| Run compiled production build            |
| `npm run seed` | Seed sample customers + acres            |
| `npm run typecheck` | Run TypeScript type checker         |
| `npm run clean` | Remove `dist/` folder                   |

## Testing the API (Manual)

Use curl or any HTTP client:

```bash
# Create a customer
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{"phone":"+14155550123","name":"Test User","email":"test@example.com"}'

# Get customer (replace :id)
curl http://localhost:3000/api/customers/:id

# Add acres
curl -X POST http://localhost:3000/api/acres \
  -H "Content-Type: application/json" \
  -d '{"customer_id":":id","channel":"manual","amount":15,"reason":"manual_grant"}'

# Check tier updated
curl http://localhost:3000/api/customers/:id
```

## Out of Scope (Future Phases)

- React frontend (Phase 2)
- Qashier CSV importer (Phase 2)
- Customer portal authentication (Phase 3)
- Email/SMS notifications (Phase 4)
- Admin dashboard UI (Phase 2)

## License

Internal project.
