'use client';

/**
 * /book/[bookId]/chapter/[chId] — chapter detail.
 *
 * Lists every active question in the chapter with its response status
 * and a small fragment count. Each row routes to the question detail
 * page where the user will (in Stage 3) actually start a session.
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import s from './page.module.css';

const STATUS_ICON = {
  empty:    '🍃',
  drafting: '🌱',
  complete: '🍂',
  skipped:  '⏭️',
};
const STATUS_LABEL = {
  empty:    '시작 안 함',
  drafting: '진행 중',
  complete: '완성',
  skipped:  '건너뜀',
};

export default function ChapterDetailPage() {
  const router = useRouter();
  const { bookId, chId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    fetch(`/api/book/${bookId}/chapter/${chId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, chId, router]);

  if (loading) return <div className={s.loading}>불러오는 중…</div>;
  if (!data?.chapter) return <div className={s.loading}>챕터를 찾을 수 없어요.</div>;

  const { chapter } = data;
  const completed = chapter.questions.filter(q => q.response_status === 'complete').length;
  const total = chapter.questions.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push(`/book/${bookId}`)}>← 책 홈</button>
      </header>

      <h1 className={s.chapterTitle}>
        📖 챕터 {chapter.order}: {titleOf(chapter.title, lang)}
      </h1>

      <div className={s.progressBar}>
        <div className={s.progressFill} style={{ width: `${percent}%` }} />
      </div>
      <div className={s.progressText}>{percent}% ({completed} / {total})</div>

      {chapter.description && (
        <p className={s.description}>{titleOf(chapter.description, lang)}</p>
      )}

      <h2 className={s.sectionTitle}>질문 목록</h2>
      <div className={s.questionList}>
        {chapter.questions.map(q => {
          const status = q.response_status || 'empty';
          const rowCls = `${s.questionRow} ${s[`status_${status}`] || ''}`.trim();
          return (
            <div key={q.id} className={rowCls}>
              <div className={s.questionStatus}>{STATUS_ICON[status] || '🍃'}</div>
              <div className={s.questionInfo}>
                <div className={s.questionPrompt}>
                  {q.order}. {titleOf(q.prompt, lang)}
                </div>
                {q.fragment_count > 0 && (
                  <div className={s.questionMeta}>
                    답변 {q.fragment_count}개 · {STATUS_LABEL[status]}
                  </div>
                )}
                {q.is_optional && status === 'empty' && (
                  <div className={s.optionalBadge}>선택</div>
                )}
              </div>
              <button
                className={s.questionBtn}
                onClick={() => router.push(`/book/${bookId}/question/${q.id}`)}
              >
                {status === 'complete' ? '📖 보기' : '🎙️ 시작'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
