'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import s from './page.module.css';

// ── Visibility (Private/Public) 다국어 카피 ────────────────────────────────
const VIS_MSGS = {
  KO: {
    privateBadge     : '🔒 Private',
    publicBadge      : '🌐 Public',
    toggleToPublic   : '🌐 Public으로 변경',
    toggleToPrivate  : '🔒 Private으로 되돌리기',
    confirmTitleToPub: 'Public으로 바꾸시겠어요?',
    confirmTitleToPri: 'Private으로 되돌리시겠어요?',
    confirmIntroToPub: '이 이야기를 Public으로 변경하면:',
    confirmIntroToPri: '이 이야기를 Private으로 변경하면:',
    bulletsToPub     : ['가족과 공유할 수 있게 됩니다', '책으로 만들 수 있게 됩니다', '언제든 다시 Private으로 되돌릴 수 있습니다'],
    bulletsToPri     : ['공유된 책에서 제외됩니다', '누구에게도 다시 보이지 않게 됩니다'],
    cancelBtn        : '취소',
    confirmToPubBtn  : 'Public으로 변경',
    confirmToPriBtn  : 'Private으로 변경',
    saving           : '변경 중…',
    errMsg           : '변경에 실패했습니다. 다시 시도해주세요.',
    continueLabel    : '💬 이어서 말하기',
    continueHint     : '원본은 그대로 두고, 이 이야기에 새로운 내용을 추가합니다.',
    threadTitle      : '추가된 이야기',
  },
  EN: {
    privateBadge     : '🔒 Private',
    publicBadge      : '🌐 Public',
    toggleToPublic   : '🌐 Make Public',
    toggleToPrivate  : '🔒 Make Private again',
    confirmTitleToPub: 'Make this story Public?',
    confirmTitleToPri: 'Return this story to Private?',
    confirmIntroToPub: 'If you make this Public:',
    confirmIntroToPri: 'If you make this Private:',
    bulletsToPub     : ['You can share it with family', 'It can be included in a book', 'You can switch it back to Private anytime'],
    bulletsToPri     : ['It will be removed from shared books', 'No one else will be able to see it'],
    cancelBtn        : 'Cancel',
    confirmToPubBtn  : 'Make Public',
    confirmToPriBtn  : 'Make Private',
    saving           : 'Updating…',
    errMsg           : 'Could not update. Please try again.',
    continueLabel    : '💬 Add to this story',
    continueHint     : 'The original stays untouched — your new words will be added as a continuation.',
    threadTitle      : 'Added later',
  },
  ES: {
    privateBadge     : '🔒 Privado',
    publicBadge      : '🌐 Público',
    toggleToPublic   : '🌐 Hacer público',
    toggleToPrivate  : '🔒 Volver a privado',
    confirmTitleToPub: '¿Hacer pública esta historia?',
    confirmTitleToPri: '¿Volver a privada esta historia?',
    confirmIntroToPub: 'Si la haces pública:',
    confirmIntroToPri: 'Si la haces privada:',
    bulletsToPub     : ['Podrás compartirla con tu familia', 'Podrá incluirse en un libro', 'Puedes volver a privada cuando quieras'],
    bulletsToPri     : ['Se retirará de los libros compartidos', 'Nadie más podrá verla'],
    cancelBtn        : 'Cancelar',
    confirmToPubBtn  : 'Hacer pública',
    confirmToPriBtn  : 'Hacer privada',
    saving           : 'Actualizando…',
    errMsg           : 'No se pudo actualizar. Inténtalo de nuevo.',
    continueLabel    : '💬 Añadir a esta historia',
    continueHint     : 'El original queda intacto — tus nuevas palabras se añadirán como continuación.',
    threadTitle      : 'Añadido después',
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

// ── Sample community stories (Task 2) ──────────────────────────────────────
const SAMPLE_STORIES = [
  {
    id      : 'sample-1',
    title   : '할머니의 된장찌개',
    subtitle: '맛보다 더 깊은 것들',
    content : `할머니 집에 가면 항상 그 냄새가 먼저였다. 된장이 부글부글 끓는 소리, 파가 지글거리는 소리. 문을 열기도 전에 배가 고파졌다.

할머니는 된장을 직접 담그셨다. 매년 봄이면 마당 한켠 장독대 앞에 쪼그려 앉아 항아리를 열어보셨는데, 그 모습이 마치 작은 의식 같았다. 나는 그 옆에서 흙장난을 하다 말고 슬금슬금 다가가 냄새를 맡곤 했다. 퀴퀴하면서도 구수한, 뭐라 설명하기 어려운 냄새.

지금 나는 마흔셋이고 할머니는 오래전 돌아가셨다. 된장찌개를 끓일 때마다 그 마당이 생각난다. 흙냄새, 장독의 서늘함, 할머니의 손등에 있던 주름들. 음식은 참 묘하다. 혀가 기억하는 게 아니라, 온몸이 기억한다.

그날 이후로 나는 아이들에게 된장찌개를 가르치고 있다. 언젠가 내가 없어도, 이 냄새만큼은 남아있으면 좋겠다고 생각하면서.`,
    tags    : ['가족', '추억', '음식', '할머니'],
    preview : '할머니 집에 가면 항상 그 냄새가 먼저였다. 된장이 부글부글 끓는 소리, 파가 지글거리는 소리.',
  },
  {
    id      : 'sample-2',
    title   : '첫 출근의 넥타이',
    subtitle: '아버지가 매주신 매듭',
    content : `스물두 살 첫 출근 날, 나는 넥타이를 맬 줄 몰랐다.

전날 밤 유튜브를 보며 20번쯤 연습했지만 아침에 거울 앞에 서니 손이 떨렸다. 그때 문이 열리더니 아버지가 들어오셨다. 말없이 내 앞에 서서 넥타이를 잡으셨다. 굵고 거칠었던 손. 공사판에서 30년을 일하신 손.

"반 하프 윈저. 이게 제일 믿음직스러워 보여."

아버지는 내 넥타이를 매주시면서 그 한마디만 하셨다. 그런데 그 말이 내내 마음에 걸렸다. 믿음직스러워 보인다는 게 그날 내게 가장 필요한 말이었으니까.

회사를 그만두고 창업을 했을 때도, 힘든 날 혼자 넥타이를 매면서 그 손의 감촉을 생각했다. 이제는 나도 아버지처럼 아이에게 넥타이 매는 법을 가르쳐 주는 날을 기다리고 있다.`,
    tags    : ['아버지', '첫 경험', '직장', '성장'],
    preview : '스물두 살 첫 출근 날, 나는 넥타이를 맬 줄 몰랐다. 전날 밤 유튜브를 보며 20번쯤 연습했지만…',
  },
  {
    id      : 'sample-3',
    title   : '딸이 처음 걸었던 날',
    subtitle: '11걸음',
    content : `딸이 걷기 시작한 건 14개월째 되던 토요일 오후였다.

아내와 나는 거실 양 끝에 앉아 서로를 바라보고 있었다. 딸은 그 사이에서 소파 모서리를 잡고 망설이고 있었다. 우리는 숨을 참았다.

한 걸음. 두 걸음. 세 걸음. 네 걸음에서 엉덩방아를 찧었다가 다시 일어났다. 다섯, 여섯, 일곱… 열한 걸음. 내 품에 와서 쿵 하고 안겼다.

나는 그 순간 울었다. 아내도 울었다. 딸은 영문을 모르고 우리 얼굴을 번갈아 보다가 자기도 따라 울었다. 셋이서 거실 바닥에 앉아 한참을 울었다.

그 열한 걸음이 나한테는 아직도 선명하다. 살면서 그보다 더 극적인 장면을 본 적이 없다. 열한 걸음. 그게 전부였는데. 그게 전부인데도 세상이 달라 보였다.`,
    tags    : ['자녀', '가족', '행복', '육아'],
    preview : '딸이 걷기 시작한 건 14개월째 되던 토요일 오후였다. 아내와 나는 거실 양 끝에 앉아 서로를 바라보고 있었다.',
  },
];

// ── helpers ────────────────────────────────────────────────────
function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function authFetch(url, opts = {}) {
  const token = getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

function preview(text, max = 100) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Status label helpers ────────────────────────────────────────
const BOOK_STATUS = {
  pending  : { msg: 'ebook을 준비 중입니다 (24시간 내)', cls: 'pendingMsg',   card: 'pending'   },
  generating: { msg: 'ebook을 생성 중입니다…',           cls: 'pendingMsg',   card: 'pending'   },
  review   : { msg: 'ebook 검수 중입니다',               cls: 'reviewMsg',    card: 'review'    },
  completed: { msg: 'ebook이 준비되었습니다!',           cls: 'completedMsg', card: 'completed' },
  published: { msg: 'ebook이 준비되었습니다!',           cls: 'completedMsg', card: 'completed' },
};

// ── Spinner ─────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className={s.spinner}>
      <div className={s.spinnerDot} />
      <div className={s.spinnerDot} />
      <div className={s.spinnerDot} />
    </div>
  );
}

// ── Fragment Detail Modal ────────────────────────────────────────
// ── Sample Story Modal (Task 2) ─────────────────────────────────────────────
function SampleStoryModal({ story, onClose }) {
  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>{story.title}</div>
            {story.subtitle && <div className={s.modalSubtitle}>{story.subtitle}</div>}
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          <div className={s.modalContent}>
            <ReactMarkdown>{story.content || ''}</ReactMarkdown>
          </div>
          {story.tags?.length > 0 && (
            <div className={s.modalTagSection}>
              <div className={s.modalTagLabel}>태그</div>
              <div className={s.tagRow}>
                {story.tags.map((t, i) => (
                  <span key={i} className={`${s.tag} ${s.tagTheme}`}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sample Gallery (Task 2) ──────────────────────────────────────────────────
function SampleGallery({ onStartChat }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className={s.sampleSection}>
      <div className={s.sectionTitle} style={{ paddingTop: 0 }}>다른 분들의 이야기</div>
      <div className={s.sampleDesc}>
        엠마와 나눈 대화에서 탄생한 실제 이야기들이에요.
      </div>
      <div className={s.cardList}>
        {SAMPLE_STORIES.map(story => (
          <div key={story.id} className={`${s.card} ${s.sampleCard}`}
            onClick={() => setSelected(story)}>
            <div className={s.cardHeader}>
              <div className={s.cardTitle}>{story.title}</div>
              <span className={`${s.statusBadge} ${s.statusConfirmed}`}>샘플</span>
            </div>
            {story.subtitle && <div className={s.cardSubtitle}>{story.subtitle}</div>}
            <div className={s.cardPreview}>{story.preview}</div>
            <div className={s.cardFooter}>
              <div className={s.tagRow}>
                {(story.tags || []).slice(0, 3).map((t, i) => (
                  <span key={i} className={`${s.tag} ${s.tagTheme}`}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className={s.startChatBtn} onClick={onStartChat}>
        ✏️ 나도 이야기 남기기
      </button>

      {selected && (
        <SampleStoryModal story={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Fragment Modal ─────────────────────────────────────────────────────────
function FragmentModal({ fragment, onClose, onUpdated, onDeleted, lang = 'KO' }) {
  const router = useRouter();
  const [mode, setMode]           = useState('view');  // 'view' | 'edit' | 'confirmDelete' | 'confirmVisibility'
  const [editTitle, setEditTitle] = useState(fragment.title || '');
  const [editSubtitle, setEditSub] = useState(fragment.subtitle || '');
  const [editContent, setEditCont] = useState(fragment.content || '');
  const [saving, setSaving]       = useState(false);
  const [currentVis, setCurrentVis] = useState(fragment.visibility || 'private');
  const [continuations, setContinuations] = useState(fragment.continuations || []);
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;

  // 🆕 2026-04-25: Load continuations (thread children) when modal opens
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/fragments/${fragment.id}`);
        const data = await res.json();
        if (!cancelled && data?.fragment?.continuations) {
          setContinuations(data.fragment.continuations);
        }
      } catch (e) {
        console.warn('[FragmentModal] continuations load failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [fragment.id]);

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
      if (data.fragment) { onUpdated(data.fragment); setMode('view'); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await authFetch(`/api/fragments/${fragment.id}`, { method: 'DELETE' });
      onDeleted(fragment.id);
    } finally {
      setSaving(false);
    }
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
        onUpdated(data.fragment);
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

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />

        {/* Header */}
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>
              {mode === 'edit' ? '편집' : fragment.title}
            </div>
            {mode === 'view' && fragment.subtitle && (
              <div className={s.modalSubtitle}>{fragment.subtitle}</div>
            )}
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalBody}>
          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <>
              <div className={s.modalVisibilityRow}>
                <span className={(currentVis === 'public') ? s.visibilityBadgePublicLg : s.visibilityBadgePrivateLg}>
                  {(currentVis === 'public') ? vm.publicBadge : vm.privateBadge}
                </span>
              </div>

              {/* 🆕 2026-04-25: Continue button moved here — right under title/visibility,
                  so users don't need to scroll past long fragments to find it. */}
              <button
                className={s.continueBtn}
                onClick={() => router.push(`/chat?continueFragment=${fragment.id}`)}
              >
                {vm.continueLabel}
              </button>
              <div className={s.continueHint}>{vm.continueHint}</div>

              <div className={s.modalContent}>
                <ReactMarkdown>{fragment.content || ''}</ReactMarkdown>
              </div>

              {fragment.truncated && (
                <div className={s.truncatedBanner}>
                  <div className={s.truncatedBannerText}>
                    이 이야기는 중간에 끊겼어요. Emma와 이어서 이야기해볼까요?
                  </div>
                  <button
                    className={s.regenerateBtn}
                    onClick={() => {
                      router.push(`/chat?topic=${encodeURIComponent(fragment.title)}&fromFragment=${fragment.id}`);
                    }}
                  >
                    Emma와 이어서 이야기하기
                  </button>
                </div>
              )}

              {allTags.length > 0 && (
                <div className={s.modalTagSection}>
                  <div className={s.modalTagLabel}>태그</div>
                  <div className={s.tagRow}>
                    {allTags.map((t, i) => (
                      <span key={i} className={`${s.tag} ${t.cls}`}>{t.text}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 🆕 2026-04-25: Continuation thread display */}
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

              <div className={s.modalActions}>
                <button className={s.editBtn} onClick={() => setMode('edit')}>편집</button>
                <button className={s.visibilityBtn} onClick={() => setMode('confirmVisibility')}>
                  {currentVis === 'private' ? vm.toggleToPublic : vm.toggleToPrivate}
                </button>
                <button className={s.deleteBtn} onClick={() => setMode('confirmDelete')}>삭제</button>
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
              <div className={s.confirmMsg}>정말 이 이야기를 삭제할까요? 되돌릴 수 없습니다.</div>
              <div className={s.confirmRow}>
                <button className={s.deleteBtn} onClick={handleDelete} disabled={saving}
                  style={{ flex: 1 }}>
                  {saving ? '삭제 중…' : '네, 삭제합니다'}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>취소</button>
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
                placeholder="제목"
              />
              <input
                className={s.editInput}
                value={editSubtitle}
                onChange={e => setEditSub(e.target.value)}
                placeholder="부제 (선택)"
              />
              <textarea
                className={s.editArea}
                value={editContent}
                onChange={e => setEditCont(e.target.value)}
                placeholder="이야기 내용"
              />
              <div className={s.modalActions}>
                <button className={s.saveBtn} onClick={handleSave}
                  disabled={saving || !editTitle.trim() || !editContent.trim()}>
                  {saving ? '저장 중…' : '저장'}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>취소</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ebook Request Modal ──────────────────────────────────────────
function EbookModal({ fragments, onClose, onSuccess }) {
  const [title, setTitle]           = useState('나의 이야기');
  const [dedication, setDedication] = useState('');
  const [autoPreface, setAutoPreface]   = useState(true);
  const [autoEpilogue, setAutoEpilogue] = useState(true);
  const [selectedIds, setSelectedIds]   = useState(() =>
    new Set(fragments.map(f => f.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  function toggleFragment(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === fragments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(fragments.map(f => f.id)));
    }
  }

  async function handleSubmit() {
    if (!title.trim() || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/books/request', {
        method: 'POST',
        body: JSON.stringify({
          title       : title.trim(),
          dedication  : dedication.trim() || null,
          autoPreface,
          autoEpilogue,
          fragmentIds : [...selectedIds],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = selectedIds.size === fragments.length;

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />

        <div className={s.modalHeader}>
          <div className={s.modalTitle}>ebook 신청</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalBody}>
          {done ? (
            <div className={s.successBox}>
              <div className={s.successIcon}>📖</div>
              <div className={s.successTitle}>ebook 신청이 완료되었습니다.</div>
              <div className={s.successDesc}>
                24시간 내에 정리하여 다운로드 가능합니다.{'\n'}
                완성되면 상태가 업데이트됩니다.
              </div>
            </div>
          ) : (
            <>
              {/* Title */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>ebook 제목</label>
                <input
                  className={s.formInput}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="나의 이야기"
                />
              </div>

              {/* Dedication */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>헌사 (선택)</label>
                <textarea
                  className={`${s.formInput} ${s.formTextarea}`}
                  value={dedication}
                  onChange={e => setDedication(e.target.value)}
                  placeholder="예: 사랑하는 가족에게…"
                />
              </div>

              {/* Options */}
              <div className={s.checkGroup}>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={autoPreface}
                    onChange={e => setAutoPreface(e.target.checked)} />
                  머리말 자동 생성
                </label>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={autoEpilogue}
                    onChange={e => setAutoEpilogue(e.target.checked)} />
                  맺음말 자동 생성
                </label>
              </div>

              {/* Fragment selection */}
              <div className={s.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={s.formLabel}>
                    포함할 이야기 ({selectedIds.size}/{fragments.length})
                  </label>
                  <button
                    onClick={toggleAll}
                    style={{ background: 'none', border: 'none', fontSize: 12,
                      color: '#ea580c', cursor: 'pointer', fontWeight: 600 }}>
                    {allSelected ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className={s.fragmentPicker}>
                  {fragments.map(f => (
                    <div key={f.id} className={s.fragmentPickerItem}
                      onClick={() => toggleFragment(f.id)}>
                      <input type="checkbox" readOnly
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleFragment(f.id)} />
                      <span className={s.fragmentPickerName}>{f.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className={s.ctaBtn}
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || selectedIds.size === 0}>
                {submitting ? '신청 중…' : '신청하기'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function MyStoriesPage() {
  const router = useRouter();
  const lang   = useLang();

  const [fragments, setFragments]   = useState([]);
  const [books, setBooks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);   // fragment for detail modal
  const [showEbook, setShowEbook]   = useState(false);
  const [toast, setToast]           = useState('');
  const toastTimer = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  // ── Data loading ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }

    setLoading(true);
    try {
      const [fragRes, bookRes] = await Promise.all([
        authFetch('/api/fragments?status=draft,confirmed&limit=100'),
        authFetch('/api/books/status'),
      ]);

      if (fragRes.status === 401 || bookRes.status === 401) {
        router.replace('/login');
        return;
      }

      const fragData = await fragRes.json();
      const bookData = await bookRes.json();

      setFragments(fragData.fragments || []);
      setBooks(bookData.books || []);
    } catch (e) {
      console.error(e);
      showToast('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Callbacks ────────────────────────────────────────────────
  function handleUpdated(updated) {
    setFragments(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (selected?.id === updated.id) setSelected(updated);
    showToast('저장되었습니다.');
  }

  function handleDeleted(id) {
    setFragments(prev => prev.filter(f => f.id !== id));
    setSelected(null);
    showToast('삭제되었습니다.');
  }

  function handleEbookSuccess() {
    // Refresh books after a moment
    setTimeout(loadAll, 1200);
  }

  // ── Stats ────────────────────────────────────────────────────
  const totalChars = fragments.reduce((sum, f) => sum + (f.word_count || f.content?.length || 0), 0);
  const lastCreated = fragments.length > 0
    ? fmtDateShort(fragments.reduce((latest, f) =>
        f.created_at > latest ? f.created_at : latest, fragments[0].created_at))
    : '—';

  // ── Render ───────────────────────────────────────────────────
  const confirmedFragments = fragments.filter(f => f.status === 'confirmed');
  const draftFragments     = fragments.filter(f => f.status === 'draft');

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => router.back()}>‹</button>
          <span className={s.pageTitle}>나의 이야기들</span>
        </div>
        <button className={s.refreshBtn} onClick={loadAll} title="새로고침">↻</button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* ── Stats Bar ── */}
          <div className={s.statsBar}>
            <div className={s.statItem}>
              <div className={s.statValue}>{fragments.length}</div>
              <div className={s.statLabel}>이야기</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statValue}>
                {totalChars >= 1000 ? `${(totalChars / 1000).toFixed(1)}k` : totalChars}
              </div>
              <div className={s.statLabel}>글자 수</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statValue} style={{ fontSize: 14 }}>{lastCreated}</div>
              <div className={s.statLabel}>최근 생성</div>
            </div>
          </div>

          {/* ── Confirmed Fragments ── */}
          {confirmedFragments.length > 0 && (
            <>
              <div className={s.sectionTitle}>완성된 이야기</div>
              <div className={s.cardList}>
                {confirmedFragments.map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
              </div>
            </>
          )}

          {/* ── Draft Fragments ── */}
          {draftFragments.length > 0 && (
            <>
              <div className={s.sectionTitle}>초안</div>
              <div className={s.cardList}>
                {draftFragments.map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
              </div>
            </>
          )}

          {/* ── Empty State ── */}
          {fragments.length === 0 && (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>📝</div>
              <div className={s.emptyTitle}>아직 이야기가 없어요</div>
              <div className={s.emptyDesc}>
                엠마와 대화하다 보면<br />소중한 이야기들이 자동으로 모입니다.
              </div>
            </div>
          )}

          {/* ── Sample Gallery (Task 2) ── */}
          <SampleGallery onStartChat={() => router.push('/chat')} />

          {/* ── Ebook Section ── */}
          <div className={s.ebookSection}>
            <div className={s.ebookSectionTitle}>📖 나만의 ebook</div>
            <div className={s.ebookSectionDesc}>
              이야기들을 모아 PDF ebook으로 만들어 드립니다.
            </div>

            {/* Existing books */}
            {books.length > 0 && (
              <div className={s.ebookStatusList}>
                {books.map(book => {
                  const info = BOOK_STATUS[book.status] || BOOK_STATUS.pending;
                  return (
                    <div key={book.id} className={`${s.ebookStatusCard} ${s[info.card]}`}>
                      <div className={s.ebookStatusTitle}>{book.title}</div>
                      <div className={`${s.ebookStatusMsg} ${s[info.cls]}`}>{info.msg}</div>
                      {(book.status === 'completed' || book.status === 'published') && book.has_output && (
                        <button className={s.downloadBtn}
                          onClick={() => handleDownload(book.id, book.title)}>
                          ↓ PDF 다운로드
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className={s.ctaBtn}
              onClick={() => setShowEbook(true)}
              disabled={fragments.length === 0}>
              {fragments.length === 0 ? 'ebook 신청 (이야기가 없음)' : 'ebook 신청'}
            </button>
          </div>
        </>
      )}

      {/* ── Fragment Detail Modal ── */}
      {selected && (
        <FragmentModal
          fragment={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          lang={lang}
        />
      )}

      {/* ── Ebook Request Modal ── */}
      {showEbook && (
        <EbookModal
          fragments={fragments}
          onClose={() => setShowEbook(false)}
          onSuccess={handleEbookSuccess}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

// ── Fragment Card ────────────────────────────────────────────────
function FragmentCard({ fragment: f, onClick, lang = 'KO' }) {
  const router = useRouter();
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const topTags = [
    ...(f.tags_theme   || []).slice(0, 2).map(t => ({ text: t, cls: 'tagTheme' })),
    ...(f.tags_emotion || []).slice(0, 1).map(t => ({ text: t, cls: 'tagEmotion' })),
    ...(f.tags_people  || []).slice(0, 1).map(t => ({ text: t, cls: 'tagPeople' })),
  ].slice(0, 3);

  function handleRegenerate(e) {
    e.stopPropagation();
    router.push(`/chat?topic=${encodeURIComponent(f.title)}&fromFragment=${f.id}`);
  }

  return (
    <div className={s.card} onClick={onClick}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}>
          {f.truncated && <span className={s.truncatedIcon} title="이야기가 중간에 끊겼어요">⚠️</span>}
          {f.title}
        </div>
        <div className={s.cardHeaderBadges}>
          <span className={(f.visibility === 'public') ? s.visibilityBadgePublic : s.visibilityBadgePrivate}>
            {(f.visibility === 'public') ? vm.publicBadge : vm.privateBadge}
          </span>
          <span className={`${s.statusBadge} ${f.status === 'confirmed' ? s.statusConfirmed : s.statusDraft}`}>
            {f.status === 'confirmed' ? '완성' : '초안'}
          </span>
        </div>
      </div>

      {f.subtitle && <div className={s.cardSubtitle}>{f.subtitle}</div>}

      <div className={s.cardPreview}>{preview(f.content, 100)}</div>

      <div className={s.cardFooter}>
        <span className={s.cardDate}>{fmtDateShort(f.created_at)}</span>
        {topTags.length > 0 && (
          <div className={s.tagRow}>
            {topTags.map((t, i) => (
              <span key={i} className={`${s.tag} ${s[t.cls]}`}>{t.text}</span>
            ))}
          </div>
        )}
      </div>

      {f.truncated && (
        <div className={s.truncatedBanner}>
          <div className={s.truncatedBannerText}>이야기가 중간에 끊겼어요.</div>
          <button className={s.regenerateBtn} onClick={handleRegenerate}>
            Emma와 이어서 이야기하기
          </button>
        </div>
      )}
    </div>
  );
}

// ── Download helper ──────────────────────────────────────────────
async function handleDownload(bookId, title) {
  const token = getToken();
  try {
    const res = await fetch(`/api/books/download/${bookId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { alert('다운로드에 실패했습니다.'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title || 'ebook'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert('다운로드 중 오류가 발생했습니다.');
  }
}
