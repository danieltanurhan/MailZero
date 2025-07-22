import { getContext } from 'hono/context-storage';
import { connection } from '../db/schema';
import type { HonoContext } from '../ctx';
import { env } from 'cloudflare:workers';
import { initializeApp, getApps } from 'firebase-admin/app';
import { buildFirebaseCredential } from './firebase-admin';
import { getFirestore as getFs } from 'firebase-admin/firestore';
import { createDriver } from './driver';

export const getZeroDB = (userId: string) => {
  const stub = env.ZERO_DB.get(env.ZERO_DB.idFromName(userId));
  const rpcTarget = stub.setMetaData(userId);
  return rpcTarget;
};

export const getZeroAgent = async (connectionId: string) => {
  const stub = env.ZERO_AGENT.get(env.ZERO_AGENT.idFromName(connectionId));
  const rpcTarget = await stub.setMetaData(connectionId);
  await rpcTarget.setupAuth(connectionId);
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

  console.log('[DEBUG] No SQL connections found, attempting Firestore fallback');

  // Fallback to Firestore IMAP assignments
  try {
    console.log('[DEBUG] Building Firebase credential');
    const firestore = (() => {
      if (!getApps().length) {
        console.log('[DEBUG] Initializing Firebase Admin app');
        initializeApp({ credential: buildFirebaseCredential() });
      }
      return getFs();
    })();

    console.log('[IMAP] trying firestore fallback for', sessionUser.id);

    const assignmentsSnap = await firestore
      .collection('email_assignments')
      .where('personnel_id', '==', sessionUser.id)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    console.log('[IMAP] assignment snapshot size', assignmentsSnap.size);
    console.log('[IMAP] assignment docs', assignmentsSnap.docs.map(d => d.id));

    if (assignmentsSnap.empty) {
      throw new Error('No connections found for user');
    }

    const assignmentData = assignmentsSnap.docs[0].data() as any;
    const emailAccountId: string = assignmentData.email_account_id;

    // Build stub activeConnection object
    const accountDoc = await firestore.collection('email_accounts').doc(emailAccountId).get();
    console.log('[IMAP] email account doc exists?', accountDoc.exists);
    const account = accountDoc.data() as any;
    console.log('[IMAP] account data', account);

    if (!accountDoc.exists) throw new Error('No connections found for user');

    return {
      id: emailAccountId,
      userId: sessionUser.id,
      email: account.email_address,
      name: account.display_name,
      picture: '',
      accessToken: null,
      refreshToken: null,
      scope: '',
      providerId: 'imap',
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as typeof connection.$inferSelect;
  } catch (err) {
    console.error(`No connections found for user ${sessionUser.id}`);
    throw new Error('No connections found for user');
  }
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
