import { createRateLimiterMiddleware, privateProcedure, publicProcedure, router } from '../trpc';
import { getActiveConnection, getZeroDB } from '../../lib/server-utils';
import { Ratelimit } from '@upstash/ratelimit';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { loadImapCredentials } from '../../lib/imap-credential-loader';
import { buildFirebaseCredential } from '../../lib/firebase-admin';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const connectionsRouter = router({
  list: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(120, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:get-connections-${sessionUser?.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      const { sessionUser } = ctx;
      const db = getZeroDB(sessionUser.id);
      const connections = await db.findManyConnections();

      // if SQL already has rows, keep existing behaviour
      if (connections.length) {
        const disconnectedIds = connections
          .filter((c) => !c.accessToken || !c.refreshToken)
          .map((c) => c.id);

        return {
          connections: connections.map((connection) => {
            return {
              id: connection.id,
              email: connection.email,
              name: connection.name,
              picture: connection.picture,
              createdAt: connection.createdAt,
              providerId: connection.providerId,
            };
          }),
          disconnectedIds,
        };
      }

      // ---- Firestore fallback ----
      console.log('[CONNECTIONS] Attempting Firestore fallback for user', sessionUser.id);
      try {
      if (!getApps().length) initializeApp({ credential: buildFirebaseCredential() });
      const fs = getFirestore();
      console.log('[CONNECTIONS] Firestore client obtained, querying assignments');
      const snap = await fs
          .collection('email_assignments')
          .where('personnel_id', '==', sessionUser.id)
          .where('status', '==', 'active')
          .get();

      console.log('[CONNECTIONS] Assignment query returned', snap.size, 'documents');
      const docs = await Promise.all(
        snap.docs.map(async (a) => {
          console.log('[CONNECTIONS] Processing assignment doc', a.id, 'for account', a.data().email_account_id);
          const acct = await fs.collection('email_accounts').doc(a.data().email_account_id).get();
          if (!acct.exists) return null;
          const d = acct.data() as any;
          if (!d) return null;
          return {
            id: acct.id,
            email: d.email_address ?? '',
            name: d.display_name ?? '',
            picture: '',
            createdAt: new Date(d.createdAt ?? Date.now()),
            providerId: 'imap' as const,
          };
        }),
      );

      const final = docs.filter(Boolean);
      console.log('[CONNECTIONS] Returning', final.length, 'IMAP connections');

      return { connections: final, disconnectedIds: [] };
      } catch (error) {
        console.error('[CONNECTIONS] Firestore fallback failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to load connections from Firestore',
          cause: error,
        });
      }
    }),
  setDefault: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = getZeroDB(user.id);
      const foundConnection = await db.findUserConnection(connectionId);
      if (!foundConnection) throw new TRPCError({ code: 'NOT_FOUND' });
      await db.updateUser({ defaultConnectionId: connectionId });
    }),
  delete: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = getZeroDB(user.id);
      await db.deleteConnection(connectionId);

      const activeConnection = await getActiveConnection();
      if (connectionId === activeConnection.id) await db.updateUser({ defaultConnectionId: null });
    }),
  getDefault: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.sessionUser) return null;
    const connection = await getActiveConnection();
    return {
      id: connection.id,
      email: connection.email,
      name: connection.name,
      picture: connection.picture,
      createdAt: connection.createdAt,
      providerId: connection.providerId,
    };
  }),
});
