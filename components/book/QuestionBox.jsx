'use client';

/**
 * QuestionBox — Sprint 2T (2026-05-13).
 *
 * 답변 페이지 (/chat?mode=book, /write?bookId=...) 상단에 question prompt
 * 를 box 디자인으로 표시. /book/[id]/question/[qId] 의 .promptBox 와 같은
 * visual 어휘 (orange tint + border + radius) — 시각 일관성.
 *
 * Tim 의 통찰 (2026-05-13): 시니어가 답변 페이지로 진입 후 "이 질문이 뭐였더라?"
 * 잊지 않도록. 자녀에게 묻지 못하는 시니어가 화면에서 직접 다시 확인할 수
 * 있어야 함 (스스로 사용 가능 원칙).
 *
 * Props:
 *   bookId         — 책 ID
 *   bookQuestionId — 질문 ID
 *   lang           — 'KO' | 'EN' | 'ES' (대소문자 무관)
 *
 * 내부에서 GET /api/book/${bookId}/question/${bookQuestionId} fetch.
 * 실패하거나 응답 없으면 조용히 null 반환 (UI 위협 X).
 */

import { useEffect, useState } from 'react';
import { BOOK_MSGS } from '@/lib/bookI18n';
import s from './QuestionBox.module.css';

// i18n title helper — 동일 패턴 reuse (titleOf 의 inline 버전).
function pickLang(v, lang) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  const l = String(lang || 'ko').toLowerCase();
  return v[l] || v.ko || v.en || v.es || '';
}

export default function QuestionBox({ bookId, bookQuestionId, lang = 'KO' }) {
  const [question, setQuestion] = useState(null);

  useEffect(() => {
    if (!bookId || !bookQuestionId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    let cancelled = false;
    fetch(`/api/book/${bookId}/question/${bookQuestionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.question) return;
        setQuestion(d.question);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bookId, bookQuestionId]);

  if (!question) return null;

  const m = BOOK_MSGS[String(lang).toLowerCase()] || BOOK_MSGS.ko;
  const prompt = pickLang(question.prompt, lang);
  const hint   = pickLang(question.hint, lang);
  const mins   = question.estimated_minutes;

  return (
    <div className={s.promptBox}>
      <div className={s.prompt}>{prompt}</div>
      {hint && (
        <div className={s.hint}>{m.hintPrefix} {hint}</div>
      )}
      {mins && (
        <div className={s.meta}>{m.minutesLabel} {mins} {m.minutesUnit}</div>
      )}
    </div>
  );
}
