'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import s from './page.module.css';

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
function FragmentModal({ fragment, onClose, onUpdated, onDeleted }) {
  const [mode, setMode]           = useState('view');  // 'view' | 'edit' | 'confirmDelete'
  const [editTitle, setEditTitle] = useState(fragment.title || '');
  const [editSubtitle, setEditSub] = useState(fragment.subtitle || '');
  const [editContent, setEditCont] = useState(fragment.content || '');
  const [saving, setSaving]       = useState(false);

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
              <div className={s.modalContent}>{fragment.content}</div>

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

              <div className={s.modalActions}>
                <button className={s.editBtn} onClick={() => setMode('edit')}>편집</button>
                <button className={s.deleteBtn} onClick={() => setMode('confirmDelete')}>삭제</button>
              </div>
            </>
          )}

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
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} />
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
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} />
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
function FragmentCard({ fragment: f, onClick }) {
  const topTags = [
    ...(f.tags_theme   || []).slice(0, 2).map(t => ({ text: t, cls: 'tagTheme' })),
    ...(f.tags_emotion || []).slice(0, 1).map(t => ({ text: t, cls: 'tagEmotion' })),
    ...(f.tags_people  || []).slice(0, 1).map(t => ({ text: t, cls: 'tagPeople' })),
  ].slice(0, 3);

  return (
    <div className={s.card} onClick={onClick}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}>{f.title}</div>
        <span className={`${s.statusBadge} ${f.status === 'confirmed' ? s.statusConfirmed : s.statusDraft}`}>
          {f.status === 'confirmed' ? '완성' : '초안'}
        </span>
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
