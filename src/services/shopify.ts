import crypto from 'crypto';
import { Request } from 'express';
import { Tier } from '../types/index.js';

const SHOPIFY_API_VERSION = '2024-10';

/**
 * Verify Shopify webhook HMAC signature.
 * Shopify sends a base64-encoded HMAC-SHA256 of the raw request body
 * in the X-Shopify-Hmac-Sha256 header.
 */
export function verifyShopifyWebhook(
  req: Request,
  secret: string
): boolean {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!hmacHeader || typeof hmacHeader !== 'string') {
    return false;
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    // Fallback: if we didn't capture raw body, we cannot reliably verify
    console.warn('[Shopify] Raw body not available for HMAC verification');
    return false;
  }

  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

/**
 * Tag a Shopify customer with their current Plot Holders tier.
 * Uses the Admin API: PUT /admin/api/{version}/customers/{id}.json
 */
export async function tagShopifyCustomer(
  shopifyCustomerId: number,
  tier: Tier,
  accessToken: string,
  storeDomain: string
): Promise<void> {
  if (!accessToken || !storeDomain) {
    console.warn('[Shopify] Missing access token or store domain; skipping customer tagging');
    return;
  }

  const tag = `plot_holder:${tier}`;

  // First, fetch existing customer to preserve other tags
  const getUrl = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/customers/${shopifyCustomerId}.json`;

  try {
    const getRes = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!getRes.ok) {
      const text = await getRes.text();
      console.error(`[Shopify] Failed to fetch customer ${shopifyCustomerId}: ${getRes.status} ${text}`);
      return;
    }

    const data = (await getRes.json()) as { customer?: { tags?: string } };
    const existingTags = (data.customer?.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    // Remove any previous plot_holder:* tags, then add the new one
    const otherTags = existingTags.filter((t) => !t.startsWith('plot_holder:'));
    const newTags = [...otherTags, tag].join(', ');

    const updateUrl = getUrl;
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: {
          id: shopifyCustomerId,
          tags: newTags,
        },
      }),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      console.error(`[Shopify] Failed to update tags for ${shopifyCustomerId}: ${updateRes.status} ${text}`);
    } else {
      console.log(`[Shopify] Tagged customer ${shopifyCustomerId} with ${tag}`);
    }
  } catch (err) {
    console.error('[Shopify] Error tagging customer:', err);
  }
}

/**
 * Helper to extract raw body for webhook verification.
 * Must be used BEFORE express.json() middleware.
 */
export function captureRawBody(req: Request, _res: any, buf: Buffer, _encoding?: string) {
  (req as any).rawBody = buf.toString('utf8');
}
