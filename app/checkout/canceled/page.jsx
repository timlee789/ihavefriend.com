'use client';

/**
 * /checkout/canceled — Stripe Checkout 취소 후 redirect destination.
 * Sprint 2X (2026-05-13).
 *
 * Stripe Checkout 의 cancel_url:
 *   /checkout/canceled?type=premium  또는  /checkout/canceled?type=book
 *
 * 시니어 친화 안심 메시지 — "다시 시도하실 수 있어요". 무료 Trial
 * 사용도 그대로 가능. CSS 는 success/page.module.css 공유 (단일 source).
 */

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import s from '../success/page.module.css';

function CanceledInner() {
  const router = useRouter();
  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.icon}>💭</div>
        <h1 className={s.title}>결제가 취소되었어요</h1>
        <p className={s.message}>
          언제든 다시 시도하실 수 있어요.
        </p>
        <p className={s.subMessage}>
          무료 Trial 로 자서전을 미리 만들어 보실 수도 있어요.
        </p>
        <button
          className={s.ctaPrimary}
          onClick={() => router.push('/pricing')}
        >
          다시 시도하기
        </button>
        <button
          className={s.ctaSecondary}
          onClick={() => router.push('/')}
        >
          홈으로
        </button>
      </div>
    </div>
  );
}

export default function CheckoutCanceledPage() {
  return (
    <Suspense fallback={<div className={s.page}><div className={s.card} /></div>}>
      <CanceledInner />
    </Suspense>
  );
}
