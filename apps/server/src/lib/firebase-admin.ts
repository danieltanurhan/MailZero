import { cert } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { env } from 'cloudflare:workers';

export const buildFirebaseCredential = () => {
  console.log('[FIREBASE-DEBUG] Environment keys available:', Object.keys(env as any).filter(k => k.includes('FIREBASE')));
  
  const json = (env as any).FIREBASE_SERVICE_ACCOUNT_JSON as string | undefined;
  console.log('[FIREBASE-DEBUG] JSON credential present:', !!json, json ? `length: ${json.length}` : 'not found');
  if (json) {
    console.log('[FIREBASE] Using service account JSON credential');
    try {
      // Handle double-escaped JSON from environment
      let cleanJson = json;
      if (json.startsWith('{\\"') || json.includes('\\n')) {
        console.log('[FIREBASE-DEBUG] Detected escaped JSON, cleaning...');
        cleanJson = json.replace(/\\"/g, '"').replace(/\\n/g, '\n');
      }
      
      // Handle literal newlines in JSON (need to escape them for valid JSON)
      if (cleanJson.includes('\n') && !cleanJson.includes('\\n')) {
        console.log('[FIREBASE-DEBUG] Detected literal newlines, escaping for JSON...');
        cleanJson = cleanJson.replace(/\n/g, '\\n');
      }
      
      const parsed = JSON.parse(cleanJson) as ServiceAccount;
      console.log('[FIREBASE-DEBUG] JSON parsed successfully, projectId:', parsed.projectId);
      return cert(parsed);
    } catch (error) {
      console.error('[FIREBASE-DEBUG] JSON parse failed:', error);
      console.error('[FIREBASE-DEBUG] Raw JSON (first 200 chars):', json.substring(0, 200));
      throw error;
    }
  }

  const projectId = (env as any).FIREBASE_PROJECT_ID as string | undefined;
  const clientEmail = (env as any).FIREBASE_CLIENT_EMAIL as string | undefined;
  let privateKey = (env as any).FIREBASE_PRIVATE_KEY as string | undefined;

  console.log('[FIREBASE] Checking individual credential vars:', { 
    hasProjectId: !!projectId, 
    hasClientEmail: !!clientEmail, 
    hasPrivateKey: !!privateKey 
  });
  
  if (projectId) console.log('[FIREBASE-DEBUG] Project ID:', projectId);
  if (clientEmail) console.log('[FIREBASE-DEBUG] Client email:', clientEmail);
  if (privateKey) console.log('[FIREBASE-DEBUG] Private key length:', privateKey.length, 'starts with:', privateKey.substring(0, 50));

  if (projectId && clientEmail && privateKey) {
    // Replace escaped newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log('[FIREBASE] Using individual credential variables');
    try {
      const credential = cert({ projectId, clientEmail, privateKey });
      console.log('[FIREBASE-DEBUG] Individual credential cert created successfully');
      return credential;
    } catch (error) {
      console.error('[FIREBASE-DEBUG] Individual credential cert failed:', error);
      throw error;
    }
  }

  console.error('[FIREBASE] No valid Firebase credentials found in environment');
  throw new Error('Firebase Admin credential not found in env');
}; 