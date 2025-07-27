import type { ManagerConfig } from './driver/types';
import { getWorkersFirestore } from './firestore-client';
import { decryptStoredPassword, testDecryption } from './encryption';

export interface ImapCredentialConfig extends ManagerConfig {
  serverConfig: { host: string; port: number; tls: boolean };
}

export async function loadImapCredentials(
  emailAccountId: string,
  personnelId: string,
): Promise<ImapCredentialConfig | null> {
  const firestore = getWorkersFirestore();

  // Verify assignment exists and active
  const assignments = await firestore.queryCollection('email_assignments', [
    { field: 'email_account_id', op: '==', value: emailAccountId },
    { field: 'personnel_id', op: '==', value: personnelId },
    { field: 'status', op: '==', value: 'active' }
  ]);

  if (assignments.length === 0) return null;

  const accountDoc = await firestore.getDocument(`email_accounts/${emailAccountId}`);
  if (!accountDoc?.exists || !accountDoc.data) return null;

  const data = accountDoc.data;

  console.log('[IMAP-CREDS] Raw account data:', {
    email: data.email_address,
    hasImapPassword: !!data.imap_password,
    imapPasswordLength: data.imap_password?.length,
    imapPasswordFormat: data.imap_password?.includes(':') ? 'contains_colon' : 'single_value',
    server: data.server_config?.imap_server,
    port: data.server_config?.imap_port
  });

  // Decrypt the password using our decryption utility
  const decryptedPassword = await decryptStoredPassword(data.imap_password);
  
  console.log('[IMAP-CREDS] Decrypted password length:', decryptedPassword.length);
  console.log('[IMAP-CREDS] Decrypted password preview:', decryptedPassword.substring(0, 3) + '...');

  const host: string = data.server_config.imap_server;
  const port: number = Number(data.server_config.imap_port ?? 993);
  const tls: boolean = (data.encryption ?? '').toUpperCase() !== 'NONE';

  const email: string = data.email_address;

  // Create base64 encoded "user:pass" for the current system
  const userPassString = `${email}:${decryptedPassword}`;
  const base64Credentials = Buffer.from(userPassString, 'utf-8').toString('base64');

  console.log('[IMAP-CREDS] Final credentials format:', {
    email,
    passwordLength: decryptedPassword.length,
    base64Length: base64Credentials.length,
    serverConfig: { host, port, tls }
  });

  return {
    serverConfig: { host, port, tls },
    auth: {
      userId: personnelId,
      accessToken: base64Credentials, // This is what decodeUserPass expects
      refreshToken: '',
      email,
    },
  };
} 