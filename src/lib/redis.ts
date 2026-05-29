import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let usingMemory = false;

// In-memory fallback for dev when Redis not configured
const memoryStore = new Map<string, { value: string; expiresAt: number }>();

function cleanupMemory() {
  const now = Date.now();
  for (const [k, v] of memoryStore.entries()) {
    if (v.expiresAt < now) memoryStore.delete(k);
  }
}

export async function getRedis(): Promise<RedisClientType | null> {
  if (client) return client;

  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set — using in-memory store (dev only, not for production)');
    usingMemory = true;
    return null;
  }

  try {
    client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
      },
    });

    client.on('error', (err) => {
      console.error('[Redis] Client error:', err);
    });

    await client.connect();
    console.log('[Redis] Connected successfully');
    return client;
  } catch (err) {
    console.error('[Redis] Failed to connect, falling back to memory:', err);
    client = null;
    usingMemory = true;
    return null;
  }
}

export async function setWithTTL(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (usingMemory || !client) {
    cleanupMemory();
    memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }

  const c = await getRedis();
  if (c) {
    await c.setEx(key, ttlSeconds, value);
  } else {
    // fallback if connection lost
    cleanupMemory();
    memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export async function getValue(key: string): Promise<string | null> {
  if (usingMemory || !client) {
    cleanupMemory();
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  const c = await getRedis();
  if (c) {
    return await c.get(key);
  }
  return null;
}

export async function delKey(key: string): Promise<void> {
  if (usingMemory || !client) {
    memoryStore.delete(key);
    return;
  }
  const c = await getRedis();
  if (c) await c.del(key);
}
