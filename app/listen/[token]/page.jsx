'use client';

/**
 * /listen/[token] — public audio listening page
 *
 * Voice QR System Phase 1 (Step 09). Reached when a family member
 * scans the QR code or follows the share link from FragmentModal.
 *
 * No auth required. Uses /api/listen/[token] (Step 05) which:
 *   - filters by is_public = TRUE (DB level)
 *   - validates token length
 *   - returns sender name only (no email/userId leak)
 *   - resolves question_prompt from user_books.structure JSONB
 *
 * Senior-friendly design (per Tim 2026-05-05):
 *   - Large readable text
 *   - Native HTML5 <audio controls> (consistent across browsers)
 *   - "원본 음성" / "Original Voice" / "Voz original" phrasing
 *   - No marketing copy in v1 (Step 11 may add)
 *   - Lang from fragment.language with KO fallback
 */

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import s from './page.module.css';

// ── Localization ──────────────────────────────────────────────
const PAGE_MSGS = {
  ko: {
    loadingMsg     : '불러오는 중…',
    notFoundTitle  : '찾을 수 없는 음성이에요',
    notFoundDesc   : '링크가 잘못되었거나, 보낸 사람이 공유를 중단했을 수 있어요.',
    senderSuffix   : '님이 보내준',
    sectionLabel   : '원본 음성',
    questionLabel  : '📖 답한 질문',
    playCountSingle: '1번 들었어요',
    playCountMulti : (n) => `${n}번 들었어요`,
    storySection   : '글로 정리한 이야기',
    siteName       : 'SayAndKeep',
    siteTagline    : '말하세요. 간직해드립니다.',
    audioError     : '음성을 재생할 수 없어요. 다시 시도해주세요.',
  },
  en: {
    loadingMsg     : 'Loading…',
    notFoundTitle  : 'This voice could not be found',
    notFoundDesc   : 'The link may be wrong, or the sender may have stopped sharing.',
    senderSuffix   : "'s",
    sectionLabel   : 'Original Voice',
    questionLabel  : '📖 The question they answered',
    playCountSingle: 'Played 1 time',
    playCountMulti : (n) => `Played ${n} times`,
    storySection   : 'Written story',
    siteName       : 'SayAndKeep',
    siteTagline    : 'Say it. We keep it.',
    audioError     : 'Could not play audio. Please try again.',
  },
  es: {
    loadingMsg     : 'Cargando…',
    notFoundTitle  : 'No se encontró esta voz',
    notFoundDesc   : 'El enlace puede ser incorrecto o el remitente dejó de compartir.',
    senderSuffix   : ' compartió',
    sectionLabel   : 'Voz original',
    questionLabel  : '📖 La pregunta que respondió',
    playCountSingle: 'Escuchado 1 vez',
    playCountMulti : (n) => `Escuchado ${n} veces`,
    storySection   : 'Historia escrita',
    siteName       : 'SayAndKeep',
    siteTagline    : 'Dilo. Lo guardamos.',
    audioError     : 'No se pudo reproducir el audio. Inténtalo de nuevo.',
  },
};

function pickLang(fragmentLang) {
  const l = String(fragmentLang || 'ko').toLowerCase();
  if (l === 'en' || l === 'es' || l === 'ko') return l;
  return 'ko';
}

// ── Page ─────────────────────────────────────────────────────
export default function ListenPage({ params }) {
  // Next.js 15+ — params is a Promise
  const { token } = use(params);

  // Lazy init — derive initial state from token presence so the effect
  // body never has to call setState synchronously (React 19 forbids it).
  const [state, setState] = useState(() => token ? 'loading' : 'notfound'); // 'loading' | 'ready' | 'notfound' | 'error'
  const [data, setData]   = useState(null);
  const [played, setPlayed] = useState(false); // analytics fired once per session

  // Fetch audio + fragment + sender
  useEffect(() => {
    // No-token case is already handled by the lazy useState init above —
    // we just bail early without touching state.
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/listen/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.status === 404) {
          setState('notfound');
          return;
        }
        if (!res.ok) {
          setState('error');
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setState('ready');
      } catch (e) {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Fire-and-forget analytics on first play
  function handleAudioPlay() {
    if (played) return;
    setPlayed(true);
    fetch(`/api/listen/${encodeURIComponent(token)}/played`, {
      method: 'POST',
    }).catch(() => {});
  }

  // ── Render ──────────────────────────────────────────────────
  const lang = data?.fragment?.language ? pickLang(data.fragment.language) : 'ko';
  const m    = PAGE_MSGS[lang] || PAGE_MSGS.ko;

  if (state === 'loading') {
    return (
      <div className={s.page}>
        <Header lang={lang} />
        <div className={s.loadingState}>{m.loadingMsg}</div>
      </div>
    );
  }

  if (state === 'notfound') {
    return (
      <div className={s.page}>
        <Header lang={lang} />
        <div className={s.notFoundCard}>
          <div className={s.notFoundEmoji}>🔍</div>
          <div className={s.notFoundTitle}>{m.notFoundTitle}</div>
          <div className={s.notFoundDesc}>{m.notFoundDesc}</div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={s.page}>
        <Header lang={lang} />
        <div className={s.notFoundCard}>
          <div className={s.notFoundEmoji}>⚠️</div>
          <div className={s.notFoundTitle}>{m.audioError}</div>
        </div>
      </div>
    );
  }

  const { audio, fragment, sender } = data;
  const senderName = sender?.name || '';
  const playCount  = audio?.play_count || 0;

  return (
    <div className={s.page}>
      <Header lang={lang} />

      {/* Sender + section title */}
      <div className={s.headline}>
        <div className={s.giftIcon}>💝</div>
        {senderName && (
          <div className={s.senderLine}>
            {lang === 'en' ? (
              <>
                <span className={s.senderName}>{senderName}</span>
                <span>{m.senderSuffix}</span>
              </>
            ) : lang === 'es' ? (
              <>
                <span className={s.senderName}>{senderName}</span>
                <span>{m.senderSuffix}</span>
              </>
            ) : (
              <>
                <span className={s.senderName}>{senderName}</span>
                <span>{m.senderSuffix}</span>
              </>
            )}
          </div>
        )}
        <div className={s.sectionLabel}>{m.sectionLabel}</div>
      </div>

      {/* Question prompt (if fragment is part of a book) */}
      {fragment?.question_prompt && (
        <div className={s.questionCard}>
          <div className={s.questionLabel}>{m.questionLabel}</div>
          <div className={s.questionText}>{fragment.question_prompt}</div>
        </div>
      )}

      {/* Audio player */}
      <div className={s.audioCard}>
        <audio
          src={audio.url}
          controls
          preload="metadata"
          onPlay={handleAudioPlay}
          className={s.audioPlayer}
        />
        {playCount > 0 && (
          <div className={s.playCount}>
            {playCount === 1 ? m.playCountSingle : m.playCountMulti(playCount)}
          </div>
        )}
      </div>

      {/* Written story */}
      {fragment?.content && (
        <div className={s.storyCard}>
          <div className={s.storySectionLabel}>{m.storySection}</div>
          <h1 className={s.storyTitle}>{fragment.title}</h1>
          {fragment.subtitle && (
            <h2 className={s.storySubtitle}>{fragment.subtitle}</h2>
          )}
          <div className={s.storyContent}>
            <ReactMarkdown>{fragment.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small site header ────────────────────────────────────────
function Header({ lang }) {
  const m = PAGE_MSGS[lang] || PAGE_MSGS.ko;
  return (
    <div className={s.header}>
      <Link href="/" className={s.brandLink}>
        <span className={s.brandName}>{m.siteName}</span>
        <span className={s.brandTagline}>{m.siteTagline}</span>
      </Link>
    </div>
  );
}
