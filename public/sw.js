const CACHE_NAME = 'ftrack-mobile-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
];

// Install: precache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Push notification received
self.addEventListener('push', (e) => {
  let data = { title: 'ftrack', body: 'Status changed' };
  try {
    data = e.data.json();
  } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon.svg',
      badge: data.badge || '/icons/icon.svg',
      data: data.data || {},
      vibrate: [200, 100, 200],
      tag: 'ftrack-status-change',
      renotify: true,
    })
  );
});

// Notification click — open the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache API calls or ftrack requests
  if (url.pathname.startsWith('/api/') || url.hostname.includes('ftrackapp')) {
    return;
  }

  // For navigation and app assets: try network first, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache successful responses
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/')))
  );
});
