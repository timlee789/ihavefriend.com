/**
 * Service Worker for SayAndKeep (sayandkeep.com) PWA
 * 
 * Handles:
 * 1. Static asset caching (app shell)
 * 2. Offline fallback
 * 3. Push notifications (reminders from Emma)
 */

const CACHE_NAME = 'emma-v4';

// Core app shell files to cache
const APP_SHELL = [
  '/',
  '/friends',
  '/chat',
  '/offline',
  '/icons/emma-192.png',
  '/icons/emma-512.png',
];

// ============================================================
// Install — Cache app shell
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// ============================================================
// Activate — Clean old caches
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ============================================================
// Fetch — Network first, cache fallback
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip blob: and data: URLs (created in main thread, not fetchable by SW)
  if (request.url.startsWith('blob:') || request.url.startsWith('data:')) return;

  // Skip non-http(s) schemes (chrome-extension://, data:, blob:, etc.)
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) return;

  // Skip cross-origin requests (e.g. CDN, unpkg.com) — let browser handle them directly
  try {
    const reqUrl = new URL(request.url);
    if (reqUrl.origin !== self.location.origin) return;
  } catch { return; }

  // Skip API calls and WebSocket (Gemini Live)
  if (request.url.includes('/api/') ||
      request.url.includes('generativelanguage.googleapis.com') ||
      request.url.includes('wss://')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // If requesting a page, show offline page
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/offline');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ============================================================
// Push Notifications — Emma's reminders
// ============================================================
self.addEventListener('push', (event) => {
  let data = { title: 'Emma', body: 'Emma has something to tell you!' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/emma-192.png',
    badge: '/icons/emma-badge-72.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'emma-reminder',
    renotify: true,
    data: {
      url: data.url || '/chat',
      type: data.type || 'reminder',
    },
    actions: [
      { action: 'open', title: 'Talk to Emma' },
      { action: 'dismiss', title: 'Later' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Emma', options)
  );
});

// ============================================================
// Notification Click — Open chat
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if open
        for (const client of windowClients) {
          if (client.url.includes('sayandkeep.com') && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window
        return clients.openWindow(url);
      })
  );
});
