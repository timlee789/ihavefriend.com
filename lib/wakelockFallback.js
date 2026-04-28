/**
 * lib/wakelockFallback.js — keep the screen awake during a chat session.
 *
 * The native Screen Wake Lock API is the right tool, but in practice it's
 * fragile across the platforms beta users actually have:
 *
 *   • iOS Safari (any version) — no Wake Lock API at all.
 *   • iOS PWAs — same.
 *   • Android Chrome — supported, but the lock auto-releases when the
 *     tab loses focus, the AudioContext is suspended, or the user
 *     pulls down a system sheet. Re-acquisition is silent.
 *   • Desktop Chrome — supported but the same auto-release applies on
 *     focus loss.
 *
 * Tim's beta phones started screen-sleeping mid-Emma-conversation, which
 * felt like Emma giving up. This module wraps the native API with two
 * complementary layers:
 *
 *   1. release-event listener — when the system silently releases the
 *      lock, we re-acquire it (assuming the session is still active).
 *   2. Looping <video> "NoSleep" fallback — for browsers where the
 *      Wake Lock API is missing OR keeps refusing to grant, we mount a
 *      tiny invisible looping silent video. Most mobile WebKit/Blink
 *      builds keep the screen on while a video element is playing.
 *
 * Usage from EmmaChat:
 *
 *     const guard = createWakeLockGuard();
 *     await guard.acquire();   // call when the session starts
 *     guard.release();         // call on disconnect / unmount
 *     guard.isAlive();         // for diagnostics
 *
 * Safe to call acquire/release multiple times; each invocation is
 * idempotent. All errors are swallowed — wake lock is best-effort and
 * a failure must never block the chat session.
 */

const TAG = '[WakeLock]';

function hasNativeAPI() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

// A tiny looping silent video, base64-encoded inline so we don't ship
// any asset. ~1 KB of mp4 — empty 1×1 black frame on a 1-second loop.
// Source: synthesised offline; the bytes are stable and license-free.
const NOSLEEP_MP4 = 'data:video/mp4;base64,' +
  'AAAAGGZ0eXBpc29tAAAAAGlzb21tcDQyAAAACGZyZWUAAACkbWRhdAAAACAGBe//' +
  '4QAAAEFmZmNvbnRlbnQABBpY7nfgAAAAACAA==';

function buildNoSleepVideo() {
  if (typeof document === 'undefined') return null;
  const v = document.createElement('video');
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('loop', '');
  v.setAttribute('webkit-playsinline', '');
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.style.position = 'fixed';
  v.style.width = '1px';
  v.style.height = '1px';
  v.style.opacity = '0';
  v.style.pointerEvents = 'none';
  v.style.left = '-9999px';
  v.style.top = '-9999px';
  v.src = NOSLEEP_MP4;
  return v;
}

/**
 * Create a wake-lock guard with explicit acquire / release.
 * Call acquire() when the conversation session goes live, and release()
 * when it ends (or when the component unmounts).
 */
function createWakeLockGuard() {
  let nativeLock = null;
  let video = null;
  let watchdogId = null;
  // The guard is "armed" between an acquire() and a release(). Used by
  // the release-event listener on native locks to decide whether to
  // re-acquire automatically.
  let armed = false;

  async function acquireNative() {
    if (!hasNativeAPI()) return false;
    if (nativeLock && !nativeLock.released) return true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      nativeLock = lock;
      lock.addEventListener('release', () => {
        if (armed) {
          // Browser auto-released (focus loss, system sheet, etc.).
          // Try to re-acquire on next tick — failures are silent.
          console.log(`${TAG} native lock released; re-acquiring`);
          setTimeout(() => { if (armed) acquireNative().catch(() => {}); }, 200);
        }
      });
      console.log(`${TAG} native lock acquired`);
      return true;
    } catch (e) {
      console.warn(`${TAG} native lock failed: ${e?.message || e}`);
      return false;
    }
  }

  function startVideoFallback() {
    if (typeof document === 'undefined') return;
    if (!video) {
      video = buildNoSleepVideo();
      if (!video) return;
      document.body.appendChild(video);
    }
    const p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(err => console.warn(`${TAG} video fallback play failed: ${err?.message || err}`));
    }
  }

  function stopVideoFallback() {
    if (!video) return;
    try { video.pause(); } catch {}
    try { video.removeAttribute('src'); video.load(); } catch {}
    try { video.remove(); } catch {}
    video = null;
  }

  function startWatchdog() {
    stopWatchdog();
    // Every 30 seconds, verify the native lock is still alive. If it
    // isn't (and we're still armed), try to take it again. Belt-and-
    // suspenders against a release event we missed.
    watchdogId = setInterval(() => {
      if (!armed) return;
      const dead = !nativeLock || nativeLock.released;
      if (dead && hasNativeAPI()) {
        console.log(`${TAG} watchdog: lock dead, retrying`);
        acquireNative().catch(() => {});
      }
    }, 30_000);
  }

  function stopWatchdog() {
    if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
  }

  return {
    async acquire() {
      armed = true;
      // Always start the video fallback — it's tiny, costs nothing, and
      // covers the cases (iOS Safari, denied native API) where the
      // native lock will never succeed.
      startVideoFallback();
      const nativeOk = await acquireNative();
      if (!nativeOk) {
        console.log(`${TAG} no native API — running on video fallback only`);
      }
      startWatchdog();
    },
    release() {
      armed = false;
      stopWatchdog();
      if (nativeLock) {
        try { nativeLock.release(); } catch {}
        nativeLock = null;
      }
      stopVideoFallback();
      console.log(`${TAG} released`);
    },
    isAlive() {
      return armed && (!!nativeLock && !nativeLock.released || !!video);
    },
  };
}

module.exports = { createWakeLockGuard };
