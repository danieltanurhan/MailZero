import { getActiveConnection, getZeroDB } from '../lib/server-utils';
import { Ratelimit, type RatelimitConfig } from '@upstash/ratelimit';
import type { HonoContext, HonoVariables } from '../ctx';
import { getConnInfo } from 'hono/cloudflare-workers';
import { initTRPC, TRPCError } from '@trpc/server';

import { redis } from '../lib/services';
import type { Context } from 'hono';
import superjson from 'superjson';

type TrpcContext = {
  c: Context<HonoContext>;
} & HonoVariables;

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const privateProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.sessionUser) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }

  return next({ ctx: { ...ctx, sessionUser: ctx.sessionUser } });
});

export const activeConnectionProcedure = privateProcedure.use(async ({ ctx, next }) => {
  try {
    const activeConnection = await getActiveConnection();
    return next({ ctx: { ...ctx, activeConnection } });
  } catch (err) {
    // If session is invalid/expired, sign the user out; otherwise just propagate the error
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg === 'Session Not Found' && ctx.c.var.auth) {
      // Don't auto sign-out - let Firebase Auth handle session management
      console.warn('Session not found, but not triggering signOut');
    }

    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: errMsg || 'Failed to get active connection',
    });
  }
});

export const activeDriverProcedure = activeConnectionProcedure.use(async ({ ctx, next }) => {
  const { activeConnection, sessionUser } = ctx;
  const res = await next({ ctx: { ...ctx } });

  // This is for when the user has not granted the required scopes for GMail
  if (!res.ok && res.error.message === 'Precondition check failed.') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Required scopes missing',
      cause: res.error,
    });
  }

  if (!res.ok && res.error.message === 'invalid_grant') {
    // Remove the access token and refresh token
    const db = getZeroDB(sessionUser.id);
    await db.updateConnection(activeConnection.id, {
      accessToken: null,
      refreshToken: null,
    });

    ctx.c.header(
      'X-Zero-Redirect',
      `/settings/connections?disconnectedConnectionId=${activeConnection.id}`,
    );

    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Connection expired. Please reconnect.',
      cause: res.error,
    });
  }

  return res;
});

export const createRateLimiterMiddleware = (config: {
  limiter: RatelimitConfig['limiter'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generatePrefix: (ctx: TrpcContext, input: any) => string;
}) =>
  t.middleware(async ({ next, ctx, input }) => {
    const ratelimiter = new Ratelimit({
      redis: redis(),
      limiter: config.limiter,
      analytics: true,
      prefix: config.generatePrefix(ctx, input),
    });
    const finalIp = getConnInfo(ctx.c).remote.address ?? 'no-ip';
    const { success, limit, reset, remaining } = await ratelimiter.limit(finalIp);

    ctx.c.res.headers.append('X-RateLimit-Limit', limit.toString());
    ctx.c.res.headers.append('X-RateLimit-Remaining', remaining.toString());
    ctx.c.res.headers.append('X-RateLimit-Reset', reset.toString());

    if (!success) {
      console.log(`Rate limit exceeded for IP ${finalIp}.`);
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
      });
    }

    return next();
  });
