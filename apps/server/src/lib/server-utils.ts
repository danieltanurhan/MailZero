import { getContext } from 'hono/context-storage';
import { connection } from '../db/schema';
import type { HonoContext } from '../ctx';
import { env } from 'cloudflare:workers';
import { createDriver } from './driver';
import { decryptStoredPassword } from './encryption';

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
  
  // For IMAP connections, we now need to pass both connectionId and sessionUserId
  // The setupAuth will determine if it needs SQL or Firestore data
  const sessionUserId = sessionUser?.id ?? '';
  await rpcTarget.setupAuth(connectionId, sessionUserId);
  
  return rpcTarget;
};

export const getActiveConnection = async () => {
  const c = getContext<HonoContext>();
  const { sessionUser } = c.var;
  if (!sessionUser) throw new Error('Session Not Found');

  const db = getZeroDB(sessionUser.id);

  // Check for default connection first
  const userData = await db.findUser();
  if (userData?.defaultConnectionId) {
    const activeConnection = await db.findUserConnection(userData.defaultConnectionId);
    if (activeConnection) {
      // Convert to unified format for both OAuth and IMAP
      return transformConnectionForAPI(activeConnection);
    }
  }

  // Get first available connection
  const firstConnection = await db.findFirstConnection();
  if (firstConnection) {
    return transformConnectionForAPI(firstConnection);
  }

  // No connections found
  console.log('[DEBUG] No SQL connections found for user:', sessionUser.id);
  throw new Error('No connections found for user');
};

// Helper function to transform SQL connection data to API format
function transformConnectionForAPI(sqlConnection: typeof connection.$inferSelect) {
  return {
    id: sqlConnection.id,
    userId: sqlConnection.userId,
    email: sqlConnection.email,
    name: sqlConnection.name || sqlConnection.email,
    picture: sqlConnection.picture || '',
    // For OAuth connections
    accessToken: sqlConnection.accessToken,
    refreshToken: sqlConnection.refreshToken,
    scope: sqlConnection.scope || '',
    providerId: sqlConnection.providerId,
    expiresAt: sqlConnection.expiresAt || new Date(),
    createdAt: sqlConnection.createdAt,
    updatedAt: sqlConnection.updatedAt,
    // For IMAP connections - include server config
    imapConfig: sqlConnection.providerId === 'imap' ? {
      host: sqlConnection.imapHost!,
      port: sqlConnection.imapPort!,
      tls: sqlConnection.imapTls!,
      encryptedPassword: sqlConnection.encryptedPassword!,
      smtpHost: sqlConnection.smtpHost,
      smtpPort: sqlConnection.smtpPort,
      smtpTls: sqlConnection.smtpTls,
    } : undefined,
  };
}

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
