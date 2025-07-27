import { env } from 'cloudflare:workers';
import { Redis } from '@upstash/redis';
import { Resend } from 'resend';
import IORedis from 'ioredis';

export const resend = () =>
  env.RESEND_API_KEY
    ? new Resend(env.RESEND_API_KEY)
    : { emails: { send: async (...args: unknown[]) => console.log(args) } };

// Local Redis adapter that mimics the subset of the Upstash `Redis` client
// that our codebase (and @upstash/ratelimit) relies on. This lets us run
// against a standard TCP Redis instance in development or on self-hosted
// servers.
class LocalRedisAdapter {
  private client: IORedis;

  constructor(url?: string) {
    // If a non-HTTPS REDIS_URL is provided (e.g. redis://host:port), use it.
    // Otherwise fall back to the default localhost:6379.
    this.client = url ? new IORedis(url) : new IORedis();
  }

  /* -------------------------------------------------- */
  /* Basic KV helpers used by our auth/session cache     */
  /* -------------------------------------------------- */
  async get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, opts?: { ex?: number }) {
    if (opts?.ex) return this.client.set(key, value, 'EX', opts.ex);
    return this.client.set(key, value);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  /* -------------------------------------------------- */
  /*  Lua script helpers required by @upstash/ratelimit  */
  /* -------------------------------------------------- */
  async evalsha(sha: string, keys: string[], args: (string | number)[]) {
    return this.client.evalsha(sha, keys.length, ...keys, ...args);
  }

  async scriptLoad(script: string) {
    // Returns the SHA1 hash of the script, matching Upstash behaviour
    return this.client.script('LOAD', script) as unknown as string;
  }

  /* -------------------------------------------------- */
  /*  Additional commands used by @upstash/ratelimit    */
  /* -------------------------------------------------- */
  async zincrby(key: string, increment: number, member: string) {
    return this.client.zincrby(key, increment, member);
  }

  async expire(key: string, seconds: number) {
    return this.client.expire(key, seconds);
  }
}

// Export a Redis client that works in both production (Upstash) and
// development/self-hosted environments. If REDIS_URL starts with "https"
// we assume it is an Upstash REST endpoint and require a token. Otherwise
// we fall back to a plain TCP Redis connection using `ioredis`.
export const redis = () => {
  const raw = typeof env.REDIS_URL === 'string' ? env.REDIS_URL.trim() : '';
  console.log('[REDIS-DEBUG] Raw REDIS_URL:', JSON.stringify(raw));

  const isUpstashEndpoint = raw.startsWith('https://');
  if (isUpstashEndpoint) {
    return new Redis({ url: raw, token: env.REDIS_TOKEN });
  }

  // Treat blank strings, a single slash, or protocol-only strings like
  // "redis://" or "rediss://" as "not set". These values cause ioredis to
  // attempt a Unix socket connection at path "/", which results in the
  // "The argument 'path' is not supported. Received '/'" error we keep seeing
  // in development.
  let isValidTcpUrl = false;
  if (raw && raw !== '/') {
    try {
      const url = new URL(raw);
      const allowedProtocols = ['redis:', 'rediss:'];
      isValidTcpUrl = allowedProtocols.includes(url.protocol) && Boolean(url.hostname);
    } catch (_) {
      isValidTcpUrl = false; // Malformed URL
    }
  }

  console.log('[REDIS-DEBUG] isValidTcpUrl:', isValidTcpUrl);

  // For local/self-hosted instances you can optionally supply REDIS_URL like
  // "redis://localhost:6379". If not provided we default to 127.0.0.1:6379.
  return new LocalRedisAdapter(isValidTcpUrl ? raw : undefined) as unknown as Redis;
};

export const twilio = () => {
  //   if (env.NODE_ENV === 'development' && !forceUseRealService) {
  //     return {
  //       messages: {
  //         send: async (to: string, body: string) =>
  //           console.log(`[TWILIO:MOCK] Sending message to ${to}: ${body}`),
  //       },
  //     };
  //   }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    throw new Error('Twilio is not configured correctly');
  }

  const send = async (to: string, body: string) => {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        },
        body: new URLSearchParams({
          To: to,
          From: env.TWILIO_PHONE_NUMBER,
          Body: body,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send OTP: ${error}`);
    }
  };

  return {
    messages: {
      send,
    },
  };
};
