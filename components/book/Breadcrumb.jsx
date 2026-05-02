'use client';

/**
 * components/book/Breadcrumb.jsx  (Task 85)
 *
 * Tiny crumb trail for the 3-step book → chapter → question flow.
 * Tim's intent: a senior should always see "where am I?" without
 * memorizing the back-button stack.
 *
 * Each item is `{ label, href? }`:
 *   • href present → rendered as a clickable button that router.pushes
 *   • href missing → rendered as the current location (bold, no link)
 *
 * Rendering is opinionated and self-contained — no external i18n,
 * no template dependencies. Pages assemble the localized labels
 * themselves and hand them in.
 */

import { useRouter } from 'next/navigation';
import s from './Breadcrumb.module.css';

export default function Breadcrumb({ items = [] }) {
  const router = useRouter();
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <nav className={s.crumb} aria-label="breadcrumb">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const sep  = i > 0 ? <span className={s.sep} aria-hidden="true">›</span> : null;
        if (it.href && !last) {
          return (
            <span key={i} className={s.item}>
              {sep}
              <button
                type="button"
                className={s.link}
                onClick={() => router.push(it.href)}
              >
                {it.label}
              </button>
            </span>
          );
        }
        return (
          <span key={i} className={s.item}>
            {sep}
            <span className={`${s.current} ${last ? s.currentLast : ''}`} aria-current={last ? 'page' : undefined}>
              {it.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
