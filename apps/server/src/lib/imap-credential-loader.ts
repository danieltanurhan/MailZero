import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import type { ManagerConfig } from './driver/types';
import { buildFirebaseCredential } from './firebase-admin';

let firestore: Firestore | undefined;

function getFirestoreClient(): Firestore {
  if (firestore) return firestore;
  if (!getApps().length) {
    initializeApp({
      credential: buildFirebaseCredential(),
    });
  }
  firestore = getFirestore();
  return firestore;
}

export interface ImapCredentialConfig extends ManagerConfig {
  serverConfig: { host: string; port: number; tls: boolean };
}

export async function loadImapCredentials(
  emailAccountId: string,
  personnelId: string,
): Promise<ImapCredentialConfig | null> {
  const db = getFirestoreClient();

  // Verify assignment exists and active
  const assignmentSnap = await db
    .collection('email_assignments')
    .where('email_account_id', '==', emailAccountId)
    .where('personnel_id', '==', personnelId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (assignmentSnap.empty) return null;

  const accountDoc = await db.collection('email_accounts').doc(emailAccountId).get();
  if (!accountDoc.exists) return null;

  const data = accountDoc.data() as any;

  const host: string = data.imap_server;
  const port: number = Number(data.imap_port ?? 993);
  const tls: boolean = (data.encryption ?? '').toUpperCase() !== 'NONE';

  const imapPassword: string = data.imap_password;

  const email: string = data.email_address;

  return {
    serverConfig: { host, port, tls },
    auth: {
      userId: personnelId,
      accessToken: imapPassword, // base64("user:pass") – decoded in driver
      refreshToken: '',
      email,
    },
  };
} 