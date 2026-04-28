/**
 * lib/wakelockFallback.js — keep the screen awake during a chat session.
 *
 * Wraps the npm `nosleep.js` package, which ships a real silent looping
 * video (both webm + mp4 inline) and falls back to it automatically
 * when the native Wake Lock API is missing or denied. That's the
 * combination iOS Safari + Android Chrome + desktop Chrome all need.
 *
 * The earlier hand-rolled version (Task 55) used a placeholder MP4
 * base64 that wasn't a valid file, so .play() rejected immediately on
 * iOS Safari and the screen still slept. nosleep.js solves that with
 * a properly encoded ~6 KB silent loop and a known-good
 * visibilitychange / fullscreenchange re-enable strategy.
 *
 * Usage from EmmaChat (unchanged from Task 55):
 *
 *     const guard = createWakeLockGuard();
 *     await guard.acquire();   // call when the session starts
 *     guard.release();         // call on disconnect / unmount
 *     guard.isAlive();         // diagnostics
 *
 * Notes:
 *   • The NoSleep instance is constructed lazily on first acquire so
 *     that Next.js server-side rendering doesn't trip over the
 *     package's `document`/`navigator` references. Even with
 *     'use client', client components are pre-rendered on the server
 *     once before hydration.
 *   • All errors are swallowed — wake lock is best-effort and a
 *     failure must never block the chat session.
 */

const TAG = '[WakeLock]';

/**
 * Create a wake-lock guard with explicit acquire / release.
 * Construct one per EmmaChat instance and hold via useRef.
 */
function createWakeLockGuard() {
  let noSleep = null;
  let armed = false;

  function ensureInstance() {
    if (noSleep) return noSleep;
    if (typeof window === 'undefined') return null;
    try {
      const NoSleepCtor = require('nosleep.js');
      noSleep = new NoSleepCtor();
      return noSleep;
    } catch (e) {
      console.warn(`${TAG} nosleep.js failed to load: ${e?.message || e}`);
      return null;
    }
  }

  return {
    /**
     * Acquire the lock. Idempotent — calling multiple times is safe.
     * Must be invoked from a user-gesture handler (mic-tap, button click)
     * on iOS so the underlying <video>.play() succeeds.
     */
    async acquire() {
      armed = true;
      const inst = ensureInstance();
      if (!inst) {
        console.log(`${TAG} no instance available — wake lock skipped`);
        return;
      }
      try {
        await inst.enable();
        console.log(`${TAG} active (isEnabled=${!!inst.isEnabled})`);
      } catch (e) {
        console.warn(`${TAG} enable() failed: ${e?.name || ''} ${e?.message || e}`);
      }
    },
    release() {
      armed = false;
      if (!noSleep) return;
      try { noSleep.disable(); } catch {}
      console.log(`${TAG} released`);
    },
    isAlive() {
      return armed && !!noSleep && !!noSleep.isEnabled;
    },
  };
}

module.exports = { createWakeLockGuard };
