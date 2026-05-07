'use client';

/**
 * PrintRequestModal — bottom-sheet form for requesting a printed copy.
 *
 * Strategy: STRATEGY-photobook-r2-print-request-2026-05-07.md §5.1
 *
 * Senior-friendly:
 *   - Big inputs (16px), big buttons (52px min-height)
 *   - White interior on dark scrim — older eyes prefer high-contrast text
 *     on a light surface
 *   - Pre-filled name from currentUser when available; no email field
 *     (server uses the authenticated user's email)
 *   - Beta notice spells out "free / 5–10 days / contact email" so the
 *     senior doesn't worry about hidden cost
 *   - Success view replaces the form with a clean ✅ panel + CTA back
 *
 * Props:
 *   photobookId  : UUID
 *   photobook    : { title, subtitle }
 *   currentUser  : { id, email, name } | null
 *   onClose()    : closes without submitting
 *   onSuccess()  : called after server returns 201 + user clicks the
 *                  "back to home" CTA
 */

import { useState } from 'react';
import { authFetch } from './photobookFetch';
import s from './PrintRequestModal.module.css';

export default function PrintRequestModal({
  photobookId,
  photobook,
  currentUser,
  onClose,
  onSuccess,
}) {
  const [form, setForm] = useState({
    recipient_name:       currentUser?.name  || '',
    recipient_phone:      '',
    shipping_address:     '',
    shipping_city:        '',
    shipping_state:       '',
    shipping_postal:      '',
    shipping_country:     'US',
    message_to_recipient: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(false);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    setError(null);
    if (!form.recipient_name.trim()) {
      setError('받는 분 이름을 입력해 주세요');
      return;
    }
    if (!form.shipping_address.trim()) {
      setError('배송 주소를 입력해 주세요');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(
        `/api/photobooks/${photobookId}/print-request`,
        { method: 'POST', body: JSON.stringify(form) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Server's Korean error messages already include the "이미 신청"
        // hint; just surface as-is.
        setError(data?.error || `신청 실패 (${res.status})`);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
    } catch (e) {
      setError(e?.message || '신청 중 오류가 발생했어요');
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className={s.overlay}>
        <div className={s.modal}>
          <div className={s.successContent}>
            <div className={s.successEmoji}>✅</div>
            <h2>신청 완료!</h2>
            <p>
              Tim 님이 검수 후<br />
              <strong>5–10일 안에</strong> 책을 보내드립니다.
            </p>
            <p className={s.muted}>문의: tim@thecollegiategrill.com</p>
            <button
              type="button"
              className={s.btnPrimary}
              onClick={() => onSuccess?.()}
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={s.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={s.modal} role="dialog" aria-modal="true">
        <header className={s.header}>
          <h2>📦 인쇄 신청</h2>
          <button
            type="button"
            className={s.closeBtn}
            onClick={onClose}
            aria-label="닫기"
            disabled={submitting}
          >✕</button>
        </header>

        <div className={s.body}>
          <div className={s.bookInfo}>
            <div className={s.bookTitle}>{photobook?.title || '제목 없음'}</div>
            {photobook?.subtitle && (
              <div className={s.bookSubtitle}>{photobook.subtitle}</div>
            )}
            <div className={s.bookSpec}>8×8 inch hardcover</div>
          </div>

          <Field label="받는 분 이름 *">
            <input
              type="text"
              className={s.input}
              value={form.recipient_name}
              onChange={(e) => update('recipient_name', e.target.value)}
              placeholder="예: 김할머니"
              autoComplete="off"
              maxLength={120}
            />
          </Field>

          <Field label="받는 분 전화번호">
            <input
              type="tel"
              className={s.input}
              value={form.recipient_phone}
              onChange={(e) => update('recipient_phone', e.target.value)}
              placeholder="예: 010-1234-5678"
              autoComplete="off"
              maxLength={32}
            />
          </Field>

          <Field label="배송 주소 *">
            <input
              type="text"
              className={s.input}
              value={form.shipping_address}
              onChange={(e) => update('shipping_address', e.target.value)}
              placeholder="예: 1234 Main St"
              autoComplete="street-address"
              maxLength={200}
            />
          </Field>

          <div className={s.row3}>
            <Field label="시 / 도시">
              <input
                type="text"
                className={s.input}
                value={form.shipping_city}
                onChange={(e) => update('shipping_city', e.target.value)}
                placeholder="Gainesville"
                autoComplete="address-level2"
              />
            </Field>
            <Field label="주 (State)">
              <input
                type="text"
                className={s.input}
                value={form.shipping_state}
                onChange={(e) => update('shipping_state', e.target.value)}
                placeholder="GA"
                autoComplete="address-level1"
              />
            </Field>
            <Field label="우편번호">
              <input
                type="text"
                className={s.input}
                value={form.shipping_postal}
                onChange={(e) => update('shipping_postal', e.target.value)}
                placeholder="30501"
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label="받는 분에게 한 마디 (선택)">
            <textarea
              className={s.textarea}
              value={form.message_to_recipient}
              onChange={(e) => update('message_to_recipient', e.target.value)}
              placeholder="예: 할머니 사랑해요"
              rows={3}
              maxLength={500}
            />
          </Field>

          <div className={s.notice}>
            <div className={s.noticeTitle}>ⓘ 베타 안내</div>
            <ul>
              <li>베타 기간 <strong>무료</strong> 입니다</li>
              <li>Tim 님이 검수 후 발주, <strong>5–10일</strong> 소요</li>
              <li>문의: tim@thecollegiategrill.com</li>
            </ul>
          </div>

          {error && <div className={s.error}>⚠️ {error}</div>}
        </div>

        <footer className={s.footer}>
          <button
            type="button"
            className={s.btnSecondary}
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '신청 중…' : '✓ 신청하기'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className={`${s.field}`}>
      <span className={s.label}>{label}</span>
      {children}
    </label>
  );
}
