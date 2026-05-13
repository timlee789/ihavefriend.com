'use client';

/**
 * /checkout/success — Stripe Checkout 성공 후 redirect destination.
 * Sprint 2X (2026-05-13).
 *
 * Stripe Checkout 의 success_url:
 *   /checkout/success?type=premium&session_id={CHECKOUT_SESSION_ID}
 *   /checkout/success?type=book&session_id={CHECKOUT_SESSION_ID}
 *
 * type 별 다른 메시지 + CTA:
 *   - premium: "결제 완료" + "내 이야기 시작하기" → /my-stories
 *   - book:    "책 인쇄 신청 완료" + Tim 검수 안내 → /
 *
 * ⚠️ Sprint 2X: webhook 미설정. 결제 직후 user.tier 자동 변경 X.
 *   payments.status='pending' 그대로. Sprint 2Y 의 webhook 가
 *   payment_intent.succeeded 받아 status='paid' + tier='premium' 처리.
 *   사용자에게는 "결제 완료" 표시 (Stripe 측 결제는 성공한 것).
 *
 * 시니어 친화 — 큰 글씨 / 큰 버튼 / warm beige (CSS 는 success/page.module.css).
 */

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import s from './page.module.css';

function SuccessInner() {
  const params = useSearchParams();
  const router = useRouter();
  const type = params.get('type'); // 'premium' or 'book'

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.icon}>🎉</div>
        <h1 className={s.title}>
          {type === 'book' ? '책 인쇄 신청 완료!' : '결제 완료!'}
        </h1>

        {type === 'premium' && (
          <>
            <p className={s.message}>
              SayAndKeep Premium 가입을 환영합니다.
            </p>
            <p className={s.subMessage}>
              이제 자서전과 이야기책을 자유롭게 만드실 수 있어요.{'\n'}
              6 개월 안에 책 인쇄도 신청 가능합니다.
            </p>
            <button
              className={s.ctaPrimary}
              onClick={() => router.push('/my-stories')}
            >
              내 이야기 시작하기
            </button>
            <button
              className={s.ctaSecondary}
              onClick={() => router.push('/')}
            >
              홈으로
            </button>
          </>
        )}

        {type === 'book' && (
          <>
            <p className={s.message}>
              책 인쇄 신청이 접수되었습니다.
            </p>
            <p className={s.subMessage}>
              Tim 이 책을 직접 검수한 후 Lulu Premium Color hardcover 로{'\n'}
              인쇄하여 우편으로 보내드릴게요.{'\n'}
              안내 이메일이 곧 도착합니다.
            </p>
            <div className={s.timeline}>
              예상 배송: 검수 + 인쇄 + 배송 ~ 2-3 주
            </div>
            <button
              className={s.ctaPrimary}
              onClick={() => router.push('/')}
            >
              홈으로
            </button>
          </>
        )}

        {/* type 미상 fallback (URL 직접 접근 등) */}
        {type !== 'premium' && type !== 'book' && (
          <>
            <p className={s.message}>결제가 완료되었습니다.</p>
            <button
              className={s.ctaPrimary}
              onClick={() => router.push('/')}
            >
              홈으로
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  // useSearchParams() requires Suspense in Next 15+ for static prerender.
  return (
    <Suspense fallback={<div className={s.page}><div className={s.card} /></div>}>
      <SuccessInner />
    </Suspense>
  );
}
