import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager, waitForPendingWrites } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';
import { app, firebaseConfig, useEmulators, EMULATOR_HOST } from '../../lib/firebase';

export { app, firebaseConfig };

/** Logistics lives in its own named database ("logistics") of the same Firebase project,
 *  with multi-tab offline persistence for field officers. */
export const LOGISTICS_DB_ID = import.meta.env.VITE_LOGISTICS_DB_ID || 'logistics';

export const db = initializeFirestore(
  app,
  // In TEST MODE use memory cache so emulator resets don't leave stale offline data in the browser
  { localCache: useEmulators ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  LOGISTICS_DB_ID,
);

export const waitForFirestoreSync = (): Promise<void> => waitForPendingWrites(db);

export const storage = getStorage(app);

if (useEmulators) {
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
}

let messagingInstance: Messaging | null = null;
export const getAppMessaging = async (): Promise<Messaging | null> => {
  if (typeof window !== 'undefined' && await isSupported()) {
    if (!messagingInstance) messagingInstance = getMessaging(app);
    return messagingInstance;
  }
  return null;
};
