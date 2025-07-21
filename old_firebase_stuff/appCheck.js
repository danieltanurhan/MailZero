'use client';

import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase';

/**
 * Initialize Firebase App Check with ReCAPTCHA Enterprise
 * Note: For development, set debugging to true in console before loading app
 * In production, this will validate that requests come from your legitimate app
 */
export function initializeAppCheckForClient() {
  if (typeof window !== 'undefined') {
    // For development only: Register debug token provider
    if (process.env.NODE_ENV === 'development') {
      // @ts-ignore
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
    }

    try {
      // Get the reCAPTCHA site key
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
      
      // Log for debugging (remove in production)
      console.log('reCAPTCHA site key:', siteKey ? 'Key exists' : 'Key missing');
      
      if (!siteKey) {
        console.error('Missing reCAPTCHA Enterprise site key');
        return;
      }
      
      // Initialize App Check
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true
      });
      console.log('Firebase App Check initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase App Check:', error);
    }
  }
}

// Export default as a function to be called from client components
export default initializeAppCheckForClient;