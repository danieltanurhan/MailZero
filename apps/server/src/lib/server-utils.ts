import { getContext } from 'hono/context-storage';
import { connection } from '../db/schema';
import type { HonoContext } from '../ctx';
import { env } from 'cloudflare:workers';
import { createDriver } from './driver';

export const getZeroDB = (userId: string) => {
  const stub = env.ZERO_DB.get(env.ZERO_DB.idFromName(userId));
  const rpcTarget = stub.setMetaData(userId);
  return rpcTarget;
};

export const getZeroAgent = async (connectionId: string) => {
  const c = getContext<HonoContext>();
  const { sessionUser } = c.var;
  
  const stub = env.ZERO_AGENT.get(env.ZERO_AGENT.idFromName(connectionId));
  const rpcTarget = await stub.setMetaData(connectionId);
  
  // Pass the session user ID explicitly to setupAuth
  const sessionUserId = sessionUser?.id ?? '';
  await rpcTarget.setupAuth(connectionId, sessionUserId);
  
  return rpcTarget;
};

export const getActiveConnection = async () => {
  const c = getContext<HonoContext>();
  const { sessionUser } = c.var;
  if (!sessionUser) throw new Error('Session Not Found');

  const db = getZeroDB(sessionUser.id);

  const userData = await db.findUser();

  if (userData?.defaultConnectionId) {
    const activeConnection = await db.findUserConnection(userData.defaultConnectionId);
    if (activeConnection) return activeConnection;
  }

  const firstConnection = await db.findFirstConnection();
  if (firstConnection) return firstConnection;

  // No more Firestore fallback - if there are no SQL connections, fail cleanly
  console.log('[DEBUG] No SQL connections found for user:', sessionUser.id);
  throw new Error('No connections found for user');
};

export const connectionToDriver = (activeConnection: typeof connection.$inferSelect) => {
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    throw new Error(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
  }

  return createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken,
      refreshToken: activeConnection.refreshToken,
      email: activeConnection.email,
    },
  });
};

export const verifyToken = async (token: string) => {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to verify token: ${await response.text()}`);
  }

  const data = (await response.json()) as any;
  return !!data;
};
