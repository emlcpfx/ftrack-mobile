// Push notification client helpers for iOS PWA

// Replace this with your actual VAPID public key after running:
//   node scripts/generate-vapid-keys.mjs
const VAPID_PUBLIC_KEY = globalThis.__VAPID_PUBLIC_KEY__ || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

export async function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission; // 'default', 'granted', 'denied'
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
}

export async function subscribeToPush() {
  const vapidKey = VAPID_PUBLIC_KEY || localStorage.getItem('vapid_public_key');
  if (!vapidKey) {
    throw new Error('VAPID public key not configured. Run: node scripts/generate-vapid-keys.mjs');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  const registration = await registerServiceWorker();
  if (!registration) throw new Error('Service worker registration failed');

  // Wait for the service worker to be ready
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  // Send subscription to our server
  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'subscribe', subscription: subscription.toJSON() }),
  });

  if (!res.ok) throw new Error('Failed to register push subscription on server');
  return subscription;
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  // Tell server to remove
  await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unsubscribe', subscription: subscription.toJSON() }),
  });

  await subscription.unsubscribe();
}

export async function isSubscribed() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// Store VAPID public key (called from settings UI)
export function setVapidPublicKey(key) {
  localStorage.setItem('vapid_public_key', key);
}
