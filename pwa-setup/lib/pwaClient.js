/**
 * PWA Client Setup for ihavefriend.com
 * 
 * Add this to your main layout or _app component.
 * Handles: SW registration, push subscription, install prompt.
 */

// ============================================================
// Register Service Worker
// ============================================================
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('SW registration failed:', error);
    return null;
  }
}

// ============================================================
// Request Push Notification Permission
// ============================================================
export async function requestPushPermission(userId) {
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return false;
  }

  // Ask permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('Push permission denied');
    return false;
  }

  // Get push subscription
  const registration = await navigator.serviceWorker.ready;
  
  let subscription = await registration.pushManager.getSubscription();
  
  if (!subscription) {
    // Create new subscription
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      ),
    });
  }

  // Send subscription to server
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      subscription: subscription.toJSON(),
    }),
  });

  console.log('Push subscription saved');
  return true;
}

// ============================================================
// Install Prompt (Add to Home Screen)
// ============================================================
let deferredPrompt = null;

export function setupInstallPrompt(onPromptReady) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (onPromptReady) onPromptReady();
  });
}

export async function showInstallPrompt() {
  if (!deferredPrompt) return false;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;

  return outcome === 'accepted';
}

export function isAppInstalled() {
  // Check if running as standalone PWA
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

// ============================================================
// Helper: Convert VAPID key
// ============================================================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
