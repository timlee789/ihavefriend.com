'use client';

/**
 * Sharing Stories — content-driven page (Task 45 + 46)
 *
 * Loads /sharing-stories.json (static), shows cards → modal.
 * Identity-aligned: hearing other voices nudges users toward their own.
 *
 * NOTE (Task 46, 2026-04-27): TTS temporarily removed — browser
 * SpeechSynthesis Korean quality too low for senior beta users.
 * PAGE_MSGS listen/pause/resume/stop keys and CSS .ttsControls etc.
 * are preserved so a real engine (ElevenLabs etc.) can be plugged
 * back in after beta data review.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import s from './page.module.css';

// ── Localization ──────────────────────────────────────────────
const PAGE_MSGS = {
  KO: {
    pageTitle      : '함께 듣는 이야기',
    pageSubtitle   : '다른 사람들의 이야기를 듣다 보면 내 이야기도 하고 싶어집니다',
    backBtn        : '‹',
    typeEpisode    : '일상 에피소드',
    typeEssay      : '감성 수필',
    typeMemoir     : '인생 경험',
    readingTime    : (m) => `${m}분 읽기`,
    listenBtn      : '🔊 들려주기',
    pauseBtn       : '⏸ 일시정지',
    resumeBtn      : '▶ 이어 듣기',
    stopBtn        : '⏹ 정지',
    closeBtn       : '닫기',
    triggerSection : '비슷한 이야기 있으세요?',
    startMyStoryBtn: '🎙️ 내 이야기 시작하기',
    loadFailed     : '이야기를 불러오지 못했습니다.',
    ttsNotSupported: '이 브라우저는 음성 듣기를 지원하지 않습니다.',
  },
  EN: {
    pageTitle      : 'Stories to Listen Together',
    pageSubtitle   : "Hearing others' stories can spark your own",
    backBtn        : '‹',
    typeEpisode    : 'Daily Episode',
    typeEssay      : 'Reflection',
    typeMemoir     : 'Life Story',
    readingTime    : (m) => `${m} min read`,
    listenBtn      : '🔊 Listen',
    pauseBtn       : '⏸ Pause',
    resumeBtn      : '▶ Resume',
    stopBtn        : '⏹ Stop',
    closeBtn       : 'Close',
    triggerSection : 'Have a similar story?',
    startMyStoryBtn: '🎙️ Start My Story',
    loadFailed     : 'Could not load stories.',
    ttsNotSupported: 'Your browser does not support voice playback.',
  },
  ES: {
    pageTitle      : 'Historias para escuchar juntos',
    pageSubtitle   : 'Al escuchar historias de otros, puede surgir la tuya',
    backBtn        : '‹',
    typeEpisode    : 'Episodio diario',
    typeEssay      : 'Reflexión',
    typeMemoir     : 'Historia de vida',
    readingTime    : (m) => `${m} min`,
    listenBtn      : '🔊 Escuchar',
    pauseBtn       : '⏸ Pausa',
    resumeBtn      : '▶ Continuar',
    stopBtn        : '⏹ Detener',
    closeBtn       : 'Cerrar',
    triggerSection : '¿Tienes una historia similar?',
    startMyStoryBtn: '🎙️ Comenzar mi historia',
    loadFailed     : 'No se pudieron cargar las historias.',
    ttsNotSupported: 'Este navegador no admite reproducción de voz.',
  },
};

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

function typeKey(type) {
  if (!type) return '';
  return 'type' + type.charAt(0).toUpperCase() + type.slice(1);
}

// ── Page ─────────────────────────────────────────────────────
export default function SharingStoriesPage() {
  const router = useRouter();
  const lang   = useLang();
  const msgs   = PAGE_MSGS[lang] || PAGE_MSGS.KO;

  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/sharing-stories.json')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('http')))
      .then(data => {
        if (cancelled) return;
        setStories(Array.isArray(data?.stories) ? data.stories : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(msgs.loadFailed);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [msgs.loadFailed]);

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => router.back()}>
            {msgs.backBtn}
          </button>
          <span className={s.pageTitle}>{msgs.pageTitle}</span>
        </div>
      </div>

      {/* Subtitle */}
      <div className={s.subtitleSection}>
        <p className={s.subtitle}>{msgs.pageSubtitle}</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className={s.loading}>…</div>
      ) : error ? (
        <div className={s.error}>{error}</div>
      ) : (
        <div className={s.cardList}>
          {stories.map(story => (
            <StoryCard
              key={story.id}
              story={story}
              lang={lang}
              onClick={() => setSelected(story)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <StoryDetailModal
          story={selected}
          lang={lang}
          onClose={() => setSelected(null)}
          onStartMyStory={() => router.push('/chat')}
        />
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────
function StoryCard({ story, lang, onClick }) {
  const msgs = PAGE_MSGS[lang] || PAGE_MSGS.KO;
  const typeLabel = msgs[typeKey(story.type)] || '';
  const preview = (story.content || '').slice(0, 120) +
    ((story.content || '').length > 120 ? '…' : '');

  return (
    <div className={s.card} onClick={onClick}>
      <div className={s.cardHeader}>
        <span className={s.typeBadge}>{typeLabel}</span>
        <span className={s.readingTime}>
          {msgs.readingTime(story.readingMinutes ?? 5)}
        </span>
      </div>
      <div className={s.cardTitle}>{story.title}</div>
      {story.subtitle && <div className={s.cardSubtitle}>{story.subtitle}</div>}
      <div className={s.cardPreview}>{preview}</div>
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────
function StoryDetailModal({ story, lang, onClose, onStartMyStory }) {
  const msgs = PAGE_MSGS[lang] || PAGE_MSGS.KO;
  const typeLabel = msgs[typeKey(story.type)] || '';

  function handleClose() {
    onClose();
  }

  // NOTE (Task 46): TTS controls + handlers removed temporarily.
  // Re-introduce when a real voice engine (e.g. ElevenLabs) replaces
  // the browser SpeechSynthesis fallback. PAGE_MSGS keys (listenBtn,
  // pauseBtn, resumeBtn, stopBtn, ttsNotSupported) are kept intact.

  return (
    <div
      className={s.overlay}
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <div className={s.modal}>
        <div className={s.modalHandle} />

        {/* Header */}
        <div className={s.modalHeader}>
          <div className={s.modalHeaderLeft}>
            <span className={s.modalTypeBadge}>{typeLabel}</span>
            <span className={s.modalReadingTime}>
              {msgs.readingTime(story.readingMinutes ?? 5)}
            </span>
          </div>
          <button className={s.modalClose} onClick={handleClose}>✕</button>
        </div>

        {/* Title */}
        <div className={s.modalTitle}>{story.title}</div>
        {story.subtitle && (
          <div className={s.modalSubtitle}>{story.subtitle}</div>
        )}

        {/* TTS controls intentionally removed (Task 46). */}

        {/* Body */}
        <div className={s.modalBody}>
          <div className={s.storyContent}>
            <ReactMarkdown>{story.content || ''}</ReactMarkdown>
          </div>

          {/* Trigger toward the user's own story */}
          <div className={s.triggerSection}>
            <div className={s.triggerTitle}>💭 {msgs.triggerSection}</div>
            <button className={s.startMyStoryBtn} onClick={onStartMyStory}>
              {msgs.startMyStoryBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
