// Firebase Cloud Messaging Service Worker (served by server/index.ts with the config from env)
// Handles background push notifications when the app is minimized or phone is locked

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(__FIREBASE_CONFIG__);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || 'Pioneer Operations Alert';
  const body = payload.notification?.body || payload.data?.body || '';
  const notifType = payload.data?.type;

  // Suppress delayed notifications completely
  if (
    notifType === 'task_delayed' ||
    notificationTitle === 'Task Delayed' ||
    notificationTitle.toLowerCase().includes('delayed') ||
    body.toLowerCase().includes('delayed') ||
    notificationTitle.includes('متأخر') ||
    body.includes('متأخر')
  ) {
    return Promise.resolve();
  }

  const targetUrl = payload.data?.url || payload.fcmOptions?.link || '/';

  const notificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.data?.notificationId || 'pioneer-alert',
    renotify: true,
    data: {
      url: targetUrl,
      notificationId: payload.data?.notificationId
    },
    vibrate: [200, 100, 200]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open with this app
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(urlToOpen);
          }
          return client.focus();
        }
      }
      // If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
