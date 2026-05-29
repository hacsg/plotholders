import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

const isDev = process.env.NODE_ENV !== 'production';

export const shopify: ReturnType<typeof shopifyApi> = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'dev_api_key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'dev_api_secret',
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_HOST || 'localhost:3000',
  apiVersion: ApiVersion.January25,
  isEmbeddedApp: true,
  // In dev we allow localhost
  ...(isDev && { hostScheme: 'http' as const }),
});

// In-memory session store for simplicity (production should use Redis/Postgres)
const sessions = new Map<string, Session>();

export async function storeSession(session: Session): Promise<void> {
  sessions.set(session.id, session);
}

export async function loadSession(id: string): Promise<Session | undefined> {
  return sessions.get(id);
}

export function getSessionFromShop(shop: string): Session | undefined {
  for (const s of sessions.values()) {
    if (s.shop === shop) return s;
  }
  return undefined;
}

// Simple middleware: in development we bypass Shopify auth
// In production we require a valid session cookie or header
export async function verifyShopifySession(req: any, res: any, next: any) {
  if (isDev || process.env.SKIP_SHOPIFY_AUTH === 'true') {
    req.shopifySession = { shop: process.env.SHOPIFY_HOST || 'dev.myshopify.com' };
    return next();
  }

  try {
    // Try to load from cookie (Shopify App Bridge sets shopify-session or similar)
    const sessionId = req.cookies?.shopify_session_id || req.headers['x-shopify-session-id'];
    let session: Session | undefined;

    if (sessionId) {
      session = await loadSession(sessionId);
    }

    // Fallback: find by shop param if present (embedded apps pass ?shop=)
    const shopFromQuery = req.query?.shop as string | undefined;
    if (!session && shopFromQuery) {
      session = getSessionFromShop(shopFromQuery);
    }

    if (!session || !session.accessToken) {
      // Redirect to our auth begin flow
      const shop = shopFromQuery || process.env.SHOPIFY_HOST;
      if (shop) {
        return res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
      }
      return res.status(401).send('Shopify session required. <a href="/auth">Authenticate</a>');
    }

    req.shopifySession = session;
    next();
  } catch (err) {
    console.error('[ShopifyAuth] Session verification error:', err);
    res.status(401).send('Invalid Shopify session');
  }
}
