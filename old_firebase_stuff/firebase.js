import { initializeApp, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
let auth;
let db;
let storage;

if (typeof window !== "undefined") {
  // We're on the client side
  try {
    // Configure auth with better network handling
    auth = getAuth(app);
    auth.useDeviceLanguage(); // Use the device's language for auth UI
    
    // Set network timeout for better handling of network issues
    const firebaseConfig = getApp().options;
    if (!firebaseConfig.authDomain) {
      console.warn('Firebase authDomain is missing. This may cause authentication issues.');
    }
    
    // Initialize Firestore with settings for better network resilience
    db = getFirestore(app);
    
    // Initialize Storage
    storage = getStorage(app);
    
    // Log successful initialization
    console.log('Firebase core services initialized successfully');
    
    // Initialize analytics only on client side
    import("firebase/analytics").then(({ getAnalytics }) => {
      getAnalytics(app);
    }).catch(err => {
      console.error("Analytics failed to load:", err);
    });
    
    // Load App Check (will be imported only on client-side)
    import('./appCheck').then(({ initializeAppCheckForClient }) => {
      initializeAppCheckForClient();
    }).catch(err => {
      console.error("App Check failed to load:", err);
    });
  } catch (error) {
    console.error("Error initializing Firebase services:", error);
  }
} else {
  // We're on the server side
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage, app };
export default app;