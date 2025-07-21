import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface FirebaseUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Verify a Firebase ID token using manual JWT verification with Firebase's public JWKS.
 * This approach works in Cloudflare Workers unlike the Admin SDK.
 * Returns a minimal user object or null if verification fails / no token.
 */
export async function verifyFirebaseTokenFromHeaders(
  headers: Headers,
): Promise<FirebaseUser | null> {
  console.log('Starting Firebase token verification...');
  
  // Check for App Check token (optional but recommended)
  const appCheckToken = headers.get('X-Firebase-AppCheck');
  if (appCheckToken) {
    console.log('App Check token found:', appCheckToken.substring(0, 20) + '...');
  } else {
    console.log('No App Check token found in X-Firebase-AppCheck header');
  }
  
  // Check environment variables
  const projectId = (env as any).FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.warn('Firebase project ID not configured');
    return null;
  }

  // Expect header in form: "Bearer <ID_TOKEN>"
  const authHeader = headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('No Bearer token found in Authorization header');
    return null;
  }
  
  const token = authHeader.slice('Bearer '.length);
  console.log('Found Bearer token:', token.substring(0, 20) + '...');

  try {
    // Use Firebase's public JWKS endpoint for token verification
    console.log('Attempting to verify token with Firebase JWKS...');
     
    // Firebase's public JWKS endpoint
    const jwksUrl = `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));
     
    // Verify the JWT token
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    
    console.log('Firebase token verified successfully for user:', payload.sub);
    
    return {
      id: payload.sub || '',
      email: payload.email as string || '',
      name: payload.name as string,
      picture: payload.picture as string,
    };
  } catch (error) {
    console.error('Firebase JWT token verification failed:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      tokenPrefix: token.substring(0, 50) + '...',
      projectId,
    });
    return null;
  }
} 