import { auth } from './firebase';
import { app } from './firebase';
// @ts-ignore
// eslint-disable-next-line import/no-unresolved
import { onIdTokenChanged, type User } from 'firebase/auth';

async function getIdToken(): Promise<string | null> {
  const current = auth.currentUser;
  if (current) return await current.getIdToken();

  return new Promise((resolve) => {
    const unsub = onIdTokenChanged(auth, async (user: User | null) => {
      unsub();
      if (user) resolve(await user.getIdToken());
      else resolve(null);
    });
  });
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const idToken = await getIdToken();
  
  const headers = new Headers(init.headers || {});
  
  // Add Firebase ID token
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
    console.log('Added Firebase ID token to request');
  } else {
    console.warn('No Firebase ID token available');
  }
  
  return fetch(input, { ...init, headers, credentials: 'include' });
} 
