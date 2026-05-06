'use client';

/**
 * components/fragments/FragmentModal.jsx  (Task 82)
 *
 * The REAL FragmentModal — extracted verbatim from /my-stories/page.jsx
 * so /my-stories and /book/.../question/[qId] share one identical
 * surface (Tim's second-pass requirement: lean modal from Task 79
 * was the wrong call).
 *
 * Capabilities:
 *   • View body (markdown), photos, continuations thread
 *   • Edit title / subtitle / content
 *   • Visibility toggle (private ↔ public) with confirm
 *   • Delete with confirm
 *   • Add to / remove from collections
 *   • Truncated banner → continue-with-Emma path
 *   • PhotoUploader (max 2 photos)
 *   • Continue thread → /chat?continueFragment=<id>
 *
 * Lang: KO / EN / ES uppercase strings (matches the rest of the
 * /my-stories codebase). Book pages must convert their lowercase
 * lang before passing it in.
 *
 * CSS: imports /my-stories/page.module.css. Same scoped classes
 * regardless of which page renders this; book pages don't need to
 * own duplicate CSS.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import QRCode from 'qrcode';
import PhotoUploader from '@/components/photos/PhotoUploader';
import FragmentCollectionPicker from './FragmentCollectionPicker';
import { VIS_MSGS } from './fragmentI18n';
import { authFetch } from './fragmentHelpers';
import s from '@/app/my-stories/page.module.css';

export default function FragmentModal({
  fragment,
  onClose,
  onUpdated,
  onPhotosChanged,
  onDeleted,
  lang = 'KO',
  // 🔥 Task 83 — render the modal body inside the page flow instead
  //   of as an overlay. Used by /book/.../question/[qId] so the answer
  //   appears right where the old preview card sat (no extra tap).
  //   When inline=true: no overlay/backdrop, no slide-up animation,
  //   no back/close/handle controls — just the content. All edit /
  //   delete / photo / continuation behavior is otherwise identical.
  inline = false,
  // 🔥 Task 96 — surface the "where did the user come from" context
  //   so the typed-edit page can route them back. Shape:
  //     { bookId, questionId } → /book/X/question/Y is the return
  //     { bookId }             → /book/X is the return (rare, future use)
  //     null                   → /my-stories is the return (default)
  //   Only the question page passes this; /my-stories leaves it null
  //   so the existing "back to /my-stories" behavior keeps working.
  bookContext = null,
}) {
  const router = useRouter();
  const [mode, setMode]           = useState('view');  // 'view' | 'edit' | 'confirmDelete' | 'confirmVisibility'
  const [editTitle, setEditTitle] = useState(fragment.title || '');
  const [editSubtitle, setEditSub] = useState(fragment.subtitle || '');
  const [editContent, setEditCont] = useState(fragment.content || '');
  const [saving, setSaving]       = useState(false);
  const [currentVis, setCurrentVis] = useState(fragment.visibility || 'private');
  const [continuations, setContinuations] = useState(fragment.continuations || []);
  const [fragmentCollections, setFragmentCollections] = useState(fragment.collections || []);
  const [showPicker, setShowPicker] = useState(false);

  // 🆕 Step 12 (Voice QR) — multi-audio state.
  //   🔥 2026-05-06 (Tim) — fragment can have N audio recordings
  //   (continuation appends one). The QR code uses the FIRST audio's
  //   public_token; /listen/[token] returns all siblings to render N
  //   players in one page.
  const [audios, setAudios] = useState('loading');  // 'loading' | [] | [{...}, ...]
  const [audioBusy, setAudioBusy] = useState(false); // toggle / delete in flight
  const [qrDataUrl, setQrDataUrl] = useState('');    // base64 PNG of QR (built from audios[0].public_token)
  const [linkCopied, setLinkCopied] = useState(false);
  const [confirmDeleteAudioOrder, setConfirmDeleteAudioOrder] = useState(null); // null | audio_order to delete

  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;

  const reloadFragmentMeta = useCallback(async () => {
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`);
      const data = await res.json();
      if (data?.fragment) {
        if (data.fragment.continuations) setContinuations(data.fragment.continuations);
        if (data.fragment.collections) setFragmentCollections(data.fragment.collections);
      }
    } catch (e) {
      console.warn('[FragmentModal] meta load failed:', e.message);
    }
  }, [fragment.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/fragments/${fragment.id}`);
        const data = await res.json();
        if (!cancelled && data?.fragment) {
          if (data.fragment.continuations) setContinuations(data.fragment.continuations);
          if (data.fragment.collections) setFragmentCollections(data.fragment.collections);
        }
      } catch (e) {
        console.warn('[FragmentModal] continuations load failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [fragment.id]);

  // 🆕 Step 12 (Voice QR) — load audios array.
  //   🔥 2026-05-06 (Tim) — GET response shape: { audios: [...] }
  //   sorted by audio_order ASC.
  useEffect(() => {
    let cancelled = false;
    setAudios('loading');
    (async () => {
      try {
        const res = await authFetch(`/api/fragments/${fragment.id}/audio`);
        if (!res.ok) {
          if (!cancelled) setAudios([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setAudios(Array.isArray(data?.audios) ? data.audios : []);
      } catch (e) {
        console.warn('[FragmentModal] audios load failed:', e.message);
        if (!cancelled) setAudios([]);
      }
    })();
    return () => { cancelled = true; };
  }, [fragment.id]);

  // 🆕 Step 12 (Voice QR) — generate QR data URL when at least one audio
  //   exists, is_public, and has a token. We use the FIRST audio's token
  //   as the QR encoding — family scans it, lands on /listen/[token]
  //   which returns all sibling audios in order.
  useEffect(() => {
    if (!Array.isArray(audios) || audios.length === 0) {
      setQrDataUrl('');
      return;
    }
    const first = audios[0];
    if (!first || !first.is_public || !first.public_token) {
      setQrDataUrl('');
      return;
    }
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/listen/${first.public_token}`
      : `/listen/${first.public_token}`;
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
      .then(dataUrl => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(e => {
        console.warn('[FragmentModal] QR generation failed:', e.message);
        if (!cancelled) setQrDataUrl('');
      });
    return () => { cancelled = true; };
  }, [audios]);

  const allTags = [
    ...(fragment.tags_theme   || []).map(t => ({ text: t, cls: s.tagTheme })),
    ...(fragment.tags_emotion || []).map(t => ({ text: t, cls: s.tagEmotion })),
    ...(fragment.tags_people  || []).map(t => ({ text: t, cls: s.tagPeople })),
    ...(fragment.tags_era     || []).map(t => ({ text: t, cls: s.tag })),
    ...(fragment.tags_place   || []).map(t => ({ text: t, cls: s.tag })),
  ];

  async function handleSave() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle, subtitle: editSubtitle, content: editContent }),
      });
      const data = await res.json();
      if (data.fragment) { onUpdated && onUpdated(data.fragment); setMode('view'); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await authFetch(`/api/fragments/${fragment.id}`, { method: 'DELETE' });
      onDeleted && onDeleted(fragment.id);
    } finally {
      setSaving(false);
    }
  }

  // 🆕 Step 12 (Voice QR) — audio handlers.
  //   🔥 2026-05-06 (Tim) — multi-audio. PATCH toggles is_public for
  //   all rows; DELETE accepts ?order=N for single-audio delete.
  async function handleToggleAudioShare() {
    if (!Array.isArray(audios) || audios.length === 0 || audioBusy) return;
    const currentIsPublic = audios[0]?.is_public;
    setAudioBusy(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}/audio`, {
        method: 'PATCH',
        body: JSON.stringify({ is_public: !currentIsPublic }),
      });
      const data = await res.json();
      if (Array.isArray(data?.audios)) {
        setAudios(data.audios);
      } else {
        alert(vm.errMsg);
      }
    } catch (e) {
      console.warn('[FragmentModal] audio share toggle failed:', e.message);
      alert(vm.errMsg);
    } finally {
      setAudioBusy(false);
    }
  }

  async function handleDeleteAudio(order /* number | 'all' */) {
    if (!Array.isArray(audios) || audios.length === 0 || audioBusy) return;
    setAudioBusy(true);
    try {
      const path = order === 'all'
        ? `/api/fragments/${fragment.id}/audio`
        : `/api/fragments/${fragment.id}/audio?order=${order}`;
      const res = await authFetch(path, { method: 'DELETE' });
      if (res.ok) {
        // Reload audios after delete — simpler than splicing client-side
        // and keeps state consistent if any race occurred.
        const refreshRes = await authFetch(`/api/fragments/${fragment.id}/audio`);
        const refreshData = await refreshRes.json().catch(() => ({}));
        setAudios(Array.isArray(refreshData?.audios) ? refreshData.audios : []);
        setConfirmDeleteAudioOrder(null);
      } else {
        alert(vm.errMsg);
      }
    } catch (e) {
      console.warn('[FragmentModal] audio delete failed:', e.message);
      alert(vm.errMsg);
    } finally {
      setAudioBusy(false);
    }
  }

  function handleCopyAudioLink() {
    const first = Array.isArray(audios) ? audios[0] : null;
    if (!first?.public_token || typeof window === 'undefined') return;
    const url = `${window.location.origin}/listen/${first.public_token}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      },
      () => alert(vm.errMsg)
    );
  }

  async function handleToggleVisibility() {
    const newVis = currentVis === 'public' ? 'private' : 'public';
    setSaving(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibility: newVis }),
      });
      const data = await res.json();
      if (data.fragment) {
        setCurrentVis(data.fragment.visibility);
        onUpdated && onUpdated(data.fragment);
        setMode('view');
      } else {
        alert(vm.errMsg);
      }
    } catch {
      alert(vm.errMsg);
    } finally {
      setSaving(false);
    }
  }

  const headerSection = (
    <div className={s.modalHeader}>
      {!inline && (
        <button className={s.modalBackBtn} onClick={onClose}>
          {vm.backToList}
        </button>
      )}
      <div className={s.modalHeaderText}>
        <div className={s.modalTitle}>
          {mode === 'edit' ? vm.editMode : fragment.title}
        </div>
        {/* 🔥 2026-05-06 Tim — subtitle 숨김. 활용도 낮고 제목과
            중복되는 느낌. 데이터는 유지 (DB + edit form), 읽기 뷰에서面
            안 보일 뿐. */}
      </div>
    </div>
  );

  const bodyContent = (
    <div className={s.modalBody}>
          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <>
              <div className={s.modalVisibilityRow}>
                <span className={(currentVis === 'public') ? s.visibilityBadgePublicLg : s.visibilityBadgePrivateLg}>
                  {(currentVis === 'public') ? vm.publicBadge : vm.privateBadge}
                </span>
              </div>

              {/* 🆕 Task 95 — voice continuation + unified edit/append.
                  Voice still creates a child fragment via the Gemini
                  Live path (/chat?continueFragment=…). The "글 수정 /
                  이어쓰기" button now opens /write?fragmentId=… in EDIT
                  mode — the senior can revise existing words and append
                  new ones in the same surface (Tim's mental model:
                  "이어글쓰기'와 '페이지 수정'이 같아야 합니다").
                  🔥 Task 96 — when the modal is rendered from a book
                  question page (bookContext set), append fromBookId /
                  fromQuestionId so /write can route the user back to
                  the same question page on Cancel / Finish.
                  🔥 Task 97 — auto-fallback to fragment.book_id /
                  fragment.book_question_id when bookContext is absent.
                  Fixes Tim's "/my-stories → 책 fragment 글 수정 → 무한
                  루프" bug: a book-attached fragment now routes back
                  to its book regardless of where the modal was opened
                  from. Free-form fragments still default to /my-stories
                  because their book_id is NULL. */}
              <div className={s.continueRow}>
                <button
                  className={s.continueBtn}
                  onClick={() => router.push(`/chat?continueFragment=${fragment.id}`)}
                >
                  {vm.continueLabel}
                </button>
                <button
                  className={s.continueByWritingBtn}
                  onClick={() => {
                    const params = new URLSearchParams({ fragmentId: fragment.id });
                    const returnBookId =
                      bookContext?.bookId || fragment.book_id || null;
                    const returnQuestionId =
                      bookContext?.questionId || fragment.book_question_id || null;
                    if (returnBookId)     params.set('fromBookId',     returnBookId);
                    if (returnQuestionId) params.set('fromQuestionId', returnQuestionId);
                    router.push(`/write?${params.toString()}`);
                  }}
                >
                  {vm.continueByWritingLabel}
                </button>
              </div>
              <div className={s.continueHint}>{vm.continueHint}</div>

              <div className={s.modalContent}>
                <ReactMarkdown>{fragment.content || ''}</ReactMarkdown>
              </div>

              {/* 🔥 2026-05-06 Tim — 음성 섹션을 사진 섹션 위로 이동.
                  음성이 SayAndKeep 의 핵심 경험이고, 사진은 보조 용이라
                  이게 음성 남기면 사진 추가 수 있고 그 순서가 시니어에게 더
                  자연스럽고온 자리.
                  🔥 2026-05-06 Tim — multi-audio. Continuation 이어말하기 다음
                  두 번째 녹음이 도착하면 [녹음 1부] [녹음 2부] ... 함께
                  표시. QR/토글은 전체 단위로 작동. */}
              <div className={s.audioSection} style={{ marginTop: 16, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className={s.audioSectionLabel} style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  {vm.audioSectionLabel}
                  {Array.isArray(audios) && audios.length > 1 && (
                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, opacity: 0.6 }}>
                      — 총 {audios.length}개
                    </span>
                  )}
                </div>

                {audios === 'loading' && (
                  <div style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>
                    {vm.loading || '…'}
                  </div>
                )}

                {Array.isArray(audios) && audios.length === 0 && (
                  <div style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>
                    {vm.audioNoAudio}
                  </div>
                )}

                {Array.isArray(audios) && audios.length > 0 && (
                  <>
                    {/* 🔥 2026-05-06 Tim — N players, one per audio_order.
                        각 player 염에 "1부 / 2부 / 3부..." 라벨 표시.
                        position-based 라벨 (audio_order 는 1, 5, 7 같이 gap
                        이 있을 수 있으니 array index+1 이 더 안정적).

                        Audio src 는 R2 proxy URL (Chrome UrlSafetyCheck 대응,
                        Step 13 제거). 각 row 가 자체 public_token 을
                        가지므로 row 별 다른 URL. */}
                    {audios.map((a, idx) => {
                      const partLabel =
                        audios.length === 1
                          ? null
                          : (lang === 'EN' ? `Part ${idx + 1}` :
                             lang === 'ES' ? `Parte ${idx + 1}` :
                             `${idx + 1}부`);
                      return (
                        <div key={a.id} style={{ marginBottom: 14 }}>
                          {partLabel && (
                            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginBottom: 4 }}>
                              🎤 {partLabel}
                            </div>
                          )}
                          <audio
                            src={a.public_token ? `/api/audio/${a.public_token}` : a.r2_url}
                            controls
                            preload="metadata"
                            style={{ width: '100%', marginBottom: 4 }}
                          />
                          <div style={{ display: 'flex', gap: 12, fontSize: 12, opacity: 0.7, alignItems: 'center' }}>
                            <span>{vm.audioDuration(a.duration_sec || 0)}</span>
                            {a.play_count > 0 && (
                              <span>{vm.audioPlayCount(a.play_count)}</span>
                            )}
                            {audios.length > 1 && (
                              <button
                                onClick={() => setConfirmDeleteAudioOrder(a.audio_order)}
                                disabled={audioBusy}
                                style={{
                                  marginLeft: 'auto',
                                  fontSize: 11,
                                  padding: '3px 8px',
                                  background: 'transparent',
                                  border: '1px solid rgba(239,68,68,0.25)',
                                  borderRadius: 5,
                                  color: 'rgba(239,68,68,0.8)',
                                  cursor: audioBusy ? 'wait' : 'pointer',
                                  opacity: audioBusy ? 0.5 : 1,
                                }}
                              >
                                🗑 이 녹음 삭제
                              </button>
                            )}
                          </div>
                          {/* Per-audio delete confirm row */}
                          {confirmDeleteAudioOrder === a.audio_order && (
                            <div style={{ marginTop: 8, padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                              <div style={{ fontSize: 13, marginBottom: 8 }}>
                                {partLabel} 녹음을 삭제할까요? 이 동작은 되돌릴 수 없어요.
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => handleDeleteAudio(a.audio_order)}
                                  disabled={audioBusy}
                                  style={{
                                    padding: '6px 12px',
                                    background: 'rgba(239,68,68,0.85)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    opacity: audioBusy ? 0.6 : 1,
                                  }}
                                >
                                  {audioBusy ? vm.audioDeleting : '삭제'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteAudioOrder(null)}
                                  style={{
                                    padding: '6px 12px',
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    color: 'currentColor',
                                  }}
                                >
                                  {vm.cancelBtn}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 공유 토글 + QR 은 전체 단위. is_public 은 모든 audio rows
                        에서 동일 (PATCH 가 함께 update). audios[0] 을 reference
                        로 사용. */}
                    {(() => {
                      const isPublic = audios[0]?.is_public;
                      return isPublic ? (
                        <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
                          {vm.audioShareDesc}
                          <button
                            onClick={handleToggleAudioShare}
                            disabled={audioBusy}
                            style={{
                              display: 'inline-block',
                              marginLeft: 8,
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: 'none',
                              background: 'rgba(255,255,255,0.08)',
                              color: 'currentColor',
                              fontSize: 11,
                              cursor: audioBusy ? 'wait' : 'pointer',
                              opacity: audioBusy ? 0.5 : 0.85,
                            }}
                          >
                            {vm.audioShareToggleOn /* "공유 끌기" */}
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginBottom: 12 }}>
                          <button
                            onClick={handleToggleAudioShare}
                            disabled={audioBusy}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: 8,
                              border: 'none',
                              background: 'rgba(168,85,247,0.18)',
                              color: 'currentColor',
                              fontSize: 14,
                              fontWeight: 500,
                              cursor: audioBusy ? 'wait' : 'pointer',
                              opacity: audioBusy ? 0.6 : 1,
                            }}
                          >
                            {vm.audioShareToggleOff /* "가족과 공유하기" */}
                          </button>
                          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.4 }}>
                            {vm.audioShareDescOff}
                          </div>
                        </div>
                      );
                    })()}

                    {/* QR code — 1 QR per fragment, scan → /listen/[token]
                        → 모든 audio 순차 재생. */}
                    {audios[0]?.is_public && qrDataUrl && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 10, background: '#fff', borderRadius: 8, marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 6, fontWeight: 500 }}>
                          {vm.audioQrLabel}
                        </div>
                        <img src={qrDataUrl} alt="QR code" style={{ width: 140, height: 140 }} />
                        <button
                          onClick={handleCopyAudioLink}
                          style={{
                            marginTop: 6,
                            padding: '5px 10px',
                            border: '1px solid #ddd',
                            borderRadius: 6,
                            background: '#f5f5f5',
                            color: '#333',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {linkCopied ? vm.audioLinkCopied : vm.audioCopyLink}
                        </button>
                      </div>
                    )}

                    {/* Bulk delete (delete ALL audios). 개별 delete 는 모든
                        player 염 에 따로 있음. */}
                    {audios.length > 1 && confirmDeleteAudioOrder !== 'all' && (
                      <button
                        onClick={() => setConfirmDeleteAudioOrder('all')}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 6,
                          color: 'rgba(239,68,68,0.85)',
                          cursor: 'pointer',
                        }}
                      >
                        🗑 모든 녹음 삭제
                      </button>
                    )}
                    {audios.length === 1 && confirmDeleteAudioOrder !== 'all' && (
                      <button
                        onClick={() => setConfirmDeleteAudioOrder('all')}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          background: 'transparent',
                          border: '1px solid rgba(239,68,68,0.3)',
                          borderRadius: 6,
                          color: 'rgba(239,68,68,0.85)',
                          cursor: 'pointer',
                        }}
                      >
                        {vm.audioDelete}
                      </button>
                    )}
                    {confirmDeleteAudioOrder === 'all' && (
                      <div style={{ padding: 10, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                        <div style={{ fontSize: 13, marginBottom: 8 }}>
                          {audios.length > 1
                            ? `모든 녹음 (${audios.length}개) 을 삭제할까요? 이 동작은 되돌릴 수 없어요.`
                            : vm.audioDeleteConfirm}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleDeleteAudio('all')}
                            disabled={audioBusy}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(239,68,68,0.85)',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              opacity: audioBusy ? 0.6 : 1,
                            }}
                          >
                            {audioBusy ? vm.audioDeleting : vm.audioDeleteConfirmYes}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteAudioOrder(null)}
                            style={{
                              padding: '6px 12px',
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              color: 'currentColor',
                            }}
                          >
                            {vm.cancelBtn}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Photos (max 2) */}
              <div className={s.photosSection}>
                <div className={s.photosLabel}>
                  {lang === 'EN' ? '📷 Photos' : lang === 'ES' ? '📷 Fotos' : '📷 사진'}
                </div>
                <PhotoUploader
                  fragmentId={fragment.id}
                  lang={String(lang).toLowerCase()}
                  onChange={(photos) => onPhotosChanged && onPhotosChanged(fragment.id, photos)}
                />
              </div>

              {fragment.truncated && (
                <div className={s.truncatedBanner}>
                  <div className={s.truncatedBannerText}>
                    {vm.truncatedBannerText}
                  </div>
                  <button
                    className={s.regenerateBtn}
                    onClick={() => {
                      router.push(`/chat?topic=${encodeURIComponent(fragment.title)}&fromFragment=${fragment.id}`);
                    }}
                  >
                    {vm.continueWithEmma}
                  </button>
                </div>
              )}

              {/* Continuation thread (children of this fragment) */}
              {continuations.length > 0 && (
                <div className={s.threadSection}>
                  <div className={s.threadTitle}>{vm.threadTitle}</div>
                  {continuations.map((c, i) => (
                    <div key={c.id} className={s.threadItem}>
                      <div className={s.threadOrder}>#{c.thread_order ?? i + 1}</div>
                      <div className={s.threadContent}>
                        <ReactMarkdown>{c.content || ''}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tag chips suppressed (Task 76 #4); JSX kept for one-line revival */}
              {false && allTags.length > 0 && (
                <div className={s.modalTagSection}>
                  <div className={s.modalTagLabel}>{vm.tagsLabel}</div>
                  <div className={s.tagRow}>
                    {allTags.map((t, i) => (
                      <span key={i} className={`${s.tag} ${t.cls}`}>{t.text}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 🔥 2026-05-06 Tim — collections + actions 통합.
                  이전: 별도 collections 섹션 (라벨 + 빈상태 안내문 +
                    버튼) 다음에 modalActions 섹션 (공개 + 삭제).
                  현재: 라벨/빈상태 안내문 제거, chip 은 있을 때만 표시,
                    "모음집 추가 / 공개 변경 / 삭제" 3개 버튼을 한 줄에.
                  Continuation fragment 에는 모음집 버튼 자체가 안 보임
                  (continuations follow parent). */}
              {!fragment.parent_fragment_id && fragmentCollections.length > 0 && (
                <div className={s.collectionTags} style={{ marginTop: 12 }}>
                  {fragmentCollections.map(c => (
                    <span key={c.id} className={s.collectionTag}>📚 {c.name}</span>
                  ))}
                </div>
              )}

              <div
                className={s.modalActions}
                style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
              >
                {!fragment.parent_fragment_id && (
                  <button
                    className={s.addToCollectionBtn}
                    onClick={() => setShowPicker(true)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    📚 {vm.addToCollectionBtn}
                  </button>
                )}
                <button
                  className={s.visibilityBtn}
                  onClick={() => setMode('confirmVisibility')}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {currentVis === 'private' ? vm.toggleToPublic : vm.toggleToPrivate}
                </button>
                <button
                  className={s.deleteBtn}
                  onClick={() => setMode('confirmDelete')}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {vm.deleteFragment}
                </button>
              </div>
            </>
          )}

          {/* ── CONFIRM VISIBILITY CHANGE ── */}
          {mode === 'confirmVisibility' && (() => {
            const toPublic = currentVis === 'private';
            const bullets  = toPublic ? vm.bulletsToPub : vm.bulletsToPri;
            return (
              <>
                <div className={s.confirmTitle}>
                  {toPublic ? vm.confirmTitleToPub : vm.confirmTitleToPri}
                </div>
                <div className={s.confirmBody}>
                  {toPublic ? vm.confirmIntroToPub : vm.confirmIntroToPri}
                  <ul className={s.confirmList}>
                    {bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div className={s.confirmRow}>
                  <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
                  <button
                    className={s.visibilityBtn}
                    onClick={handleToggleVisibility}
                    disabled={saving}
                    style={{ flex: 1 }}
                  >
                    {saving ? vm.saving : (toPublic ? vm.confirmToPubBtn : vm.confirmToPriBtn)}
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── CONFIRM DELETE ── */}
          {mode === 'confirmDelete' && (
            <>
              <div className={s.confirmMsg}>{vm.confirmDeleteFragment}</div>
              <div className={s.confirmRow}>
                <button className={s.deleteBtn} onClick={handleDelete} disabled={saving}
                  style={{ flex: 1 }}>
                  {saving ? vm.deletingMsg : vm.confirmDeleteYes}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <>
              <input
                className={s.editInput}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder={vm.editTitlePlaceholder}
              />
              <input
                className={s.editInput}
                value={editSubtitle}
                onChange={e => setEditSub(e.target.value)}
                placeholder={vm.editSubtitlePlaceholder}
              />
              <textarea
                className={s.editArea}
                value={editContent}
                onChange={e => setEditCont(e.target.value)}
                placeholder={vm.editContentPlaceholder}
              />
              <div className={s.modalActions}>
                <button className={s.saveBtn} onClick={handleSave}
                  disabled={saving || !editTitle.trim() || !editContent.trim()}>
                  {saving ? vm.savingMsg : vm.saveBtn}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
              </div>
            </>
          )}
    </div>
  );

  const picker = showPicker && (
    <FragmentCollectionPicker
      fragmentId={fragment.id}
      currentCollectionIds={fragmentCollections.map(c => c.id)}
      lang={lang}
      onClose={() => setShowPicker(false)}
      onChanged={reloadFragmentMeta}
    />
  );

  if (inline) {
    return (
      <>
        <div className={s.inlineContainer}>
          <div className={s.inlineBody}>
            {headerSection}
            {bodyContent}
          </div>
        </div>
        {picker}
      </>
    );
  }

  return (
    <>
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <div className={s.modalHandle} />
          {headerSection}
          {bodyContent}
        </div>
      </div>
      {picker}
    </>
  );
}
