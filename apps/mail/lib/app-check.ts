import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase';

// Extend global self to include Firebase App Check debug token
declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | undefined;
}

/**
 * Initialize Firebase App Check with ReCAPTCHA Enterprise (browser-only).
 * Safe to call multiple times – will noop after first init.
 */
export function initializeAppCheckForClient() {
  if (typeof window === 'undefined') return; // SSR / Workers – skip
  
  console.log('Starting App Check initialization...');
  
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore – global token for dev mode
  if (process.env.NODE_ENV === 'development') {
    const debugToken = import.meta.env.VITE_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
    console.log('App Check debug token:', debugToken);
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  try {
    const siteKey = import.meta.env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
    console.log('reCAPTCHA site key:', siteKey ? 'Key exists' : 'Key missing');
    
    if (!siteKey) {
      console.warn('[AppCheck] Missing VITE_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY');
      return;
    }

    console.log('Initializing Firebase App Check with ReCAPTCHA Enterprise...');
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    console.log('Firebase App Check initialized successfully');
  } catch (err) {
    console.error('[AppCheck] init failed', err);
  }
} 