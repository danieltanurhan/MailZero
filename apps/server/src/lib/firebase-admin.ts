import { cert } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { env } from 'cloudflare:workers';

export const buildFirebaseCredential = () => {
  console.log('[FIREBASE-DEBUG] Environment keys available:', Object.keys(env as any).filter(k => k.includes('FIREBASE')));
  
  // Try individual environment variables first (cleaner approach)
  const projectId = (env as any).FIREBASE_PROJECT_ID as string | undefined;
  const clientEmail = (env as any).FIREBASE_CLIENT_EMAIL as string | undefined;
  let privateKey = (env as any).FIREBASE_PRIVATE_KEY as string | undefined;

  console.log('[FIREBASE] Checking individual credential vars:', { 
    hasProjectId: !!projectId, 
    hasClientEmail: !!clientEmail, 
    hasPrivateKey: !!privateKey 
  });
  
  if (projectId && clientEmail && privateKey) {
    // Replace escaped newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log('[FIREBASE] Using individual credential variables');
    console.log('[FIREBASE-DEBUG] Project ID:', projectId);
    console.log('[FIREBASE-DEBUG] Client email:', clientEmail);
    console.log('[FIREBASE-DEBUG] Private key length:', privateKey.length, 'starts with:', privateKey.substring(0, 50));
    try {
      const credential = cert({ projectId, clientEmail, privateKey });
      console.log('[FIREBASE-DEBUG] Individual credential cert created successfully');
      return credential;
    } catch (error) {
      console.error('[FIREBASE-DEBUG] Individual credential cert failed:', error);
      console.log('[FIREBASE-DEBUG] Falling back to JSON credential...');
    }
  }

  // Fallback to JSON credential if individual vars failed or are missing
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
      
      console.log('[FIREBASE-DEBUG] Cleaned JSON string:', cleanJson);

      const rawParsed = JSON.parse(cleanJson) as any;

      // firebase-admin's cert() historically looks for snake_case fields
      // (client_email, private_key, etc.). To be completely safe, we include
      // BOTH snake_case and camelCase versions when we re-shape the object.
      // This way, regardless of which variant the SDK is after, the property
      // will be present and we avoid the "client_email" missing error.

      // Build the initial object with whatever the JSON already provides.
      const parsed: Record<string, string | undefined> = {
        project_id: rawParsed.project_id ?? rawParsed.projectId,
        projectId: rawParsed.projectId ?? rawParsed.project_id,
        client_email: rawParsed.client_email ?? rawParsed.clientEmail,
        clientEmail: rawParsed.clientEmail ?? rawParsed.client_email,
        private_key: (rawParsed.private_key ?? rawParsed.privateKey)?.replace(/\\n/g, '\n'),
        privateKey: (rawParsed.privateKey ?? rawParsed.private_key)?.replace(/\\n/g, '\n'),
      };

      // ------------------------------------------------------------------
      //  Fallbacks: if any essential field is still missing, attempt to grab
      //  it from the individual FIREBASE_* env vars so that a partially
      //  populated JSON credential + separate env vars still works.
      // ------------------------------------------------------------------
      if (!parsed.client_email && (env as any).FIREBASE_CLIENT_EMAIL) {
        parsed.client_email = (env as any).FIREBASE_CLIENT_EMAIL;
        parsed.clientEmail = (env as any).FIREBASE_CLIENT_EMAIL; // keep both variants in sync
        console.log('[FIREBASE-DEBUG] Filled client_email from FIREBASE_CLIENT_EMAIL env');
      }

      if (!parsed.project_id && (env as any).FIREBASE_PROJECT_ID) {
        parsed.project_id = (env as any).FIREBASE_PROJECT_ID;
        parsed.projectId = (env as any).FIREBASE_PROJECT_ID;
        console.log('[FIREBASE-DEBUG] Filled project_id from FIREBASE_PROJECT_ID env');
      }

      if (!parsed.private_key && (env as any).FIREBASE_PRIVATE_KEY) {
        parsed.private_key = (env as any).FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        parsed.privateKey = parsed.private_key;
        console.log('[FIREBASE-DEBUG] Filled private_key from FIREBASE_PRIVATE_KEY env');
      }

      // Final validation before we hand off to firebase-admin
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error('Incomplete Firebase service account: client_email or private_key missing');
      }
 
      console.log('[FIREBASE-DEBUG] Parsed service account:', JSON.stringify(parsed, null, 2));

      console.log('[FIREBASE-DEBUG] JSON parsed successfully, projectId:', parsed.project_id ?? parsed.projectId);
      return cert(parsed as ServiceAccount);
    } catch (error) {
      console.error('[FIREBASE-DEBUG] JSON parse failed:', error);
      console.error('[FIREBASE-DEBUG] Raw JSON (first 200 chars):', json.substring(0, 200));
      throw error;
    }
  }

  console.error('[FIREBASE] No valid Firebase credentials found in environment');
  throw new Error('Firebase Admin credential not found in env');
}; 