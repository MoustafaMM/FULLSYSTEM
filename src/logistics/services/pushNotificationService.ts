import { getToken, onMessage, type MessagePayload } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getAppMessaging } from '../config/firebase';

const STORAGE_TOKEN_KEY = 'pioneer_current_fcm_token';
const PROMPT_DISMISSED_KEY_PREFIX = 'pioneer_push_prompt_dismissed_';

/**
 * Checks if the browser environment supports Web Push notifications
 */
export const isPushNotificationSupported = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
};

/**
 * Detects if the current client is on iOS (iPhone / iPad)
 */
export const isIOSDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

/**
 * Detects if the web app is running in Standalone (Home Screen PWA) mode
 */
export const isStandaloneApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = 'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true;
  return isStandaloneDisplay || isNavigatorStandalone;
};

/**
 * Returns the current notification permission state
 */
export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (!isPushNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Check if the user previously clicked "Later" or dismissed the login prompt
 */
export const hasUserDismissedPrompt = (userId: string): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${PROMPT_DISMISSED_KEY_PREFIX}${userId}`) === 'true';
};

/**
 * Save user dismissal to prevent prompting repeatedly on every refresh
 */
export const setPromptDismissed = (userId: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${PROMPT_DISMISSED_KEY_PREFIX}${userId}`, 'true');
};

/**
 * Clears dismissal flag so prompt can be shown again (e.g. from settings)
 */
export const clearPromptDismissed = (userId: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(`${PROMPT_DISMISSED_KEY_PREFIX}${userId}`);
};

/**
 * Request notification permission, register service worker, and retrieve FCM device token
 */
export const requestPushPermissionAndSubscribe = async (
  userId: string,
  vapidKeyOverride?: string
): Promise<{ success: boolean; token?: string; error?: string }> => {
  if (!isPushNotificationSupported()) {
    return { success: false, error: 'Push notifications are not supported by this browser.' };
  }

  // On iOS, notifications require the app to be saved to Home Screen
  if (isIOSDevice() && !isStandaloneApp()) {
    return {
      success: false,
      error: 'On iPhone/iPad, please tap Share and choose "Add to Home Screen" first to enable notifications.'
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied.' };
    }

    let registration: ServiceWorkerRegistration | undefined;
    try {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/firebase-cloud-messaging-push-scope'
      });

      // If installing or waiting, wait briefly for activation
      const pendingWorker = registration.installing || registration.waiting;
      if (pendingWorker && pendingWorker.state !== 'activated') {
        await new Promise<void>((resolve) => {
          const stateChangeHandler = () => {
            if (pendingWorker.state === 'activated') {
              pendingWorker.removeEventListener('statechange', stateChangeHandler);
              resolve();
            }
          };
          pendingWorker.addEventListener('statechange', stateChangeHandler);
          setTimeout(resolve, 2000);
        });
      }
    } catch (swErr) {
      console.warn('[Push Notification Service] Direct SW registration notice:', swErr);
    }

    const messaging = await getAppMessaging();
    if (!messaging) {
      return { success: false, error: 'Firebase Cloud Messaging failed to initialize.' };
    }

    // Determine VAPID Key (from environment or parameter or project default)
    const DEFAULT_VAPID_KEY = ''; // set VITE_FIREBASE_VAPID_KEY (Firebase console → Cloud Messaging → Web Push certificates)
    const vapidKey = vapidKeyOverride || import.meta.env.VITE_FIREBASE_VAPID_KEY || DEFAULT_VAPID_KEY;

    let token = '';
    try {
      token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration?.active ? registration : undefined
      });
    } catch (tokenErr) {
      console.warn('[Push Notification Service] Direct getToken retry without custom SW:', tokenErr);
      token = await getToken(messaging, {
        vapidKey
      });
    }

    if (!token) {
      return { success: false, error: 'Failed to generate FCM registration token.' };
    }

    // Store in Firestore user document
    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(token)
    });

    // Store active token locally for session reference / logout cleanup
    localStorage.setItem(STORAGE_TOKEN_KEY, token);

    return { success: true, token };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown push subscription error';
    console.error('[Push Notification Service] Subscription failed:', err);
    return { success: false, error: message };
  }
};

/**
 * Unsubscribe and remove the current device token from Firestore on logout
 */
export const unsubscribePush = async (userId: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  const currentToken = localStorage.getItem(STORAGE_TOKEN_KEY);
  if (!currentToken) return;

  try {
    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayRemove(currentToken)
    });
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  } catch (err) {
    console.warn('[Push Notification Service] Error removing token on logout:', err);
  }
};

/**
 * Listen for messages received while the application is active in the foreground
 */
export const listenToForegroundMessages = async (
  onPayload: (payload: MessagePayload) => void
): Promise<(() => void) | null> => {
  const messaging = await getAppMessaging();
  if (!messaging) return null;

  return onMessage(messaging, (payload) => {
    console.log('[Push Notification Service] Received foreground message:', payload);
    onPayload(payload);
  });
};
