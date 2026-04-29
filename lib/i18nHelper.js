/**
 * lib/i18nHelper.js — i18n helpers shared by /book/* pages.
 *
 * `getUserLang()`  — returns 'ko' | 'en' | 'es' based on:
 *   1. localStorage.lang (set by the language toggle on / and elsewhere)
 *   2. navigator.language ('en-US' → 'en', 'es-ES' → 'es')
 *   3. fallback 'ko'
 *
 * `titleOf(obj, lang)` — given a localised object like
 *   { ko: '어린 시절', en: 'Childhood' }
 *   returns the best string for the requested lang, falling back
 *   ko → en → es → first available value. If `obj` is already a
 *   plain string it's returned as-is.
 */

export function getUserLang() {
  if (typeof window === 'undefined') return 'ko';
  try {
    const stored = (localStorage.getItem('lang') || '').toLowerCase();
    if (stored === 'ko' || stored === 'en' || stored === 'es') return stored;
  } catch { /* localStorage unavailable */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'ko').toLowerCase();
  if (nav.startsWith('en')) return 'en';
  if (nav.startsWith('es')) return 'es';
  return 'ko';
}

export function titleOf(obj, lang = 'ko') {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return String(obj);
  const direct = obj[lang];
  if (direct) return direct;
  if (obj.ko) return obj.ko;
  if (obj.en) return obj.en;
  if (obj.es) return obj.es;
  const first = Object.values(obj).find(v => typeof v === 'string' && v);
  return first || '';
}
