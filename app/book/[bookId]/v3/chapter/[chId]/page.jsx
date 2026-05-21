'use client';

/**
 * /book/[bookId]/v3/chapter/[chId] — Chapter Entry V3 page.
 *
 * V2 의 /book/[bookId]/chapter/[chId] 와 동일한 API 호출.
 * 다른 UI 만 — V3 의 ChapterEntryV3 컴포넌트.
 *
 * V2 페이지는 그대로 유지. V3 는 별도 경로로 점진 전환.
 *
 * Step 2b (2026-05-19): refetch 함수 노출 — ChapterEntryV3 가 질문 추가/삭제/
 * 저장 후 chapter 데이터 부드럽게 갱신 (이전 window.location.reload 대체).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUserLang } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import ChapterEntryV3 from '@/components/chapter-entry-v3/ChapterEntryV3';

// V2 chapter detail API 는 status 를 안 줘서 questions 의 response_status 로 derive
function deriveStatus(questions) {
  const total = (questions || []).length;
  if (total === 0) return 'not_started';
  const completed = questions.filter(q => q.response_status === 'complete').length;
  if (completed === 0) return 'not_started';
  if (completed === total) return 'complete';
  return 'in_progress';
}

export default function ChapterEntryV3Page() {
  const router = useRouter();
  const { bookId, chId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);

  // Step 2b — refetch 함수. 질문 추가/저장 후 chapter 데이터 부드럽게 갱신.
  const refetchChapter = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    try {
      const res = await fetch(`/api/book/${bookId}/chapter/${chId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error('[chapter page refetch]', e);
    }
  }, [bookId, chId]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      try { sessionStorage.setItem('postLoginRedirect', window.location.pathname); } catch {}
      router.replace('/login');
      return;
    }
    refetchChapter().finally(() => setLoading(false));
  }, [router, refetchChapter]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;

  if (loading) return <div style={loadingStyle}>{m.loading}</div>;
  if (!data?.chapter) return <div style={loadingStyle}>{m.chapterNotFound}</div>;

  // V3 는 chapter.is_current 가 필요하지만 V2 /chapter API 는 반환 안 함
  //   — progress API 만 줌. status === 'in_progress' 일 때만 is_current = true 로
  //   강제하여 진행 중 챕터의 잎을 클릭한 사용자가 ★ 최근 작업 톤을 보도록.
  const chapterStatus = data.chapter.status || 'not_started';
  const derivedStatus = chapterStatus === 'not_started'
    ? deriveStatus(data.chapter.questions || [])
    : chapterStatus;

  const chapterWithStatus = {
    ...data.chapter,
    status: derivedStatus,
    is_current: derivedStatus === 'in_progress', // insight #30
  };

  return (
    <ChapterEntryV3
      bookId={bookId}
      chId={chId}
      book={data.book}
      chapter={chapterWithStatus}
      lang={lang}
      onChapterRefetch={refetchChapter}
    />
  );
}

const loadingStyle = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  color: '#5C4020',
  background: 'linear-gradient(180deg, #FFFAF0 0%, #F2E8D5 100%)',
};
