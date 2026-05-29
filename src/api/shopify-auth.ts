import { Router, Request, Response } from 'express';
import { shopify, storeSession } from '../shopify-auth.js';

export const shopifyAuthRouter = Router();

// GET /auth → begin Shopify OAuth (or redirect in dev)
shopifyAuthRouter.get('/', async (req: Request, res: Response) => {
  const shop = (req.query.shop as string) || process.env.SHOPIFY_HOST;

  if (!shop) {
    return res.status(400).send('Missing ?shop= parameter');
  }

  // In development: just pretend success and redirect back to admin
  if (process.env.NODE_ENV !== 'production' || process.env.SKIP_SHOPIFY_AUTH === 'true') {
    console.log('[ShopifyAuth] Dev bypass for shop:', shop);
    return res.redirect('/admin?shop=' + encodeURIComponent(shop));
  }

  try {
    const authUrl = await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true) || shop,
      callbackPath: '/auth/callback',
      isOnline: false, // offline tokens for embedded apps
      // Note: the library will set the right redirect
    } as any);

    res.redirect(authUrl);
  } catch (err: any) {
    console.error('[ShopifyAuth] Begin error:', err);
    res.status(500).send('Failed to start Shopify auth: ' + err.message);
  }
});

// GET /auth/callback — handle OAuth completion
shopifyAuthRouter.get('/callback', async (req: Request, res: Response) => {
  const { host } = req.query as Record<string, string>;

  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    } as any);

    const { session } = callbackResponse;

    if (session) {
      await storeSession(session);
      console.log('[ShopifyAuth] Session stored for shop:', session.shop);

      // Redirect into the embedded admin with the shop param Shopify expects
      const redirectUrl = `/admin?shop=${encodeURIComponent(session.shop)}&host=${encodeURIComponent(host || '')}`;
      res.redirect(redirectUrl);
    } else {
      res.status(400).send('No session returned from Shopify');
    }
  } catch (err: any) {
    console.error('[ShopifyAuth] Callback error:', err);
    res.status(500).send('OAuth callback failed: ' + (err.message || err));
  }
});
