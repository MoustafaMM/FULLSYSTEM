import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** TEST MODE: everything runs on the local Firebase Emulator Suite (no billing, no real data). */
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
export const EMULATOR_HOST = '127.0.0.1';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/** (default) database — pipeline, tracker, admission, QC, chatbot */
export const db = getFirestore(app);

if (useEmulators) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  console.info('[Express Tracker] TEST MODE — using local Firebase emulators');
}
