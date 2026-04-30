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
import { BOOK_MSGS, fmt } from '@/lib/bookI18n';
import s from './page.module.css';

// Module-scoped wrapper so both the main component and the modal
// sub-components below can call titleOf(v) / msgs() without each one
// having to pipe `lang` through props. getUserLang() reads from
// localStorage on the client; the page is 'use client' so the SSR
// fallback ('ko') is never visible.
const titleOf = (v) => i18nTitleOf(v, getUserLang());
const msgs    = ()  => BOOK_MSGS[getUserLang()] || BOOK_MSGS.ko;

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

  const m = msgs();

  if (loading) return <div className={s.loading}>{m.loading}</div>;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push(`/book/${bookId}`)}>{m.backToBook}</button>
      </header>

      <h1 className={s.title}>{m.customizeHeader}</h1>
      <p className={s.intro}>
        {m.customizeIntro}<br />
        {m.customizeIntro2}
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
                <button onClick={() => setEditingCh(ch)} title={m.edit}>✏️</button>
                <button
                  onClick={() => setConfirmDel({
                    type: 'chapter',
                    id: ch.id,
                    title: titleOf(ch.title),
                    questionCount: (ch.questions || []).length,
                    answeredCount: (ch.questions || []).filter(q => q.response_status && q.response_status !== 'empty').length,
                  })}
                  title={m.delete}
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
                      <button onClick={() => setEditingQ({ ...q, chapterId: ch.id })} title={m.edit}>✏️</button>
                      <button
                        onClick={() => setConfirmDel({
                          type: 'question',
                          id: q.id,
                          title: titleOf(q.prompt),
                          fragmentCount: q.fragment_count || 0,
                        })}
                        title={m.delete}
                      >🗑️</button>
                    </div>
                  </div>
                ))}
                <button
                  className={s.addQuestionBtn}
                  onClick={() => setAdding({ type: 'question', chapterId: ch.id })}
                >
                  {m.addQuestion}
                </button>
              </div>
            )}
          </div>
        ))}

        <button className={s.addChapterBtn} onClick={() => setAdding({ type: 'chapter' })}>
          {m.addChapter}
        </button>
      </div>

      <div className={s.bottomActions}>
        <button className={s.doneBtn} onClick={() => router.push(`/book/${bookId}`)}>
          {m.saveAndBack}
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
  const m = msgs();
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>{m.addChapterTitle}</h3>
        <label>{m.chapterNameLabel}</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={m.chapterNameHolder} autoFocus />
        <label>{m.firstQuestionOpt}</label>
        <input value={firstQ} onChange={e => setFirstQ(e.target.value)} placeholder={m.firstQuestionHolder} />
        <div className={s.modalActions}>
          <button onClick={onClose}>{m.cancel}</button>
          <button className={s.primaryBtn} disabled={!title.trim()} onClick={() => onAdd(title, firstQ)}>{m.add}</button>
        </div>
      </div>
    </div>
  );
}

function ChapterEditModal({ chapter, onSave, onClose }) {
  const [title, setTitle] = useState(titleOf(chapter.title));
  const m = msgs();
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>{m.editChapterTitle}</h3>
        <label>{m.chapterName}</label>
        <input value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <div className={s.modalActions}>
          <button onClick={onClose}>{m.cancel}</button>
          <button className={s.primaryBtn} disabled={!title.trim()} onClick={() => onSave(title)}>{m.save}</button>
        </div>
      </div>
    </div>
  );
}

function QuestionAddModal({ onAdd, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [hint,   setHint]   = useState('');
  const m = msgs();
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>{m.addQuestionTitle}</h3>
        <label>{m.questionLabel}</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={m.questionHolder} rows={3} autoFocus />
        <label>{m.hintOptional}</label>
        <input value={hint} onChange={e => setHint(e.target.value)} placeholder={m.hintHolder} />
        <div className={s.modalActions}>
          <button onClick={onClose}>{m.cancel}</button>
          <button className={s.primaryBtn} disabled={!prompt.trim()} onClick={() => onAdd(prompt, hint)}>{m.add}</button>
        </div>
      </div>
    </div>
  );
}

function QuestionEditModal({ question, onSave, onClose }) {
  const [prompt, setPrompt] = useState(titleOf(question.prompt));
  const [hint,   setHint]   = useState(titleOf(question.hint));
  const m = msgs();
  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>{m.editQuestionTitle}</h3>
        <label>{m.questionLabelLite}</label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} autoFocus />
        <label>{m.hintLabel}</label>
        <input value={hint} onChange={e => setHint(e.target.value)} />
        <div className={s.modalActions}>
          <button onClick={onClose}>{m.cancel}</button>
          <button className={s.primaryBtn} disabled={!prompt.trim()} onClick={() => onSave(prompt, hint)}>{m.save}</button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ item, onDelete, onClose }) {
  const isChapter = item.type === 'chapter';
  const m = msgs();
  // Chapters reveal answered count separately; questions just check fragment_count.
  const hasContent = isChapter
    ? (item.answeredCount && item.answeredCount > 0)
    : (item.fragmentCount && item.fragmentCount > 0);
  const kind   = isChapter ? m.deleteChapter : m.deleteQuestion;
  const suffix = isChapter ? m.deleteSuffixCh : '';

  return (
    <div className={s.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <h3>{fmt(m.deleteTitle, { kind })}</h3>
        <p className={s.deletePrompt}>
          {fmt(m.deleteConfirmA, { title: item.title, suffix })}
        </p>
        {hasContent && (
          <div className={s.warningBox}>
            ⚠️ {isChapter
              ? fmt(m.deleteHasAnsweredCh, { n: item.answeredCount })
              : fmt(m.deleteHasFragments,  { n: item.fragmentCount })}
            <br />
            {m.deleteHowToHandle}
          </div>
        )}
        <div className={s.modalActions}>
          <button onClick={onClose}>{m.cancel}</button>
          {hasContent ? (
            <>
              <button onClick={() => onDelete(true)}>{m.deletePreserve}</button>
              <button className={s.dangerBtn} onClick={() => onDelete(false)}>{m.deleteWithAnswers}</button>
            </>
          ) : (
            <button className={s.dangerBtn} onClick={() => onDelete(false)}>{m.delete}</button>
          )}
        </div>
        {hasContent && (
          <p className={s.preserveNote}>
            {m.deletePreserveHint}
          </p>
        )}
      </div>
    </div>
  );
}
