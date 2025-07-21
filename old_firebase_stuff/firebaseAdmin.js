/**
 * Firebase Admin SDK initialization
 * This file should only be imported from server-side code (API routes, server components)
 * NEVER import this in client components
 */

import * as admin from 'firebase-admin';

// Use a singleton pattern to prevent multiple initializations
let firebaseAdmin;

function getFirebaseAdmin() {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  // Check if app is already initialized to prevent multiple initializations
  if (!admin.apps.length) {
    // Get credentials from environment variables
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    const credentials = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    };

    // Initialize the app with credentials
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }

  firebaseAdmin = admin;
  return firebaseAdmin;
}

// Export the admin instance and commonly used services
export const adminAuth = () => getFirebaseAdmin().auth();
export const adminFirestore = () => getFirebaseAdmin().firestore();
export const adminStorage = () => getFirebaseAdmin().storage();

export default getFirebaseAdmin;
