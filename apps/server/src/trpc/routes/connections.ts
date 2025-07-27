import { createRateLimiterMiddleware, privateProcedure, publicProcedure, router } from '../trpc';
import { getActiveConnection, getZeroDB } from '../../lib/server-utils';
import { Ratelimit } from '@upstash/ratelimit';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { loadImapCredentials } from '../../lib/imap-credential-loader';
import { getWorkersFirestore } from '../../lib/firestore-client';

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

      // ---- Firestore fallback using Workers-compatible client ----
      console.log('[CONNECTIONS] Attempting Firestore fallback for user', sessionUser.id);
      try {
        const firestore = getWorkersFirestore();
        console.log('[CONNECTIONS] Workers-compatible Firestore client created');

        // Step 1: Find personnel document by userId (session user ID)
        console.log('[CONNECTIONS] Step 1: Finding personnel document for userId', sessionUser.id);
        const personnelDocs = await firestore.queryCollection('personnel', [
          { field: 'userId', op: '==', value: sessionUser.id }
        ]);
        
        console.log('[CONNECTIONS] Found', personnelDocs.length, 'personnel documents');
        
        if (personnelDocs.length === 0) {
          console.log('[CONNECTIONS] No personnel document found for user_id', sessionUser.id);
          return { connections: [], disconnectedIds: [] };
        }
        
        const personnelDoc = personnelDocs[0];
        const personnelId = personnelDoc.id;
        console.log('[CONNECTIONS] Using personnel document ID:', personnelId, 'for user_id:', sessionUser.id);

        // Step 2: Find email assignments using personnel document ID
        console.log('[CONNECTIONS] Step 2: Finding email assignments for personnel_id', personnelId);
        const assignments = await firestore.queryCollection('email_assignments', [
          { field: 'personnel_id', op: '==', value: personnelId },
          { field: 'status', op: '==', value: 'active' }
        ]);

        console.log('[CONNECTIONS] Assignment query returned', assignments.length, 'documents');
        assignments.forEach(assignment => console.log('[CONNECTIONS] assignment doc', assignment.id, assignment.data));
        
        if (assignments.length === 0) {
          console.log('[CONNECTIONS] No email assignments found for personnel_id', personnelId);
          return { connections: [], disconnectedIds: [] };
        }

        const connections = await Promise.all(
          assignments.map(async (assignment) => {
            console.log('[CONNECTIONS] Processing assignment', assignment.id, 'for account', assignment.data.email_account_id);
            try {
              const accountDoc = await firestore.getDocument(`email_accounts/${assignment.data.email_account_id}`);
              console.log('[CONNECTIONS] Account doc exists:', accountDoc?.exists, 'id:', assignment.data.email_account_id);
              
              if (!accountDoc?.exists || !accountDoc.data) return null;
              
              const accountData = accountDoc.data;
              console.log('[CONNECTIONS] Account data:', accountData);
              
              return {
                id: accountDoc.id,
                email: accountData.email_address ?? '',
                name: accountData.display_name ?? '',
                picture: '',
                createdAt: new Date(accountData.createdAt ?? Date.now()),
                providerId: 'imap' as const,
              };
            } catch (docError) {
              console.error('[CONNECTIONS] Error processing assignment', assignment.id, ':', docError);
              return null;
            }
          }),
        );

        const validConnections = connections.filter(Boolean);
        console.log('[CONNECTIONS] Returning', validConnections.length, 'IMAP connections');

        return { connections: validConnections, disconnectedIds: [] };
      } catch (error) {
        console.error('[CONNECTIONS] Firestore fallback failed with error:', error);
        console.error('[CONNECTIONS] Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: (error as any)?.code,
          stack: error instanceof Error ? error.stack : undefined
        });
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
