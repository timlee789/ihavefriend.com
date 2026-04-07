# PWA Integration Guide for Claude Code

## What This Does
Converts ihavefriend.com from a regular website into a Progressive Web App.
After this, users can:
- Add Emma to their phone's home screen (like a native app)
- Receive push notifications (medication reminders, appointments, check-ins)
- Use the app offline (basic UI cached)
- Open in full-screen mode (no browser bar)

## Files to Add

### 1. manifest.json → public/manifest.json
The app identity file. Defines name, icons, colors, start URL.

### 2. sw.js → public/sw.js
Service Worker. Handles caching, offline mode, push notifications.

### 3. lib/pwaClient.js → src/lib/pwaClient.js (or lib/pwaClient.js)
Client-side helpers: SW registration, push permission, install prompt.

### 4. lib/pushNotification.js → src/lib/pushNotification.js (or lib/pushNotification.js)
Server-side push notification sender. Requires `web-push` npm package.

### 5. api/push-subscribe-route.js → app/api/push/subscribe/route.js
API endpoint for saving push subscriptions.

### 6. pages/offline.jsx → app/offline/page.jsx
Offline fallback page with Emma branding.

### 7. db/004_push_subscriptions.sql → Run in Neon SQL Editor
Push subscription storage table.

## Integration Steps

### Step 1: Add manifest link to HTML head
In your root layout (app/layout.jsx or app/layout.tsx), add to <head>:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#D85A30" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Emma" />
<link rel="apple-touch-icon" href="/icons/emma-192.png" />
```

### Step 2: Register Service Worker on app load
In your root layout or main component, add:
```javascript
'use client';
import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwaClient';

useEffect(() => {
  registerServiceWorker();
}, []);
```

### Step 3: Request push permission after first conversation
After the user has their first conversation with Emma (not on first visit — 
that's too aggressive), show a friendly prompt:
"Emma can remind you about appointments and medication. Allow notifications?"
Then call: requestPushPermission(userId)

### Step 4: Install web-push package
```bash
npm install web-push
```

### Step 5: Generate VAPID keys
```bash
npx web-push generate-vapid-keys
```
Add the output to .env:
```
VAPID_PUBLIC_KEY=generated_public_key
VAPID_PRIVATE_KEY=generated_private_key  
VAPID_EMAIL=mailto:tim@ihavefriend.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=same_public_key_as_above
```

### Step 6: Create Emma icons
Need two PNG icons with transparent background:
- /public/icons/emma-192.png (192x192)
- /public/icons/emma-512.png (512x512)
- /public/icons/emma-badge-72.png (72x72, for notification badge)
Use the current Emma avatar or a simple "E" in a coral circle.

### Step 7: Set up Vercel Cron for reminders
In vercel.json, add:
```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "*/15 * * * *"
    }
  ]
}
```
Create app/api/cron/reminders/route.js that calls processScheduledReminders().

## Environment Variables (add to Vercel)
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_EMAIL
- NEXT_PUBLIC_VAPID_PUBLIC_KEY

## Testing
1. Run `npm run dev`
2. Open Chrome DevTools → Application → Service Workers (should show registered)
3. Application → Manifest (should show app info)
4. Try "Add to Home Screen" from Chrome menu
5. Test push: Chrome DevTools → Application → Push → send test push
