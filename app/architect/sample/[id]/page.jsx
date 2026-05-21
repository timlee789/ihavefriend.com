'use client';

/**
 * /architect/sample/[id] — Tim 큐레이션 시나리오 미리보기.
 *
 * URL parameter `[id]` 는 1-based 위치 (1..5) — 시니어 친화 short URL.
 * 내부에서 GET /api/architect/samples 의 sort_order 순서로 매핑.
 * 새 sample 추가/순서 변경되면 frontend 코드 수정 없이 자동 반영.
 *
 * Mount 시퀀스:
 *   1. auth gate
 *   2. GET /api/architect/current-book  → hasBook=true 면 즉시 redirect
 *      (Tim 정책: "유저는 하나의 자서전" — 6단계 안내 안 보이게)
 *   3. GET /api/architect/samples       → 위치 매핑용 list
 *   4. GET /api/architect/samples/[real id]  → structure 포함 상세
 *
 * "이 샘플로 시작" 클릭:
 *   POST /api/book/start { sampleId }
 *   - 200/201 → /book/[bookId]
 *   - 409 (race: 다른 탭에서 시작) → response.bookId 로 redirect
 *
 * Strategy: STRATEGY-architect-bot-final-V2-2026-05-08.md
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import s from './page.module.css';

const TOTAL_SAMPLES_HINT = 5; // displayed during loading; replaced by real list count

export default function ArchitectSampleViewPage() {
  const router = useRouter();
  const params = useParams();
  const positionParam = Number(params?.id);
  const position = Number.isFinite(positionParam) && positionParam > 0
    ? positionParam
    : 1;

  const [state, setState] = useState('checking');   // 'checking' | 'ready' | 'error'
  const [error, setError] = useState('');
  const [list, setList] = useState([]);             // ordered by sort_order
  const [sample, setSample] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Auth + load sequence ──
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      try { sessionStorage.setItem('postLoginRedirect', `/architect/sample/${position}`); } catch {}
      router.replace('/login');
      return;
    }

    let cancelled = false;
    (async () => {
      setState('checking');
      try {
        const auth = { Authorization: `Bearer ${token}` };

        // 1. Resume guard
        const cb = await fetch('/api/architect/current-book', { headers: auth });
        if (cancelled) return;
        if (cb.ok) {
          const cbData = await cb.json();
          if (cbData?.hasBook && cbData.book?.id) {
            router.replace(`/book/${cbData.book.id}/tree`);  // Milestone 5 Step 1 — V3 나무 직행
            return;
          }
        }

        // 2. List (for arrows + position mapping)
        const lr = await fetch('/api/architect/samples?language=ko', { headers: auth });
        if (cancelled) return;
        if (!lr.ok) {
          setError(`샘플 목록을 불러올 수 없어요 (${lr.status})`);
          setState('error');
          return;
        }
        const lj = await lr.json();
        const ordered = (lj.samples || []).slice().sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        );
        setList(ordered);

        // Resolve position → real id. Out-of-range positions clamp.
        const safePos = Math.max(1, Math.min(position, ordered.length || 1));
        const targetId = ordered[safePos - 1]?.id;
        if (!targetId) {
          setError('해당 샘플이 없어요');
          setState('error');
          return;
        }

        // If URL position was out of range, redirect to clamped value.
        if (safePos !== position) {
          router.replace(`/architect/sample/${safePos}`);
          return;
        }

        // 3. Detail (structure included)
        const dr = await fetch(`/api/architect/samples/${encodeURIComponent(targetId)}`, { headers: auth });
        if (cancelled) return;
        if (!dr.ok) {
          setError(`샘플 상세를 불러올 수 없어요 (${dr.status})`);
          setState('error');
          return;
        }
        const dj = await dr.json();
        setSample(dj.sample || null);
        setState('ready');
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || '오류가 발생했어요');
          setState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router, position]);

  // ── Navigation ──
  const total = list.length || TOTAL_SAMPLES_HINT;

  const goPrev = useCallback(() => {
    // Wrap: 1 → last (시니어가 막다른 끝 X)
    const next = position === 1 ? total : position - 1;
    router.push(`/architect/sample/${next}`);
  }, [position, total, router]);

  const goNext = useCallback(() => {
    // Wrap: last → 1
    const next = position === total ? 1 : position + 1;
    router.push(`/architect/sample/${next}`);
  }, [position, total, router]);

  // ── Start (POST /api/book/start) ──
  async function handleStart() {
    if (!sample?.id || submitting) return;
    setSubmitting(true);
    setError('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/book/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sampleId: sample.id }),
      });
      const data = await res.json().catch(() => ({}));
      // 200 created/resumed-by-sample, 201 (currently we return 200 either way),
      // 409 race against existing memoir — both shapes carry bookId.
      if ((res.ok || res.status === 409) && data?.bookId) {
        router.replace(`/book/${data.bookId}/tree`);  // Milestone 5 Step 1 — V3 나무 직행 (신규 생성/409 race 양쪽)
        return;
      }
      setError(data?.error || `시작할 수 없어요 (${res.status})`);
      setSubmitting(false);
    } catch (e) {
      setError(e?.message || '시작 중 오류가 발생했어요');
      setSubmitting(false);
    }
  }

  // ── Render ──
  if (state === 'checking') {
    return (
      <div className={s.page}>
        <div className={s.statusCard}>
          <div className={s.spinner} />
          <div className={s.statusMsg}>샘플을 불러오는 중…</div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={s.page}>
        <header className={s.header}>
          <button
            type="button"
            className={s.backBtn}
            onClick={() => router.push('/architect')}
            aria-label="개요로"
          >‹</button>
          <span className={s.backLabel}>개요로</span>
        </header>
        <div className={s.errorBox}>{error || '샘플을 불러올 수 없어요'}</div>
      </div>
    );
  }

  const chapters = sample?.structure?.chapters || [];

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          type="button"
          className={s.backBtn}
          onClick={() => router.push('/architect')}
          aria-label="개요로"
        >‹</button>
        <span className={s.backLabel}>개요로</span>
      </header>

      <div className={s.navBar}>
        <button
          type="button"
          className={s.navArrow}
          onClick={goPrev}
          aria-label="이전 샘플"
          disabled={total <= 1}
        >◀</button>
        <div className={s.navTitle}>
          {sample?.display_label || `목차 샘플 ${position}`}
          <span className={s.position}>{position} / {total}</span>
        </div>
        <button
          type="button"
          className={s.navArrow}
          onClick={goNext}
          aria-label="다음 샘플"
          disabled={total <= 1}
        >▶</button>
      </div>

      <div className={s.hint}>
        {`이 시나리오의 챕터들을 둘러보세요. 마음에 들면 아래 버튼을 누르세요.`}
      </div>

      <div className={s.chapters}>
        {chapters.map((ch, i) => (
          <div key={ch.id || i} className={s.chapter}>
            <div className={s.chapterIcon}>📕</div>
            <div className={s.chapterTitle}>
              {(i + 1) + '. ' + (ch.title?.ko || ch.title?.en || ch.title || '제목 없음')}
            </div>
            <div className={s.chapterMeta}>
              {ch.questions?.length || 0}개 질문
            </div>
          </div>
        ))}
      </div>

      {error && <div className={s.errorBox}>{error}</div>}

      <div className={s.ctaBar}>
        <button
          type="button"
          className={s.cta}
          onClick={handleStart}
          disabled={submitting || !sample?.id}
        >
          {submitting ? '준비 중…' : '✅ 이 샘플로 시작'}
        </button>
      </div>
    </div>
  );
}
