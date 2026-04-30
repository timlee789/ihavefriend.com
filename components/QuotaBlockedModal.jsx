'use client';

/**
 * QuotaBlockedModal — shown when any /api/* call returns 402 with a
 * `{ message_ko, message_en, message_es, launching_soon }` body
 * (Task 66). The senior never sees a numeric token limit; the framing
 * is "service launching soon" so the block feels intentional.
 *
 * Usage:
 *   const [block, setBlock] = useState(null);
 *   const res = await fetch('/api/chat/setup', …);
 *   if (res.status === 402) setBlock(await res.json());
 *   …
 *   {block && <QuotaBlockedModal data={block} onClose={() => router.push('/')} />}
 */
import { useEffect, useState } from 'react';
import { getUserLang } from '@/lib/i18nHelper';

export default function QuotaBlockedModal({ data, onClose }) {
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);

  if (!data) return null;
  const message =
    lang === 'en' ? data.message_en :
    lang === 'es' ? data.message_es :
    data.message_ko;
  const heading =
    lang === 'en' ? "We'll see you soon!" :
    lang === 'es' ? '¡Hasta pronto!' :
    '곧 만나요!';
  const sub =
    lang === 'en' ? 'Questions or feedback? sayandkeep@example.com' :
    lang === 'es' ? '¿Preguntas? sayandkeep@example.com' :
    '피드백이나 문의는 sayandkeep@example.com 으로 보내주세요.';
  const cta =
    lang === 'en' ? 'Back to home' :
    lang === 'es' ? 'Volver al inicio' :
    '홈으로';

  return (
    <div style={backdrop} role="dialog" aria-modal="true">
      <div style={card}>
        <div style={icon} aria-hidden>🌱</div>
        <h2 style={title}>{heading}</h2>
        <p style={body}>{message}</p>
        <p style={subStyle}>{sub}</p>
        <button style={btn} onClick={onClose}>{cta}</button>
      </div>
    </div>
  );
}

const backdrop = {
  position: 'fixed', inset: 0,
  background: 'rgba(0, 0, 0, 0.78)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, zIndex: 9999,
};
const card = {
  background: '#2a2520',
  color: '#fdfdfd',
  borderRadius: 18,
  padding: '32px 28px',
  maxWidth: 420,
  width: '100%',
  textAlign: 'center',
  border: '1px solid rgba(34, 197, 94, 0.30)',
};
const icon = { fontSize: 48, marginBottom: 12 };
const title = { fontSize: 22, margin: '0 0 12px', fontWeight: 600 };
const body = { fontSize: 16, lineHeight: 1.6, margin: '0 0 16px', color: 'rgba(255,255,255,0.88)' };
const subStyle = { fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 24px' };
const btn = {
  background: '#ea580c', color: 'white', border: 'none',
  padding: '12px 28px', borderRadius: 12, cursor: 'pointer',
  fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
};
