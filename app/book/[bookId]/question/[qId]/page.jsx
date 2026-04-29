'use client';

/**
 * /book/[bookId]/question/[qId] — single question detail.
 *
 * Stage 2 surface: read-only. The big "🎙️ 답변 시작하기" button is a
 * deliberate placeholder that lights up in Stage 3 when BookHelperChat
 * is wired in. Touches the book's last_question_id on mount so the
 * "resume where you left off" affordance on the overview page works.
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import s from './page.module.css';

function pickKo(value) {
  if (value && typeof value === 'object') return value.ko || value.en || value.es || '';
  return value || '';
}

export default function QuestionDetailPage() {
  const router = useRouter();
  const { bookId, qId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }

    // Fire-and-forget: stamp last visited question.
    fetch(`/api/book/${bookId}/touch-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: qId }),
    }).catch(() => {});

    fetch(`/api/book/${bookId}/question/${qId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, qId, router]);

  async function skip() {
    const token = localStorage.getItem('token');
    await fetch(`/api/book/${bookId}/skip-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId: qId }),
    }).catch(() => {});
    if (data?.navigation?.next_question_id) {
      router.push(`/book/${bookId}/question/${data.navigation.next_question_id}`);
    } else {
      router.push(`/book/${bookId}`);
    }
  }

  if (loading) return <div className={s.loading}>불러오는 중…</div>;
  if (!data?.question) return <div className={s.loading}>질문을 찾을 수 없어요.</div>;

  const { question, chapter, response, navigation } = data;
  const promptText  = pickKo(question.prompt);
  const hintText    = pickKo(question.hint);
  const chapterText = pickKo(chapter.title);

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button
          className={s.backBtn}
          onClick={() => router.push(`/book/${bookId}/chapter/${chapter.id}`)}
        >
          ← 챕터 {chapter.order}
        </button>
      </header>

      <div className={s.breadcrumb}>📖 챕터 {chapter.order}: {chapterText}</div>
      <div className={s.questionNum}>질문 {question.order}</div>

      <div className={s.promptBox}>
        <div className={s.prompt}>{promptText}</div>
        {hintText && (
          <div className={s.hint}>💡 떠올려보면 좋은 것: {hintText}</div>
        )}
        {question.estimated_minutes && (
          <div className={s.meta}>📝 권장 시간: 약 {question.estimated_minutes}분</div>
        )}
      </div>

      {response.status === 'complete' && response.fragments?.length > 0 && (
        <div className={s.existingResponses}>
          <div className={s.existingLabel}>📝 이전 답변</div>
          {response.fragments.map(f => (
            <div key={f.id} className={s.fragmentCard}>
              <div className={s.fragmentTitle}>{f.title || '답변'}</div>
              <div className={s.fragmentPreview}>
                {(f.content || '').substring(0, 150)}
                {(f.content || '').length > 150 ? '…' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={s.actions}>
        <button className={s.startBtn} disabled title="Stage 3에서 활성화">
          🎙️ 답변 시작하기 →
          <span className={s.comingSoon}>(곧 추가됩니다)</span>
        </button>

        <div className={s.secondaryActions}>
          {question.is_optional && (
            <button className={s.skipBtn} onClick={skip}>⏭️ 건너뛰기</button>
          )}
          {navigation.next_question_id && (
            <button
              className={s.skipBtn}
              onClick={() => router.push(`/book/${bookId}/question/${navigation.next_question_id}`)}
            >
              💭 다음 질문 보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
