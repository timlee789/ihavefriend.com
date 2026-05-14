'use client';

/**
 * /admin/orders — Tim's manual book fulfillment control panel.
 * Sprint 2AA (2026-05-13).
 *
 * Pairs with the Sprint 2Z webhook:
 *   Stripe payment ($139) → webhook → User.book_paid_at = NOW()
 *   Tim reviews here → POST fulfill → User.book_fulfilled_at = NOW()
 *   → Lulu Premium Color hardcover order placed manually
 *
 * Refund tracking is read-only (Webhook handles state changes).
 *
 * Moat #5 = Tim's hand-touch on every printed book. This UI keeps the
 * automation in Stripe + DB while preserving Tim's review step.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './page.module.css';

export default function AdminOrdersPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [orders, setOrders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u || u.role !== 'admin') {
      router.push('/login');
      return;
    }
    setToken(t);
    load(t);
  }, [router]);

  async function load(t) {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, refundsRes] = await Promise.all([
        fetch('/api/admin/orders', {
          headers: { Authorization: `Bearer ${t}` },
        }),
        fetch('/api/admin/refunds', {
          headers: { Authorization: `Bearer ${t}` },
        }),
      ]);
      const ordersData = await ordersRes.json();
      const refundsData = await refundsRes.json();
      if (!ordersRes.ok) throw new Error(ordersData?.error || 'orders_fetch_failed');
      if (!refundsRes.ok) throw new Error(refundsData?.error || 'refunds_fetch_failed');
      setOrders(ordersData.orders || []);
      setRefunds(refundsData.refunds || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFulfill(orderId, userEmail) {
    if (!confirm(`Tim 검수 완료 + Lulu 발주 시작?\n사용자: ${userEmail}`)) return;

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '오류');
        return;
      }
      alert(`✅ 검수 완료. ${userEmail} 에게 이메일 발송됨.`);
      load(token); // refresh
    } catch (err) {
      alert('처리 중 오류: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div className={s.page}>
        <header className={s.header}>
          <button className={s.backBtn} onClick={() => router.push('/admin')}>
            ← Admin
          </button>
          <h1 className={s.title}>📦 책 인쇄 주문</h1>
        </header>
        <div className={s.loading}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.page}>
        <header className={s.header}>
          <button className={s.backBtn} onClick={() => router.push('/admin')}>
            ← Admin
          </button>
          <h1 className={s.title}>📦 책 인쇄 주문</h1>
        </header>
        <div className={s.error}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/admin')}>
          ← Admin
        </button>
        <h1 className={s.title}>📦 책 인쇄 주문</h1>
      </header>

      {/* 검수 대기 list */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>검수 대기 ({orders.length})</h2>

        {orders.length === 0 ? (
          <p className={s.empty}>대기 중인 주문이 없습니다.</p>
        ) : (
          <ul className={s.orderList}>
            {orders.map((o) => (
              <li key={o.id} className={s.orderCard}>
                <div className={s.orderInfo}>
                  <div className={s.userInfo}>
                    <strong className={s.userName}>
                      {o.user_name || '(이름 미설정)'}
                    </strong>
                    <span className={s.email}>{o.user_email}</span>
                  </div>
                  <div className={s.orderMeta}>
                    <span>
                      결제:{' '}
                      {o.book_paid_at
                        ? new Date(o.book_paid_at).toLocaleDateString('ko-KR')
                        : '—'}
                    </span>
                    <span className={s.amount}>
                      ${(o.amount / 100).toFixed(2)} USD
                    </span>
                  </div>
                  {o.book_title && (
                    <div className={s.bookTitle}>
                      📘 {o.book_title}
                      {o.template_category && (
                        <span className={s.category}>
                          {' '}
                          (
                          {o.template_category === 'memoir'
                            ? '자서전'
                            : '이야기책'}
                          )
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className={s.actions}>
                  {o.book_id && (
                    <button
                      className={s.btnPdf}
                      onClick={() => router.push(`/book/${o.book_id}`)}
                    >
                      📄 책 보기
                    </button>
                  )}
                  <button
                    className={s.btnFulfill}
                    onClick={() => handleFulfill(o.id, o.user_email)}
                  >
                    ✅ Tim 검수 완료
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 환불 안내 */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>🛡️ 환불 안내</h2>
        <div className={s.refundGuide}>
          <p>사용자가 환불 요청 시 (mailto), 7 일 이내인 경우:</p>
          <ol>
            <li>Stripe Dashboard 의 Payment 찾기</li>
            <li>&quot;Refund&quot; 클릭 → full refund</li>
            <li>Webhook 이 자동 처리 (tier 복원, payments status=&apos;refunded&apos;)</li>
          </ol>
        </div>

        {refunds.length > 0 && (
          <>
            <h3 className={s.subTitle}>최근 환불 ({refunds.length})</h3>
            <ul className={s.refundList}>
              {refunds.map((r) => (
                <li key={r.id} className={s.refundCard}>
                  <div className={s.refundInfo}>
                    <span className={s.email}>{r.user_email}</span>
                    <span>
                      ${(r.amount / 100).toFixed(2)}{' '}
                      {r.product_type === 'premium' ? 'Premium' : 'Book'}
                    </span>
                  </div>
                  <span className={s.refundDate}>
                    {r.refunded_at
                      ? new Date(r.refunded_at).toLocaleDateString('ko-KR')
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
