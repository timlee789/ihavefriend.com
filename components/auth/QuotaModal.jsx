'use client';

/**
 * QuotaModal — Sprint 2j V2 (2026-05-11).
 *
 * Reusable modal triggered when a 403 + quota_exceeded / feature_not_allowed
 * response comes back from any API. Renders a tier-aware message and a CTA
 * to upgrade ("정식 등록").
 *
 * Props:
 *   open       — controls visibility
 *   onClose    — () => void
 *   type       — 'fragment' | 'photo' | 'pdf' | 'memoirBook' | 'photobook' |
 *                'time' | 'audioQr' | 'sharing'   (drives the copy)
 *   tier       — 'free' | 'premium' | 'unlimited' (from API response)
 *   limit      — number or null (for count-based quotas)
 *   onUpgrade  — () => void (called when "정식 등록" pressed). If omitted,
 *                a default link to /pricing (or /login if anonymous) is used.
 *
 * Layout matches the bottom-sheet modal pattern used in /my-stories.
 */
import { useRouter } from 'next/navigation';
import s from './QuotaModal.module.css';

const LABELS = {
  KO: {
    fragment:    { title: '📝 Trial 한도에 도달했어요',  desc: (n) => `Trial 에선 이야기를 ${n}개 까지 만들 수 있어요. 더 만들고 싶다면 정식 등록을 해 주세요.` },
    photo:       { title: '📷 사진 한도에 도달했어요',   desc: (n) => `Trial 에선 사진을 ${n}장 까지 올릴 수 있어요. 더 올리시려면 정식 등록을 해 주세요.` },
    pdf:         { title: '📄 PDF 생성은 정식 기능',     desc: () => 'PDF ebook 생성은 정식 등록 후 가능해요.' },
    memoirBook:  { title: '📘 자서전 한도에 도달했어요', desc: (n) => `Trial 에선 자서전을 ${n}권 까지 만들 수 있어요. 더 만들시려면 정식 등록을 해 주세요.` },
    photobook:   { title: '📷 사진책 한도에 도달했어요', desc: (n) => `Trial 에선 사진책을 ${n}권 까지 만들 수 있어요. 더 만들시려면 정식 등록을 해 주세요.` },
    time:        { title: '⏰ 오늘의 대화 시간을 다 쓰셨어요', desc: () => '내일 다시 시작하시거나, 정식 등록 후 더 긴 시간을 사용하세요.' },
    audioQr:     { title: '🎙️ 음성 QR 은 정식 기능',     desc: () => 'Audio QR 코드 공유는 정식 등록 후 가능해요.' },
    sharing:     { title: '🌐 공유 기능은 정식 기능',     desc: () => '가족 공유는 정식 등록 후 가능해요.' },
    upgrade:     '정식 등록',
    later:       '나중에',
    paidNote:    (limit, tier) => tier === 'premium' ? `정식 사용 한도 (${limit}) 에 도달했어요. 운영자에게 문의해 주세요.` : '한도에 도달했어요.',
  },
  EN: {
    fragment:    { title: '📝 Trial limit reached',     desc: (n) => `On Trial you can create up to ${n} stories. Sign up to keep going.` },
    photo:       { title: '📷 Photo limit reached',     desc: (n) => `On Trial you can upload up to ${n} photos. Sign up to add more.` },
    pdf:         { title: '📄 PDF is a paid feature',    desc: () => 'PDF ebook generation is available after signing up.' },
    memoirBook:  { title: '📘 Memoir limit reached',    desc: (n) => `On Trial you can make up to ${n} memoirs. Sign up to make more.` },
    photobook:   { title: '📷 Photobook limit reached', desc: (n) => `On Trial you can make up to ${n} photobooks. Sign up to make more.` },
    time:        { title: "⏰ You've used today's chat time", desc: () => 'Come back tomorrow, or sign up to chat for longer.' },
    audioQr:     { title: '🎙️ Voice QR is a paid feature', desc: () => 'Audio QR sharing is available after signing up.' },
    sharing:     { title: '🌐 Sharing is a paid feature', desc: () => 'Family sharing is available after signing up.' },
    upgrade:     'Sign Up',
    later:       'Later',
    paidNote:    (limit, tier) => tier === 'premium' ? `You've reached the paid plan limit (${limit}). Contact support.` : 'Limit reached.',
  },
  ES: {
    fragment:    { title: '📝 Límite Trial alcanzado',  desc: (n) => `En Trial puedes crear hasta ${n} historias. Regístrate para más.` },
    photo:       { title: '📷 Límite de fotos',         desc: (n) => `En Trial puedes subir hasta ${n} fotos. Regístrate para más.` },
    pdf:         { title: '📄 PDF es función premium',  desc: () => 'La generación de PDF está disponible tras registrarte.' },
    memoirBook:  { title: '📘 Límite de memorias',      desc: (n) => `En Trial puedes hacer hasta ${n} memorias. Regístrate para más.` },
    photobook:   { title: '📷 Límite de libros de fotos', desc: (n) => `En Trial puedes hacer hasta ${n} libros. Regístrate para más.` },
    time:        { title: '⏰ Tiempo de chat de hoy agotado', desc: () => 'Vuelve mañana o regístrate para usar más tiempo.' },
    audioQr:     { title: '🎙️ QR de voz es función premium', desc: () => 'El QR de voz está disponible tras registrarte.' },
    sharing:     { title: '🌐 Compartir es función premium', desc: () => 'Compartir con la familia está disponible tras registrarte.' },
    upgrade:     'Registrarse',
    later:       'Más tarde',
    paidNote:    (limit, tier) => tier === 'premium' ? `Has alcanzado el límite del plan (${limit}). Contacta soporte.` : 'Límite alcanzado.',
  },
};

function getLang() {
  if (typeof window === 'undefined') return 'KO';
  const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
  return ['KO', 'EN', 'ES'].includes(stored) ? stored : 'KO';
}

export default function QuotaModal({ open, onClose, type = 'fragment', tier = 'free', limit = null, onUpgrade }) {
  const router = useRouter();
  if (!open) return null;

  const L = LABELS[getLang()] || LABELS.KO;
  const entry = L[type] || L.fragment;
  const isPaidLimit = tier === 'premium' || tier === 'unlimited';

  function handleUpgrade() {
    if (onUpgrade) { onUpgrade(); return; }
    // 🔥 Sprint 2k (2026-05-11) — 모든 경로 (anonymous + trial) /pricing 으로.
    //   /pricing 은 anonymous open (Sprint 2i 패턴) — 가입 전에도 가격 정보
    //   확인 가능. modal 도 닫음.
    router.push('/pricing');
    if (onClose) onClose();
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true">
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{entry.title}</div>
          {onClose && <button className={s.modalClose} onClick={onClose} aria-label="close">✕</button>}
        </div>
        <div className={s.modalBody}>
          <p className={s.desc}>
            {isPaidLimit ? L.paidNote(limit, tier) : entry.desc(limit)}
          </p>
          <div className={s.actions}>
            {onClose && (
              <button className={s.laterBtn} onClick={onClose}>{L.later}</button>
            )}
            {!isPaidLimit && (
              <button className={s.upgradeBtn} onClick={handleUpgrade}>
                {L.upgrade}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
