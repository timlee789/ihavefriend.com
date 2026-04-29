'use client';

/**
 * /book/[bookId]/customize — let the user freely shape their book.
 *
 * Storyworth can't do this. The user can rename / add / delete any
 * chapter or question. Answers are protected: deleting a question
 * with answers prompts the user to choose between
 *   • "답변 보존하고 삭제" → fragment.book_id=NULL (becomes a free
 *     fragment in /my-stories)
 *   • "답변과 함께 삭제" → user_book_responses dropped, fragment row
 *     itself stays but is no longer wired to a live book question
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUserLang, titleOf as i18nTitleOf } from '@/lib/i18nHelper';
import s from './page.module.css';

// Module-scoped wrapper so both the main component and the modal
// sub-components below can call titleOf(v) without each one having to
// pipe `lang` through props. getUserLang() reads from localStorage on
// the client; on the server it falls back to 'ko' which is fine because
// this page is 'use client'.
const titleOf = (v) => i18nTitleOf(v, getUserLang());

export default function CustomizePage() {
  const router = useRouter();
  const { bookId } = useParams();
  const [chapters, setChapters] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading]   = useState(true);
  const [editingCh, setEditingCh] = useState(null);
  const [editingQ,  setEditingQ]  = useState(null);
  const [adding,    setAdding]    = useState(null);     // {type:'chapter'} | {type:'question', chapterId}
  const [confirmDel, setConfirmDel] = useState(null);   // {type, id, title, questionCount?, fragmentCount?}

  const load = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }

    setLoading(true);
    try {
      const progress = await fetch(`/api/book/${bookId}/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      const list = progress?.chapters || [];
      const details = await Promise.all(
        list.map(ch => fetch(`/api/book/${bookId}/chapter/${ch.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).then(d => d.chapter).catch(() => null))
      );
      setChapters(details.filter(Boolean));
    } catch (e) {
      console.error('[customize] load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [bookId, router]);

  useEffect(() => { load(); }, [load]);

  const apiCall = async (path, method, body) => {
    const token = localStorage.getItem('token');
    const opts = { method, headers: { Authorization: `Bearer ${token}` } };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  // ── handlers ──
  const handleAddChapter = async (title, firstQuestion) => {
    await apiCall(`/api/book/${bookId}/chapter`, 'POST', { title, firstQuestion });
    setAdding(null);
    load();
  };
  const handleEditChapter = async (chId, title) => {
    await apiCall(`/api/book/${bookId}/chapter/${chId}`, 'PATCH', { title });
    setEditingCh(null);
    load();
  };
  const handleDeleteChapter = async (chId, preserve) => {
    const qs = `preserve=${preserve}&force=true`;
    await apiCall(`/api/book/${bookId}/chapter/${chId}?${qs}`, 'DELETE');
    setConfirmDel(null);
    load();
  };
  const handleAddQuestion = async (chId, prompt, hint) => {
    await apiCall(`/api/book/${bookId}/chapter/${chId}/question`, 'POST', { prompt, hint });
    setAdding(null);
    load();
  };
  const handleEditQuestion = async (qId, prompt, hint) => {
    await apiCall(`/api/book/${bookId}/question/${qId}`, 'PATCH', { prompt, hint });
    setEditingQ(null);
    load();
  };
  const handleDeleteQuestion = async (qId, preserve) => {
    const qs = `preserve=${preserve}&force=true`;
    await apiCall(`/api/book/${bookId}/question/${qId}?${qs}`, 'DELETE');
    setConfirmDel(null);
    load();
  };

  if (loading) return <div className={s.loading}>불러오는 중…</div>;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push(`/book/${bookId}`)}>← 책 홈</button>
      </header>

      <h1 className={s.title}>✏️ 책 구조 만들기</h1>
      <p className={s.intro}>
        챕터와 질문을 자유롭게 추가, 수정, 삭제할 수 있어요.<br />
        답변이 있는 질문을 삭제하면 답변은 자유 이야기로 보존돼요.
      </p>

      <div className={s.chapterList}>
        {chapters.map(ch => (
          <div key={ch.id} className={s.chapterBlock}>
            <div className={s.chapterHeader}>
              <button
                className={s.chapterToggle}
                onClick={() => setExpanded(p => ({ ...p, [ch.id]: !p[ch.id] }))}
              >
                {expanded[ch.id] ? '▼' : '▶'} 📖 {ch.order}. {titleOf(ch.title)}
                {ch.is_custom && <span className={s.customBadge}>✏️ Custom</span>}
              </button>
              <div className={s.chapterActions}>
                <button onClick={() => setEditingCh(ch)} title="수정">✏️</button>
                <button
                  onClick={() => setConfirmDel({
                    type: 'chapter',
                    id: ch.id,
                    title: titleOf(ch.title),
                    questionCount: (ch.questions || []).length,
                    answeredCount: (ch.questions || []).filter(q => q.response_status && q.response_status !== 'empty').length,
                  })}
                  title="삭제"
                >🗑️</button>
              </div>
            </div>

            {expanded[ch.id] && (
              <div className={s.questionList}>
                {(ch.questions || []).map(q => (
                  <div key={q.id} className={s.questionRow}>
                    <span className={s.qOrder}>{q.order}.</span>
                    <span className={s.qPrompt}>{titleOf(q.prompt)}</span>
                    <div className={s.qActions}>
                      <button onClick={() => setEditingQ({ ...q, chapterId: ch.id })} title="수정">✏️</button>
                      <button
                        onClick={() => setConfirmDel({
                          type: 'question',
                          id: q.id,
                          title: titleOf(q.prompt),
                          fragmentCount: q.fragment_count || 0,
                        })}
                        title="삭제"
                      >🗑️</button>
                    </div>
                  </div>
                ))}
                <button
                  className={s.addQuestionBtn}
                  onClick={() => setAdding({ type: 'question', chapterId: ch.id })}
                >
                  + 질문 추가
                </button>
              </div>
            )}
          </div>
        ))}

        <button className={s.addChapterBtn} onClick={() => setAdding({ type: 'chapter' })}>
          ⬇️ 챕터 추가
        </button>
      </div>

      <div className={s.bottomActions}>
        <button className={s.doneBtn} onClick={() => router.push(`/book/${bookId}`)}>
          ✓ 저장하고 책 홈으로
        </button>
      </div>

      {/* Modals */}
      {adding?.type === 'chapter' && (
        <ChapterAddModal onAdd={handleAddChapter} onClose={() => setAdding(null)} />
      )}
      {adding?.type === 'question' && (
        <QuestionAddModal
          onAdd={(p, h) => handleAddQuestion(adding.chapterId, p, h)}
          onClose={() => setAdding(null)}
        />
      )}
      {editingCh && (
        <ChapterEditModal
          chapter={editingCh}
          onSave={(t) => handleEditChapter(editingCh.id, t)}
          onClose={() => setEditingCh(null)}
        />
      )}
      {editingQ && (
        <QuestionEditModal
          question={editingQ}
          onSave={(p, h) => handleEditQuestion(editingQ.id, p, h)}
          onClose={() => setEditingQ(null)}
        />
      )}
      {confirmDel && (
        <DeleteConfirmModal
          item={confirmDel}
          onDelete={(preserve) => {
            if (confirmDel.type === 'chapter') handleDeleteChapter(confirmDel.id, preserve);
            else handleDeleteQuestion(confirmDel.id, preserve);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ── modals ──
function ChapterAddModal({ onAdd, onClose }) {
  const [title, setTitle] = useState('');
  const [firstQ, setFirstQ] = useState('');
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>📖 챕터 추가</h3>
        <label>챕터 이름 *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 내 여행 이야기" autoFocus />
        <label>첫 질문 (선택)</label>
        <input value={firstQ} onChange={e => setFirstQ(e.target.value)} placeholder="예: 가장 기억에 남는 여행은?" />
        <div className={s.modalActions}>
          <button onClick={onClose}>취소</button>
          <button className={s.primaryBtn} disabled={!title.trim()} onClick={() => onAdd(title, firstQ)}>추가</button>
        </div>
      </div>
    </div>
  );
}

function ChapterEditModal({ chapter, onSave, onClose }) {
  const [title, setTitle] = useState(titleOf(chapter.title));
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>✏️ 챕터 수정</h3>
        <label>챕터 이름</label>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <div className={s.modalActions}>
          <button onClick={onClose}>취소</button>
          <button className={s.primaryBtn} disabled={!title.trim()} onClick={() => onSave(title)}>저장</button>
        </div>
      </div>
    </div>
  );
}

function QuestionAddModal({ onAdd, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [hint,   setHint]   = useState('');
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>📝 질문 추가</h3>
        <label>질문 *</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="예: 첫 차에 대한 추억은?" rows={3} autoFocus />
        <label>힌트 (선택)</label>
        <input value={hint} onChange={e => setHint(e.target.value)} placeholder="예: 색깔, 어떻게 샀는지" />
        <div className={s.modalActions}>
          <button onClick={onClose}>취소</button>
          <button className={s.primaryBtn} disabled={!prompt.trim()} onClick={() => onAdd(prompt, hint)}>추가</button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditModal({ question, onSave, onClose }) {
  const [prompt, setPrompt] = useState(titleOf(question.prompt));
  const [hint,   setHint]   = useState(titleOf(question.hint));
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>✏️ 질문 수정</h3>
        <label>질문</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} autoFocus />
        <label>힌트</label>
        <input value={hint} onChange={e => setHint(e.target.value)} />
        <div className={s.modalActions}>
          <button onClick={onClose}>취소</button>
          <button className={s.primaryBtn} disabled={!prompt.trim()} onClick={() => onSave(prompt, hint)}>저장</button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ item, onDelete, onClose }) {
  const isChapter = item.type === 'chapter';
  // Chapters reveal answered count separately; questions just check fragment_count.
  const hasContent = isChapter
    ? (item.answeredCount && item.answeredCount > 0)
    : (item.fragmentCount && item.fragmentCount > 0);

  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>🗑️ {isChapter ? '챕터' : '질문'} 삭제</h3>
        <p className={s.deletePrompt}>
          <strong>"{item.title}"</strong>{isChapter ? ' 챕터' : ''}을(를) 삭제하시겠어요?
        </p>
        {hasContent && (
          <div className={s.warningBox}>
            ⚠️ {isChapter
              ? `이 챕터에 답변된 질문이 ${item.answeredCount}개 있어요.`
              : `이 질문에 ${item.fragmentCount}개의 답변이 있어요.`}
            <br />
            답변을 어떻게 처리할까요?
          </div>
        )}
        <div className={s.modalActions}>
          <button onClick={onClose}>취소</button>
          {hasContent ? (
            <>
              <button onClick={() => onDelete(true)}>📥 답변 보존하고 삭제</button>
              <button className={s.dangerBtn} onClick={() => onDelete(false)}>🗑️ 답변과 함께 삭제</button>
            </>
          ) : (
            <button className={s.dangerBtn} onClick={() => onDelete(false)}>삭제</button>
          )}
        </div>
        {hasContent && (
          <p className={s.preserveNote}>
            "답변 보존"을 선택하면 답변은 자유 이야기 (My Stories)로 옮겨져요.
          </p>
        )}
      </div>
    </div>
  );
}
